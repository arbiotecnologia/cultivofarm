import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

export interface ReprogramarMonitoramentoArgs {
  id: string;
  date: string;
  expectedUpdatedAt: string;
  /** Present only for alerts with a canonical origin visit; selects the reconciling v2 contract. */
  origemId?: string | null;
  expectedVisitVersion?: number | null;
  requestId?: string;
}

export class ReprogramacaoError extends Error {
  constructor(message: string, public readonly outcome: "rejected" | "uncertain") { super(message); }
}

const unavailable = "Não foi possível acessar este monitoramento. Atualize a lista e verifique seu acesso.";
const conflict = "Este monitoramento foi alterado. Atualize a lista antes de confirmar novamente; a data editada foi mantida.";
export const REPROGRAMACAO_ORIGEM_INDISPONIVEL = "A reprogramação de alertas com visita de origem ainda não está disponível. Nada foi alterado.";
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const isTimestamp = (v: unknown): v is string => typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(v) && Number.isFinite(Date.parse(v));
// The canonical client uses a captured schema without these RPCs; do not regenerate it.
type RpcResult = Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => RpcResult;

export function useReprogramarMonitoramento() {
  const fence = useStorageAccessScope("monitoramento-reprogramar");
  const actor = useStorageAccessScope("portal-query-actor");
  const qc = useQueryClient();
  const pending = useRef<symbol | null>(null);
  return useMutation({
    retry: false,
    mutationFn: async (args: ReprogramarMonitoramentoArgs) => {
      const valid = fence.capture();
      if (!valid()) throw new Error(unavailable);
      if (pending.current) throw new Error("A reprogramação já está em andamento.");
      // Preserve the exact server timestamp, including microseconds; never manufacture one.
      if (!isTimestamp(args.expectedUpdatedAt)) throw new Error(conflict);
      const withOrigin = args.origemId != null;
      if (withOrigin && (!isUuid(args.origemId) || !Number.isSafeInteger(args.expectedVisitVersion) ||
        (args.expectedVisitVersion ?? 0) <= 0)) throw new ReprogramacaoError(conflict, "rejected");
      if (withOrigin && !isUuid(args.requestId)) throw new ReprogramacaoError("Tentativa de reprogramação inválida.", "rejected");
      const ticket = Symbol("monitoramento-save");
      pending.current = ticket;
      try {
        const { data, error } = withOrigin
          ? await rpc("rpc_reprogramar_monitoramento_v2", {
            p_alerta_id: args.id, p_nova_data: args.date, p_expected_alert_updated_at: args.expectedUpdatedAt,
            p_expected_visit_version: args.expectedVisitVersion, p_request_id: args.requestId,
          })
          : await rpc("rpc_reprogramar_monitoramento_v1", {
            p_alerta_id: args.id, p_nova_data: args.date, p_expected_updated_at: args.expectedUpdatedAt,
          });
        if (!valid()) throw new Error(unavailable);
        if (error) {
          const code = error.code ?? "";
          // Do not expose whether a foreign UUID exists.
          if (["42501", "PT403", "PT404", "P0002", "403", "404"].includes(code)) throw new ReprogramacaoError(unavailable, "rejected");
          if (code === "PT409" || /conflict|conflito/i.test(error.message)) throw new ReprogramacaoError(conflict, "rejected");
          // Never fall back to a direct write or to v1 for an origin alert.
          if (code === "PT428" || (withOrigin && ["PGRST202", "42883"].includes(code))) throw new ReprogramacaoError(REPROGRAMACAO_ORIGEM_INDISPONIVEL, "rejected");
          if (withOrigin && code === "22023") throw new ReprogramacaoError("Confira a nova data. A data editada foi mantida.", "rejected");
          throw new ReprogramacaoError("Não foi possível reprogramar o monitoramento. A data editada foi mantida.", withOrigin ? "uncertain" : "rejected");
        }
        // Installed canonical envelope: a bare ID never confirms an update.
        const result = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
        const unconfirmed = () => new ReprogramacaoError("Resposta não confirmada. Verifique o monitoramento antes de tentar novamente.", "uncertain");
        if (!result || result.success !== true || !isUuid(result.alerta_id) || result.alerta_id !== args.id ||
          !isDate(result.nova_data) || result.nova_data !== args.date ||
          !(result.data_anterior === null || isDate(result.data_anterior))) throw unconfirmed();
        if (withOrigin) {
          if (Object.keys(result).length !== 9 || result.registro_origem_id !== args.origemId ||
            typeof result.visita_atualizada !== "boolean" || result.request_id !== args.requestId ||
            !isTimestamp(result.alerta_updated_at) ||
            result.visit_version !== (result.visita_atualizada ? (args.expectedVisitVersion as number) + 1 : args.expectedVisitVersion)) throw unconfirmed();
        } else if (Object.keys(result).length !== 5 || !(result.registro_origem_id === null || isUuid(result.registro_origem_id))) {
          throw unconfirmed();
        }
        if (!valid()) throw new Error(unavailable);
        void qc.invalidateQueries({ predicate: q => q.queryKey[0] === "alertas-monitoramento-gestor" && q.queryKey.at(-2) === actor.scope });
        if (withOrigin) void qc.invalidateQueries({ predicate: q => q.queryKey[0] === "visita-workspace" && q.queryKey[1] === args.origemId });
        return data;
      } finally {
        if (pending.current === ticket) pending.current = null;
      }
    },
  });
}
