import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CommercialPaymentPlan {
  id: string;
  name: string;
  code: string;
  description: string | null;
  plan_type: "cash" | "short_term" | "medium_term" | "extended_term" | "harvest" | "custom";
  max_days: number;
  months_count: number;
  installment_count: number;
  discount_percent: number;
  monthly_interest_percent: number;
  interest_type: "none" | "simple" | "compound";
  requires_credit_approval: boolean;
  requires_guarantee: boolean;
  requires_financial_approval: boolean;
  minimum_order_amount: number | null;
  pricing_mode?: "discount_from_base" | "fixed_item_price" | "quote_only";
  active: boolean;
  sort_order: number;
}

/**
 * Fase 6 (correção): leitura operacional dos planos selecionáveis.
 * A tabela `commercial_payment_plans` não é mais legível por `authenticated`;
 * a RPC devolve apenas planos ativos e dentro da vigência, e somente para
 * perfis autorizados (administrador, financeiro, gestor_comercial, parceiro_b2b).
 */
export function useCommercialPaymentPlans(enabled = true) {
  return useQuery({
    queryKey: ["commercial-payment-plans", "selectable"],
    enabled,
    queryFn: async (): Promise<CommercialPaymentPlan[]> => {
      const { data, error } = await (supabase as any).rpc(
        "rpc_b2b_list_selectable_payment_plans",
      );
      if (error) throw error;
      return ((data ?? []) as any[]).map((p) => ({ ...p, active: true })) as CommercialPaymentPlan[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

