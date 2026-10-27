import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

export interface ReprogramarMonitoramentoArgs {
  id: string;
  date: string;
  expectedUpdatedAt: string;
}

const unavailable = "Não foi possível acessar este monitoramento. Atualize a lista e verifique seu acesso.";
const conflict = "Este monitoramento foi alterado. Atualize a lista antes de confirmar novamente; a data editada foi mantida.";
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
// The canonical client uses a captured schema without this RPC; do not regenerate it.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: "rpc_reprogramar_monitoramento_v1", args: { p_alerta_id: string; p_nova_data: string; p_expected_updated_at: string },
) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;

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
      if (typeof args.expectedUpdatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(args.expectedUpdatedAt) || !Number.isFinite(Date.parse(args.expectedUpdatedAt))) throw new Error(conflict);
      const ticket = Symbol("monitoramento-save");
      pending.current = ticket;
      try {
        const { data, error } = await rpc("rpc_reprogramar_monitoramento_v1", {
          p_alerta_id: args.id, p_nova_data: args.date, p_expected_updated_at: args.expectedUpdatedAt,
        });
        if (!valid()) throw new Error(unavailable);
        if (error) {
          // Do not expose whether a foreign UUID exists.
          if (["42501", "PT403", "PT404", "P0002", "403", "404"].includes(error.code ?? "")) throw new Error(unavailable);
          if (error.code === "PT409" || /conflict|conflito/i.test(error.message)) throw new Error(conflict);
          throw new Error("Não foi possível reprogramar o monitoramento. A data editada foi mantida.");
        }
        // Installed canonical envelope: a bare ID never confirms an update.
        const result = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
        if (!result || Object.keys(result).length !== 5 || result.success !== true ||
          !isUuid(result.alerta_id) || result.alerta_id !== args.id ||
          !isDate(result.nova_data) || result.nova_data !== args.date ||
          !(result.data_anterior === null || isDate(result.data_anterior)) ||
          !(result.registro_origem_id === null || isUuid(result.registro_origem_id))) throw new Error("Resposta não confirmada. Verifique o monitoramento antes de tentar novamente.");
        if (!valid()) throw new Error(unavailable);
        void qc.invalidateQueries({ predicate: q => q.queryKey[0] === "alertas-monitoramento-gestor" && q.queryKey.at(-2) === actor.scope });
        return data;
      } finally {
        if (pending.current === ticket) pending.current = null;
      }
    },
  });
}