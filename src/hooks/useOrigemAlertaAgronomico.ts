import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

/** Agronomic alert as returned by the server list; type/risk are the alert's own values, never derived. */
export interface AlertaVinculavel {
  id: string; tipo_alerta: string; nivel_risco: string; status: string;
  data_vencimento: string | null; updated_at: string; descricao: string | null; registro_origem_id: string | null;
}
export class OrigemAlertaError extends Error {
  constructor(message: string, public readonly outcome: "rejected" | "uncertain" | "unavailable") { super(message); }
}
export const PLANO_PRIMEIRO = "Salve/revise primeiro o plano de monitoramento existente desta visita (plano, data e aviso coerentes). Nada foi alterado.";
export const ORIGEM_INDISPONIVEL = "O vínculo com alerta agronômico ainda não está disponível neste ambiente. Nada foi alterado.";
const unavailable = "Não foi possível acessar esta visita ou alerta. Verifique seu acesso.";
const conflict = "O alerta ou a visita foram alterados. Atualize antes de confirmar novamente.";
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const ts = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(v);
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
const absent = (code?: string) => code === "PGRST202" || code === "42883";

export function alertasVinculaveisKey(registroId: string, scope: string) { return ["alertas-vinculaveis", registroId, scope] as const; }

export function useAlertasVinculaveis(registroId: string, enabled: boolean) {
  const session = useStorageAccessScope(`alertas-vinculaveis:${registroId}`);
  const result = useQuery({
    queryKey: alertasVinculaveisKey(registroId, session.scope),
    enabled: enabled && session.ready && uuid(registroId),
    retry: false,
    staleTime: 15_000,
    queryFn: async ({ signal }): Promise<AlertaVinculavel[]> => {
      const current = session.capture();
      const assert = () => { if (!current() || signal.aborted) throw new OrigemAlertaError(unavailable, "rejected"); };
      assert();
      const { data, error } = await rpc("rpc_listar_alertas_vinculaveis_v1", { p_registro_id: registroId });
      assert();
      if (error) throw new OrigemAlertaError(absent(error.code) ? ORIGEM_INDISPONIVEL : unavailable, absent(error.code) ? "unavailable" : "rejected");
      if (!Array.isArray(data)) throw new OrigemAlertaError(unavailable, "rejected");
      return data.filter((a): a is AlertaVinculavel => !!a && typeof a === "object" && uuid((a as AlertaVinculavel).id) &&
        ts((a as AlertaVinculavel).updated_at) && typeof (a as AlertaVinculavel).tipo_alerta === "string" &&
        ((a as AlertaVinculavel).registro_origem_id === null || (a as AlertaVinculavel).registro_origem_id === registroId));
    },
  });
  return { ...result, data: session.ready ? result.data : undefined };
}

export interface VincularOrigemArgs { alerta: AlertaVinculavel; registroId: string; expectedVisitVersion: number; requestId: string }

export function useVincularOrigemAlerta(registroId: string) {
  const fence = useStorageAccessScope(`alerta-origem:${registroId}`);
  const qc = useQueryClient();
  const pending = useRef<symbol | null>(null);
  useEffect(() => () => { pending.current = null; }, [fence.scope]);
  const mutation = useMutation({
    retry: false,
    mutationFn: async (args: VincularOrigemArgs) => {
      const current = fence.capture();
      if (!current() || args.registroId !== registroId) throw new OrigemAlertaError(unavailable, "rejected");
      if (pending.current) throw new OrigemAlertaError("O vínculo já está em andamento.", "rejected");
      if (!Number.isSafeInteger(args.expectedVisitVersion) || args.expectedVisitVersion <= 0 || !ts(args.alerta.updated_at)) throw new OrigemAlertaError(conflict, "rejected");
      if (!uuid(args.requestId) || !uuid(args.alerta.id)) throw new OrigemAlertaError("Tentativa de vínculo inválida.", "rejected");
      const ticket = Symbol("origem"); pending.current = ticket;
      try {
        const { data, error } = await rpc("rpc_vincular_origem_alerta_v1", {
          p_alerta_id: args.alerta.id, p_registro_id: registroId,
          p_expected_alert_updated_at: args.alerta.updated_at, p_expected_visit_version: args.expectedVisitVersion,
          p_request_id: args.requestId,
        });
        if (!current()) throw new OrigemAlertaError(unavailable, "rejected");
        if (error) {
          const code = error.code ?? "";
          if (absent(code)) throw new OrigemAlertaError(ORIGEM_INDISPONIVEL, "unavailable");
          if (["42501", "PT403", "PT404", "P0002"].includes(code)) throw new OrigemAlertaError(unavailable, "rejected");
          if (code === "PT409" && /visit_already_has_origin_alert/.test(error.message)) throw new OrigemAlertaError("Esta visita já é origem de outro alerta aberto. Só um alerta pode sincronizar a data do plano.", "rejected");
          if (code === "PT409" && /origin_requires_saved_plan/.test(error.message)) throw new OrigemAlertaError(PLANO_PRIMEIRO, "rejected");
          if (code === "PT409") throw new OrigemAlertaError(conflict, "rejected");
          if (code === "22023" && /origin_date_mismatch/.test(error.message)) throw new OrigemAlertaError("A data do alerta difere da próxima avaliação desta visita. Reprograme o alerta para a mesma data antes de vincular.", "rejected");
          if (code === "22023") throw new OrigemAlertaError("Este alerta não pertence à mesma fazenda e talhão da visita.", "rejected");
          if (code === "P0001") throw new OrigemAlertaError("Este alerta não está mais aberto.", "rejected");
          throw new OrigemAlertaError("Não foi possível confirmar o vínculo. Tente novamente com a mesma tentativa.", "uncertain");
        }
        const r = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
        if (!r || Object.keys(r).length !== 7 || r.ok !== true || r.alerta_id !== args.alerta.id || r.registro_origem_id !== registroId ||
          r.tipo_alerta !== args.alerta.tipo_alerta || r.visit_version !== args.expectedVisitVersion ||
          r.request_id !== args.requestId || !ts(r.alerta_updated_at)) {
          throw new OrigemAlertaError("Resposta não confirmada. Verifique o alerta antes de tentar novamente.", "uncertain");
        }
        void qc.invalidateQueries({ predicate: q => q.queryKey[0] === "alertas-vinculaveis" && q.queryKey[1] === registroId });
        return r;
      } finally {
        if (pending.current === ticket) pending.current = null;
      }
    },
  });
  return { ...mutation, capture: fence.capture, ready: fence.ready, scope: fence.scope };
}
