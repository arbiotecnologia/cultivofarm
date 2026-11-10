import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";

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

export type PaymentTermsRead =
  | { state: "present"; terms: PartnerOrderPaymentTerms }
  /** Ausência confirmada pelo leitor canônico do servidor. */
  | { state: "absent" }
  /** Pré-instalação: leitura direta sem linha NÃO prova ausência (RLS pode filtrar) — mostrar indisponível. */
  | { state: "unverified" };

export interface OrderPaymentCondition {
  due_basis: "nf_issue";
  estimated: true;
  installment_count: number;
  monthly_rate: number;
  payment_method_name: string;
}

export function parseOrderPaymentCondition(data: unknown, orderId: string): OrderPaymentCondition | null {
  const d = data as Record<string, unknown> | null;
  if (!d || d.contract !== "B2B_PAYMENT_CONDITION_V1" || d.order_id !== orderId || typeof d.present !== "boolean")
    throw new Error("payment_condition_contract_invalid");
  if (!d.present) {
    if (d.payment_condition != null) throw new Error("payment_condition_contract_invalid");
    return null;
  }
  const c = d.payment_condition as OrderPaymentCondition | null;
  if (!c || c.due_basis !== "nf_issue" || c.estimated !== true || !Number.isInteger(c.installment_count) ||
      c.installment_count < 1 || !Number.isFinite(c.monthly_rate) || c.monthly_rate < 0 || typeof c.payment_method_name !== "string")
    throw new Error("payment_condition_contract_invalid");
  return c;
}

/** Leitor V1 já instalado: mesmas portas servidor dos termos, sem consulta de tabela privada. */
export function usePartnerOrderPaymentCondition(orderId: string) {
  return useScopedPortalQuery<OrderPaymentCondition | null>({
    queryKey: ["partner-order-payment-condition", orderId],
    enabled: !!orderId,
    queryFn: async (signal) => {
      const endpoint = "get_partner_order_payment_condition_secure";
      const { data, error } = await (supabase.rpc as any)(endpoint, { p_order_id: orderId }).abortSignal(signal);
      if (error) {
        if (error.code === "PGRST202" && typeof error.message === "string" &&
            error.message.includes(`public.${endpoint}(p_order_id)`)) return null;
        throw error;
      }
      return parseOrderPaymentCondition(data, orderId);
    },
  });
}

export type PaymentConditionRead =
  | { state: "present"; condition: OrderPaymentCondition }
  | { state: "absent" }
  /** Leitor não instalado (PGRST202 exato): nunca equivale a "sem condição". */
  | { state: "reader_unavailable" };

/** Leitura discriminada para listas: separa ausência confirmada pelo servidor de leitor indisponível. */
export function usePartnerOrderPaymentConditionRead(orderId: string) {
  return useScopedPortalQuery<PaymentConditionRead>({
    queryKey: ["partner-order-payment-condition-read", orderId],
    enabled: !!orderId,
    queryFn: async (signal) => {
      const endpoint = "get_partner_order_payment_condition_secure";
      const { data, error } = await (supabase.rpc as any)(endpoint, { p_order_id: orderId }).abortSignal(signal);
      if (error) {
        if (error.code === "PGRST202" && typeof error.message === "string" &&
            error.message.includes(`public.${endpoint}(p_order_id)`)) return { state: "reader_unavailable" };
        throw error;
      }
      const c = parseOrderPaymentCondition(data, orderId);
      return c ? { state: "present", condition: c } : { state: "absent" };
    },
  });
}

const READER = "get_partner_order_payment_terms_secure";
const CONTRACT = "B2B_ORDER_PAYMENT_TERMS_READ_V1";

function isReaderAbsent(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return !!e && e.code === "PGRST202" && typeof e.message === "string" &&
    e.message.includes(`public.${READER}(p_order_id)`);
}

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
function parseTerms(t: unknown, orderId: string): PartnerOrderPaymentTerms {
  const x = t as Record<string, unknown> | null;
  if (!x || typeof x !== "object" || x.partner_order_id !== orderId || typeof x.id !== "string" ||
      typeof x.plan_name_snapshot !== "string" || !num(x.final_amount) || !num(x.table_amount) ||
      typeof x.approval_status !== "string") throw new Error("payment_terms_contract_invalid");
  return { approved_by: null, ...(x as unknown as PartnerOrderPaymentTerms) };
}

/** Exportado para teste: interpreta a resposta do leitor canônico estritamente. */
export function parsePaymentTermsReply(data: unknown, orderId: string): PaymentTermsRead {
  const d = data as Record<string, unknown> | null;
  if (!d || d.contract !== CONTRACT || d.order_id !== orderId || typeof d.present !== "boolean")
    throw new Error("payment_terms_contract_invalid");
  if (!d.present) { if (d.terms != null) throw new Error("payment_terms_contract_invalid"); return { state: "absent" }; }
  return { state: "present", terms: parseTerms(d.terms, orderId) };
}

/**
 * Condição de pagamento de UM pedido via leitor canônico (pedido+tenant+papel no servidor), com cache/respostas
 * cercados pelo escopo de auth. Erro => indisponível (nunca "sem condição"). Fallback de leitura direta só na
 * ausência exata do RPC (PGRST202 nomeando o endpoint), e sem linha ali vira "unverified".
 */
export function usePartnerOrderPaymentTerms(partnerOrderId: string | null | undefined) {
  return useScopedPortalQuery<PaymentTermsRead>({
    queryKey: ["partner-order-payment-terms", partnerOrderId],
    enabled: !!partnerOrderId,
    queryFn: async (signal) => {
      const orderId = partnerOrderId as string;
      const { data, error } = await (supabase.rpc as any)(READER, { p_order_id: orderId }).abortSignal(signal);
      if (!error) return parsePaymentTermsReply(data, orderId);
      if (!isReaderAbsent(error)) throw error;
      const legacy = await (supabase as any).from("partner_order_payment_terms").select("*")
        .eq("partner_order_id", orderId).abortSignal(signal).maybeSingle();
      if (legacy.error) throw legacy.error;
      return legacy.data ? { state: "present", terms: parseTerms(legacy.data, orderId) } : { state: "unverified" };
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
