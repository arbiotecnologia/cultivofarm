import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "./useStorageAccessScope";

export interface MonitoringPlan { items: string[]; frequency: string; triggers: string; next_date: string }
export interface SaveMonitoringPlanArgs { registroId: string; expectedVersion: number; plan: MonitoringPlan; requestId: string }
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const unavailable = "Não foi possível acessar esta visita. Verifique seu acesso.";
const conflict = "A visita foi alterada. Seu plano foi mantido; revise a visita antes de confirmar novamente.";
export class MonitoringPlanSaveError extends Error {
  constructor(message: string, public readonly outcome: "rejected" | "uncertain", public readonly code?: string) { super(message); }
}
export function useSalvarPlanoMonitoramento(registroId: string) {
  const fence = useStorageAccessScope(`visit-monitoring-plan:${registroId}`);
  const pending = useRef<{ ticket: symbol; controller: AbortController } | null>(null);
  useEffect(() => () => { pending.current?.controller.abort(); }, [fence.scope]);
  const mutation = useMutation({
    retry: false,
    mutationFn: async (args: SaveMonitoringPlanArgs) => {
      const current = fence.capture();
      if (!current() || args.registroId !== registroId) throw new Error(unavailable);
      if (pending.current) throw new Error("O salvamento já está em andamento.");
      if (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion <= 0) throw new Error(conflict);
      if (!uuid(args.requestId)) throw new Error("Tentativa de salvamento inválida.");
      const ticket = Symbol("plan-save"); const controller = new AbortController();
      pending.current = { ticket, controller };
      try {
        const { data, error } = await supabase.rpc("rpc_salvar_plano_monitoramento_visita_v1" as never, {
          p_registro_id: args.registroId, p_expected_version: args.expectedVersion,
          p_plano: args.plan, p_request_id: args.requestId,
        } as never).abortSignal(controller.signal);
        if (!current() || controller.signal.aborted) throw new Error(unavailable);
        if (error) {
          if (error.code === "PT409") throw new MonitoringPlanSaveError(conflict, "rejected", error.code);
          if (["42501", "PT403", "PT404", "P0002"].includes(error.code)) throw new MonitoringPlanSaveError(unavailable, "rejected", error.code);
          if (error.code === "22023") throw new MonitoringPlanSaveError("Confira a data e os dados do plano. A edição foi mantida.", "rejected", error.code);
          throw new MonitoringPlanSaveError("Não foi possível confirmar o plano. A edição foi mantida; tente novamente com a mesma tentativa.", "uncertain", error.code);
        }
        const r = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
        const p = r?.plano && typeof r.plano === "object" && !Array.isArray(r.plano) ? r.plano as Record<string, unknown> : null;
        if (!r || Object.keys(r).length !== 7 || r.ok !== true || r.registro_id !== args.registroId ||
          r.version !== args.expectedVersion + 1 || !uuid(r.aviso_id) || r.request_id !== args.requestId ||
          r.data_referencia !== args.plan.next_date || !p || Object.keys(p).length !== 4 ||
          p.frequency !== args.plan.frequency || p.triggers !== args.plan.triggers || p.next_date !== args.plan.next_date ||
          !Array.isArray(p.items) || JSON.stringify(p.items) !== JSON.stringify(args.plan.items)) {
          throw new MonitoringPlanSaveError("Resposta não confirmada. O plano editado foi mantido.", "uncertain");
        }
        return r;
      } finally {
        if (pending.current?.ticket === ticket) pending.current = null;
      }
    },
  });
  return { ...mutation, capture: fence.capture, ready: fence.ready, scope: fence.scope };
}