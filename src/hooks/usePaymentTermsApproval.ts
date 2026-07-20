import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PartnerOrderPaymentTerms {
  id: string;
  partner_order_id: string;
  payment_plan_id: string | null;
  plan_name_snapshot: string;
  plan_code_snapshot: string;
  discount_percent_snapshot: number;
  monthly_interest_percent_snapshot: number;
  months_count_snapshot: number;
  installment_count: number;
  first_due_date: string;
  interest_type_snapshot: string;
  table_amount: number;
  discount_amount: number;
  net_amount_after_discount: number;
  financial_interest_amount: number;
  final_amount: number;
  approval_status: "not_required" | "pending" | "approved" | "rejected";
  approved_by: string | null;
  approved_at: string | null;
  approval_notes: string | null;
}

export function usePartnerOrderPaymentTerms(partnerOrderId: string | null | undefined) {
  return useQuery({
    queryKey: ["partner-order-payment-terms", partnerOrderId],
    enabled: !!partnerOrderId,
    queryFn: async (): Promise<PartnerOrderPaymentTerms | null> => {
      const { data, error } = await (supabase as any)
        .from("partner_order_payment_terms")
        .select("*")
        .eq("partner_order_id", partnerOrderId)
        .maybeSingle();
      if (error) throw error;
      return data as PartnerOrderPaymentTerms | null;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, orderId: string) {
  qc.invalidateQueries({ queryKey: ["partner-order-payment-terms", orderId] });
  qc.invalidateQueries({ queryKey: ["partner-orders-admin"] });
}

export function useApprovePaymentTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: string; notes?: string }) => {
      const { data, error } = await (supabase as any).rpc("approve_b2b_payment_terms_secure", {
        p_partner_order_id: orderId,
        p_notes: notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => invalidate(qc, v.orderId),
  });
}

export function useRejectPaymentTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const { data, error } = await (supabase as any).rpc("reject_b2b_payment_terms_secure", {
        p_partner_order_id: orderId,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => invalidate(qc, v.orderId),
  });
}

export function useRequestPaymentTermsAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: string; notes: string }) => {
      const { data, error } = await (supabase as any).rpc(
        "request_b2b_payment_terms_adjustment_secure",
        { p_partner_order_id: orderId, p_notes: notes },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => invalidate(qc, v.orderId),
  });
}

export function useAddPaymentTermsNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, note }: { orderId: string; note: string }) => {
      const { data, error } = await (supabase as any).rpc("add_b2b_payment_terms_note_secure", {
        p_partner_order_id: orderId,
        p_note: note,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => invalidate(qc, v.orderId),
  });
}
