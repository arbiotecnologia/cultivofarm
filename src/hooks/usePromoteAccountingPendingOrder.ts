import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "./useStorageAccessScope";

export type PromotionErrorReason =
  | "accounting_pending" | "stale" | "not_pending" | "status" | "denied" | "not_installed" | "context_changed" | "unknown";

export function promotionErrorReason(err: unknown): PromotionErrorReason {
  const e = (err ?? {}) as { message?: string; code?: string };
  const msg = `${e.code ?? ""} ${e.message ?? ""}`;
  if (msg.includes("context_changed")) return "context_changed";
  if (msg.includes("C2_ACCOUNTING_PENDING")) return "accounting_pending";
  if (msg.includes("C2AP_STALE")) return "stale";
  // PT409 = conflito de negócio não retentável (substituiu 40001 no core, c2_business_conflicts_http409_20261026).
  if (e.code === "PT409") return "stale";
  if (msg.includes("C2AP_NOT_PENDING")) return "not_pending";
  if (msg.includes("C2AP_STATUS_DENIED")) return "status";
  if (msg.includes("C2AP_ORDER_DENIED") || msg.includes("auth_required")) return "denied";
  if (msg.includes("PGRST202") || msg.includes("42883")) return "not_installed";
  return "unknown";
}

export const PROMOTION_ERROR_TEXT: Record<PromotionErrorReason, string> = {
  accounting_pending: "A contabilidade da empresa ainda não está validada no servidor. Regularize o cadastro fiscal antes de liberar.",
  stale: "O pedido mudou desde que foi aberto. Feche e abra novamente para conferir a versão atual.",
  not_pending: "Este pedido não está mais aguardando validação contábil.",
  status: "A situação atual do pedido não permite a liberação contábil.",
  denied: "Você não tem autorização para liberar este pedido.",
  not_installed: "A liberação contábil ainda não está disponível no servidor.",
  context_changed: "Sua sessão ou empresa mudou durante a operação. Confira o pedido antes de tentar de novo.",
  unknown: "Não foi possível confirmar a liberação. Confira o pedido antes de tentar de novo.",
};

/** Única transição pendente→V1; o servidor decide (CAS, mesma empresa, emissor validado). */
export function usePromoteAccountingPendingOrder() {
  const qc = useQueryClient();
  const scope = useStorageAccessScope("partner-order-accounting-promotion");
  return useMutation({
    onMutate: () => ({ current: scope.capture() }),
    mutationFn: async (vars: { order_id: string; expected_updated_at: string }) => {
      const current = scope.capture();
      if (!current()) throw new Error("context_changed");
      if (!vars.order_id || !vars.expected_updated_at) throw new Error("C2AP_STALE");
      const rpc = supabase.rpc as unknown as (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>;
      const { data, error } = await rpc.call(supabase, "c2_promote_accounting_pending_order_v1", {
        p_order_id: vars.order_id, p_expected_updated_at: vars.expected_updated_at,
      });
      if (!current()) throw new Error("context_changed");
      if (error) throw error;
      const res = data as { order_id?: string; contract?: string } | null;
      if (res?.order_id !== vars.order_id || res?.contract !== "C2_EXTERNAL_ORDER_ORIGIN_V1") throw new Error("promotion_unconfirmed");
      return res;
    },
    onSettled: (_d, _e, _v, context) => {
      if (!context?.current()) return;
      void qc.invalidateQueries({ queryKey: ["partner-orders-admin"] });
      void qc.invalidateQueries({ queryKey: ["partner-orders"] });
    },
  });
}
