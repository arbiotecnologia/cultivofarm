import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";

/**
 * Contrato ÚNICO de condição/meio de pagamento B2B: B2B_PAYMENT_CONDITION_V1 (candidata comprovada rebaseada sobre o create
 * LIVE). O contrato rev.2 B2B_PAYMENT_METHOD_V1 foi superado e não é mais chamado.
 */
export const PAYMENT_METHOD_CONTRACT = "B2B_PAYMENT_CONDITION_V1";
export const METHOD_KINDS = ["dinheiro", "pix", "cartao_debito", "boleto", "promissoria", "cartao_credito"] as const;
export type MethodKind = (typeof METHOD_KINDS)[number];

export const METHOD_KIND_LABEL: Record<MethodKind, string> = {
  dinheiro: "Dinheiro", pix: "Pix", cartao_debito: "Cartão de débito", boleto: "Boleto", promissoria: "Promissória", cartao_credito: "Cartão de crédito",
};
/** Limites por tipo espelhando os CHECKs do servidor (parcela única: dinheiro/Pix/débito; boleto até 3; demais até 120). */
export const MAX_INSTALLMENTS: Record<MethodKind, number> = { dinheiro: 1, pix: 1, cartao_debito: 1, boleto: 3, promissoria: 120, cartao_credito: 120 };

/** Escolha enviada ao servidor exatamente com estes três campos (o servidor recusa qualquer outro). */
export interface PaymentMethodChoice { payment_method: MethodKind; payment_condition_version: number; payment_deadline_days: number }

export interface PaymentMethodOption extends PaymentMethodChoice {
  available: boolean;
  reason: string | null;
  payment_method_name: string | null;
  installment_count: number | null;
  monthly_rate: number | null;
}

export const sameChoice = (a: PaymentMethodChoice | null | undefined, b: PaymentMethodChoice | null | undefined) =>
  !!a && !!b && a.payment_method === b.payment_method && a.payment_condition_version === b.payment_condition_version &&
  a.payment_deadline_days === b.payment_deadline_days;

/**
 * mode "required": a empresa vendedora ativou o contrato para este parceiro (piloto ou geral) — o servidor recusa pedido
 * sem condição. mode "legacy": empresa não ativada; o contrato atual continua valendo no servidor. Pré-instalação (PGRST202
 * exato) equivale a legacy porque o servidor ainda não tem a exigência; qualquer outro erro falha fechado.
 */
export type PaymentMethodOptionsResult =
  | { status: "ok"; mode: "required" | "legacy"; options: PaymentMethodOption[] }
  | { status: "not_installed" };

export function parsePaymentMethodMode(raw: unknown): "required" | "legacy" {
  const m = (raw as Record<string, unknown> | null)?.mode;
  if (m !== "required" && m !== "legacy") throw new Error("payment_method_contract_unavailable");
  return m;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : NaN);

/** Parser estrito do leitor do comprador. Qualquer divergência = contrato indisponível (nunca lista vazia silenciosa). */
export function parsePaymentMethodOptions(raw: unknown, partnerId: string, planId: string): PaymentMethodOption[] {
  const fail = () => { throw new Error("payment_method_contract_unavailable"); };
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || Array.isArray(d) || d.contract !== PAYMENT_METHOD_CONTRACT || d.partner_id !== partnerId ||
      d.payment_plan_id !== planId || d.due_basis !== "nf_issue" || !Array.isArray(d.options)) fail();
  const seen = new Set<string>();
  return (d!.options as unknown[]).map((r) => {
    const o = r as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) fail();
    const kind = o.payment_method as MethodKind;
    const ver = o.payment_condition_version;
    if (!METHOD_KINDS.includes(kind) || !Number.isInteger(ver) || (ver as number) < 1 || typeof o.available !== "boolean") fail();
    const id = `${kind}:${ver}`;
    if (seen.has(id)) fail();
    seen.add(id);
    const rate = o.monthly_rate == null ? null : num(o.monthly_rate);
    if (o.available && (typeof o.payment_method_name !== "string" || !Number.isInteger(o.payment_deadline_days) || (o.payment_deadline_days as number) < 0 ||
        !Number.isInteger(o.installment_count) || (o.installment_count as number) < 1 || (o.installment_count as number) > MAX_INSTALLMENTS[kind] ||
        rate === null || Number.isNaN(rate) || rate < 0)) fail();
    return {
      payment_method: kind, payment_condition_version: ver as number,
      payment_deadline_days: Number.isInteger(o.payment_deadline_days) ? (o.payment_deadline_days as number) : -1,
      available: o.available as boolean, reason: typeof o.reason === "string" ? o.reason : null,
      payment_method_name: typeof o.payment_method_name === "string" ? o.payment_method_name : null,
      installment_count: Number.isInteger(o.installment_count) ? (o.installment_count as number) : null,
      monthly_rate: rate === null || Number.isNaN(rate) ? null : rate,
    };
  });
}

const ENDPOINT_RE = /\bpublic\.b2b_list_payment_condition_options_secure\(\s*p_partner_id\s*,\s*p_payment_plan_id\s*\)/;
/** Ausência EXATA do endpoint (pré-instalação). Qualquer outro erro falha fechado. */
export function isOptionsRpcAbsent(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && error.code === "PGRST202" && typeof error.message === "string" &&
    /^Could not find the function /.test(error.message) && ENDPOINT_RE.test(error.message);
}

export async function fetchPaymentMethodOptions(partnerId: string, planId: string, signal: AbortSignal): Promise<PaymentMethodOptionsResult> {
  const { data, error } = await supabase
    .rpc("b2b_list_payment_condition_options_secure" as never, { p_partner_id: partnerId, p_payment_plan_id: planId } as never)
    .abortSignal(signal);
  if (error) {
    if (isOptionsRpcAbsent(error)) return { status: "not_installed" };
    throw error;
  }
  return { status: "ok", mode: parsePaymentMethodMode(data), options: parsePaymentMethodOptions(data, partnerId, planId) };
}

export function useB2BPaymentMethodOptions(partnerId: string | null | undefined, planId: string | null | undefined, enabled: boolean) {
  return useScopedPortalQuery({
    queryKey: ["b2b-payment-condition-options", PAYMENT_METHOD_CONTRACT, partnerId, planId],
    enabled: enabled && !!partnerId && !!planId,
    retry: false,
    staleTime: 0,
    queryFn: (signal) => {
      if (!partnerId || !planId) throw new Error("payment_method_scope_required");
      return fetchPaymentMethodOptions(partnerId, planId, signal);
    },
  });
}
