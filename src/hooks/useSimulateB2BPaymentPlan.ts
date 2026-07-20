import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SimulateInput {
  partner_id: string;
  payment_plan_id: string;
  items: Array<{
    item_id: string;
    item_tipo: "produto" | "microrganismo";
    quantidade: number;
    unidade_medida: "hectare" | "litro" | "dose" | "unidade";
    volume_ml?: number | null;
  }>;
  first_due_date?: string | null;
}

export interface SimulateScheduleRow {
  installment_number: number;
  due_date: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
}

export interface SimulateResult {
  partner_id: string;
  payment_plan: {
    id: string;
    name: string;
    code: string;
    discount_percent: number;
    monthly_interest_percent: number;
    months_count: number;
    installment_count: number;
    requires_financial_approval: boolean;
    requires_credit_approval: boolean;
    requires_guarantee: boolean;
  };
  amounts: {
    table_amount: number;
    discount_amount: number;
    net_amount_after_discount: number;
    financial_interest_amount: number;
    final_amount: number;
  };
  schedule: SimulateScheduleRow[];
  warnings: string[];
}

export function useSimulateB2BPaymentPlan() {
  return useMutation({
    mutationFn: async (input: SimulateInput): Promise<SimulateResult> => {
      const { data, error } = await (supabase.rpc as any)("simulate_b2b_payment_plan_secure", {
        p_partner_id: input.partner_id,
        p_payment_plan_id: input.payment_plan_id,
        p_items: input.items,
        p_first_due_date: input.first_due_date ?? null,
      });
      if (error) throw error;
      return data as SimulateResult;
    },
  });
}
