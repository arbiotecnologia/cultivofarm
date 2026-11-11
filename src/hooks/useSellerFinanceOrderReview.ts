import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";

export const SELLER_FINANCE_REVIEW_ENDPOINT = "get_b2b_seller_finance_order_review_v1";
const CONTRACT = "B2B_SELLER_FINANCE_ORDER_REVIEW_V1";
export const SELLER_FINANCE_REVIEW_KEY = "b2b-seller-finance-order-review";

export type RejectBlockReason =
  | "terms_absent" | "accounting_pending" | "origin_invalid" | "terms_not_required"
  | "terms_decided" | "commercial_approved" | "order_closed" | "reserved";

export interface SellerFinanceReviewItem {
  id: string; produto_nome: string; produto_codigo: string | null; embalagem: string | null;
  quantidade: number; unidade: string | null; preco_unitario: number; subtotal: number;
}
export interface SellerFinanceReview {
  order_id: string; numero: string; status: string; created_at: string;
  accounting_pending: boolean;
  header_financial: { financial_approval_status: string | null; requires_financial_approval: boolean | null };
  items: SellerFinanceReviewItem[];
  terms: null | {
    id: string; plan_name_snapshot: string; plan_code_snapshot: string; installment_count: number;
    table_amount: number; final_amount: number;
    approval_status: "not_required" | "pending" | "approved" | "rejected";
    approved_at: string | null; approval_notes: string | null;
  };
  reject_eligible: boolean;
  reject_block_reason: RejectBlockReason | null;
  terms_review_path: "new_order_with_financial_approval_plan" | null;
}
export type SellerFinanceReviewRead =
  | { state: "ready"; review: SellerFinanceReview }
  /** Leitor não instalado (PGRST202 exato): nunca equivale a pedido vazio. */
  | { state: "reader_unavailable" };

const REASONS: RejectBlockReason[] = ["terms_absent", "accounting_pending", "origin_invalid", "terms_not_required",
  "terms_decided", "commercial_approved", "order_closed", "reserved"];
const STATUSES = ["not_required", "pending", "approved", "rejected"];
const n = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Interpretação estrita: qualquer divergência falha fechada (indisponível), nunca vazio. */
export function parseSellerFinanceReview(data: unknown, orderId: string): SellerFinanceReview {
  const d = data as Record<string, any> | null;
  const bad = () => { throw new Error("seller_finance_review_contract_invalid"); };
  if (!d || d.contract !== CONTRACT || d.order_id !== orderId || d.origin !== "external_partner" ||
      typeof d.numero !== "string" || typeof d.accounting_pending !== "boolean" ||
      typeof d.reject_eligible !== "boolean" || !Array.isArray(d.items) || !d.header_financial) bad();
  for (const i of d!.items) if (!i || typeof i.id !== "string" || typeof i.produto_nome !== "string" ||
      !n(i.quantidade) || !n(i.subtotal)) bad();
  const t = d!.terms;
  if (t !== null && (!t || typeof t.id !== "string" || !STATUSES.includes(t.approval_status) || !n(t.final_amount))) bad();
  if (d!.reject_eligible) {
    if (d!.reject_block_reason !== null || t?.approval_status !== "pending" || d!.accounting_pending) bad();
  } else if (!REASONS.includes(d!.reject_block_reason)) bad();
  if (d!.terms_review_path !== null && d!.terms_review_path !== "new_order_with_financial_approval_plan") bad();
  return d as unknown as SellerFinanceReview;
}

export function useSellerFinanceOrderReview(orderId: string | null) {
  return useScopedPortalQuery<SellerFinanceReviewRead>({
    queryKey: [SELLER_FINANCE_REVIEW_KEY, orderId],
    enabled: !!orderId,
    queryFn: async (signal) => {
      const { data, error } = await (supabase.rpc as any)(SELLER_FINANCE_REVIEW_ENDPOINT, { p_order_id: orderId }).abortSignal(signal);
      if (error) {
        if (error.code === "PGRST202" && typeof error.message === "string" &&
            error.message.includes(`public.${SELLER_FINANCE_REVIEW_ENDPOINT}(p_order_id)`)) return { state: "reader_unavailable" };
        throw error;
      }
      return { state: "ready", review: parseSellerFinanceReview(data, orderId as string) };
    },
  });
}

/** Usa exclusivamente o writer de rejeição já instalado; nenhum retry automático. */
export function useSellerFinanceReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const { data, error } = await (supabase as any).rpc("reject_b2b_payment_terms_secure", {
        p_partner_order_id: orderId, p_reason: reason,
      });
      if (error) throw error;
      if (!data || data.success !== true || data.status !== "rejected") throw new Error("Resposta de rejeição não confirmada.");
      return data;
    },
    retry: false,
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: [SELLER_FINANCE_REVIEW_KEY, v.orderId] });
      qc.invalidateQueries({ queryKey: ["partner-orders-admin"] });
    },
  });
}
