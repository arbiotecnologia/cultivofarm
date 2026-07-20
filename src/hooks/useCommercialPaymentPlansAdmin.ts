import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CommercialPaymentPlan } from "./useCommercialPaymentPlans";

export interface CommercialPaymentPlanFull extends CommercialPaymentPlan {
  created_at?: string;
  updated_at?: string;
}

export function useAllCommercialPaymentPlans() {
  return useQuery({
    queryKey: ["commercial-payment-plans", "all"],
    queryFn: async (): Promise<CommercialPaymentPlanFull[]> => {
      const { data, error } = await (supabase as any)
        .from("commercial_payment_plans")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CommercialPaymentPlanFull[];
    },
  });
}

export type PaymentPlanInput = Omit<CommercialPaymentPlanFull, "id" | "created_at" | "updated_at"> & { id?: string };

async function logAudit(acao: string, planId: string, dados: any) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase as any).from("partner_order_audit_logs").insert({
      order_id: null,
      acao,
      usuario_id: user?.id ?? null,
      dados_novos: { plan_id: planId, ...dados },
    });
  } catch (e) {
    console.warn("audit log failed", e);
  }
}

export function useSavePaymentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentPlanInput) => {
      const { id, ...rest } = input;
      if (id) {
        const { data, error } = await (supabase as any)
          .from("commercial_payment_plans")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        await logAudit("commercial_payment_plan_updated", id, rest);
        return data;
      } else {
        const { data, error } = await (supabase as any)
          .from("commercial_payment_plans")
          .insert(rest)
          .select()
          .single();
        if (error) throw error;
        await logAudit("commercial_payment_plan_created", data.id, rest);
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commercial-payment-plans"] });
    },
  });
}

export function useTogglePaymentPlanActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await (supabase as any)
        .from("commercial_payment_plans")
        .update({ active })
        .eq("id", id);
      if (error) throw error;
      await logAudit(active ? "commercial_payment_plan_activated" : "commercial_payment_plan_deactivated", id, { active });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial-payment-plans"] }),
  });
}

export function useDeletePaymentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // check usage
      const { count, error: cErr } = await (supabase as any)
        .from("partner_order_payment_terms")
        .select("id", { count: "exact", head: true })
        .eq("payment_plan_id", id);
      if (cErr) throw cErr;
      if ((count ?? 0) > 0) {
        throw new Error("plan_in_use");
      }
      const { error } = await (supabase as any)
        .from("commercial_payment_plans")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await logAudit("commercial_payment_plan_deleted", id, {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial-payment-plans"] }),
  });
}
