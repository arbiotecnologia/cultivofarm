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
  active: boolean;
  sort_order: number;
}

export function useCommercialPaymentPlans(enabled = true) {
  return useQuery({
    queryKey: ["commercial-payment-plans"],
    enabled,
    queryFn: async (): Promise<CommercialPaymentPlan[]> => {
      const { data, error } = await (supabase as any)
        .from("commercial_payment_plans")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CommercialPaymentPlan[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
