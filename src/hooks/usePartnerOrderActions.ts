import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStorageAccessScope } from "./useStorageAccessScope";

export function useApprovePartnerOrder() {
  const qc = useQueryClient();
  const scope = useStorageAccessScope("partner-order-mutation");
  return useMutation({
    onMutate: () => ({ current: scope.capture() }),
    mutationFn: async (vars: {
      order_id: string;
      approval_notes?: string;
      estimated_delivery_date?: string | null;
    }) => {
      const current = scope.capture();
      if (!current()) throw new Error("Contexto indisponível.");
      const { error } = await supabase.rpc("approve_partner_order" as any, {
        p_order_id: vars.order_id,
        p_approval_notes: vars.approval_notes ?? null,
        p_estimated_delivery_date: vars.estimated_delivery_date ?? null,
      });
      if (!current()) throw new Error("Contexto alterado.");
      if (error) throw error;
    },
    onSuccess: (_data, _variables, context) => {
      if (!context?.current()) return;
      qc.invalidateQueries({ queryKey: ["partner-orders"] });
      qc.invalidateQueries({ queryKey: ["partner-orders-admin"] });
    },
    // Toasts são padronizados no chamador via b2bToast.
  });
}

export function useRequestPartnerOrderItems() {
  const qc = useQueryClient();
  const scope = useStorageAccessScope("partner-order-mutation");
  return useMutation({
    onMutate: () => ({ current: scope.capture() }),
    mutationFn: async (vars: { order_id: string; motivo: string }) => {
      const current = scope.capture();
      if (!current()) throw new Error("Contexto indisponível.");
      const { error } = await supabase.rpc("request_partner_order_items" as any, {
        p_order_id: vars.order_id,
        p_motivo: vars.motivo,
      });
      if (!current()) throw new Error("Contexto alterado.");
      if (error) throw error;
    },
    onSuccess: (_data, _variables, context) => {
      if (!context?.current()) return;
      qc.invalidateQueries({ queryKey: ["partner-orders"] });
      qc.invalidateQueries({ queryKey: ["partner-orders-admin"] });
    },
  });
}


export function useRejectPartnerOrder() {
  const qc = useQueryClient();
  const scope = useStorageAccessScope("partner-order-mutation");
  return useMutation({
    onMutate: () => ({ current: scope.capture() }),
    mutationFn: async (vars: { order_id: string; approval_notes: string }) => {
      const current = scope.capture();
      if (!current()) throw new Error("Contexto indisponível.");
      const { error } = await supabase.rpc("reject_partner_order" as any, {
        p_order_id: vars.order_id,
        p_approval_notes: vars.approval_notes,
      });
      if (!current()) throw new Error("Contexto alterado.");
      if (error) throw error;
    },
    onSuccess: (_data, _variables, context) => {
      if (!context?.current()) return;
      qc.invalidateQueries({ queryKey: ["partner-orders"] });
      qc.invalidateQueries({ queryKey: ["partner-orders-admin"] });
    },
    // Toasts são padronizados no chamador via b2bToast.
  });
}


export function useSetDeliveryDate() {
  const qc = useQueryClient();
  const scope = useStorageAccessScope("partner-order-mutation");
  return useMutation({
    onMutate: () => ({ current: scope.capture() }),
    mutationFn: async (vars: { order_id: string; estimated_delivery_date: string }) => {
      const current = scope.capture();
      if (!current()) throw new Error("Contexto indisponível.");
      const { error } = await supabase.rpc("set_partner_order_delivery_date" as any, {
        p_order_id: vars.order_id,
        p_estimated_delivery_date: vars.estimated_delivery_date,
      });
      if (!current()) throw new Error("Contexto alterado.");
      if (error) throw error;
    },
    onSuccess: (_data, _variables, context) => {
      if (!context?.current()) return;
      qc.invalidateQueries({ queryKey: ["partner-orders"] });
      qc.invalidateQueries({ queryKey: ["partner-orders-admin"] });
      toast.success("Previsão de entrega atualizada");
    },
    onError: (e: any, _variables, context) => { if (context?.current()) toast.error(e?.message ?? "Erro ao atualizar previsão"); },
  });
}

export function useUpdateCommercialNotes() {
  const qc = useQueryClient();
  const scope = useStorageAccessScope("partner-order-mutation");
  return useMutation({
    onMutate: () => ({ current: scope.capture() }),
    mutationFn: async (vars: { order_id: string; commercial_notes: string }) => {
      const current = scope.capture();
      if (!current()) throw new Error("Contexto indisponível.");
      const { error } = await supabase.rpc("update_partner_order_notes" as any, {
        p_order_id: vars.order_id,
        p_commercial_notes: vars.commercial_notes,
      });
      if (!current()) throw new Error("Contexto alterado.");
      if (error) throw error;
    },
    onSuccess: (_data, _variables, context) => {
      if (!context?.current()) return;
      qc.invalidateQueries({ queryKey: ["partner-orders"] });
      qc.invalidateQueries({ queryKey: ["partner-orders-admin"] });
      toast.success("Observações atualizadas");
    },
    onError: (e: any, _variables, context) => { if (context?.current()) toast.error(e?.message ?? "Erro ao atualizar observações"); },
  });
}
