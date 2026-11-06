import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";

export const PAYMENT_METHOD_CONTRACT = "B2B_PAYMENT_METHOD_V1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const METHOD_KINDS = ["dinheiro", "pix", "debito", "boleto", "promissoria", "credito"] as const;
export type MethodKind = (typeof METHOD_KINDS)[number];

export const METHOD_KIND_LABEL: Record<MethodKind, string> = {
  dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", boleto: "Boleto", promissoria: "Promissória", credito: "Crédito",
};

export interface PaymentMethodOption {
  config_id: string;
  version: number;
  method_kind: MethodKind;
  available: boolean;
  reason: string | null;
  payment_method_name: string | null;
  due_days: number | null;
  installment_count: number | null;
}

export interface PaymentMethodChoice { config_id: string; version: number }

/**
 * mode "required": a empresa vendedora ativou o contrato para este parceiro (piloto ou geral) — o servidor recusa pedido
 * sem meio. mode "legacy": empresa não ativada; o contrato atual continua valendo no servidor. Pré-instalação (PGRST202
 * exato) equivale a legacy porque o servidor ainda não tem a exigência; qualquer outro erro falha fechado.
 */
export type PaymentMethodOptionsResult =
  | { status: "ok"; mode: "required" | "legacy"; options: PaymentMethodOption[] }
  | { status: "not_installed" };

/** Parser estrito do leitor do comprador. Qualquer divergência = contrato indisponível (nunca lista vazia silenciosa). */
export function parsePaymentMethodMode(raw: unknown): "required" | "legacy" {
  const m = (raw as Record<string, unknown> | null)?.mode;
  if (m !== "required" && m !== "legacy") throw new Error("payment_method_contract_unavailable");
  return m;
}

export function parsePaymentMethodOptions(raw: unknown, partnerId: string, planId: string): PaymentMethodOption[] {
  const fail = () => { throw new Error("payment_method_contract_unavailable"); };
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || Array.isArray(d) || d.contract !== PAYMENT_METHOD_CONTRACT || d.partner_id !== partnerId ||
      d.payment_plan_id !== planId || d.due_basis !== "nf_issue" || !Array.isArray(d.options)) fail();
  const seen = new Set<string>();
  return (d!.options as unknown[]).map((r) => {
    const o = r as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) fail();
    const kind = o.method_kind as MethodKind;
    if (typeof o.config_id !== "string" || !UUID.test(o.config_id) || seen.has(o.config_id) || !Number.isInteger(o.version) ||
        (o.version as number) < 1 || !METHOD_KINDS.includes(kind) || typeof o.available !== "boolean") fail();
    // Todos os seis meios são configuráveis pelo vendedor; os limites de parcelas por tipo espelham os CHECKs do servidor.
    const maxN = kind === "boleto" ? 3 : kind === "promissoria" || kind === "credito" ? 36 : 1;
    if (o.available && (typeof o.payment_method_name !== "string" || !Number.isInteger(o.due_days) || !Number.isInteger(o.installment_count) ||
        (o.installment_count as number) < 1 || (o.installment_count as number) > maxN)) fail();
    seen.add(o.config_id as string);
    return {
      config_id: o.config_id as string, version: o.version as number, method_kind: kind, available: o.available as boolean,
      reason: typeof o.reason === "string" ? o.reason : null,
      payment_method_name: typeof o.payment_method_name === "string" ? o.payment_method_name : null,
      due_days: Number.isInteger(o.due_days) ? (o.due_days as number) : null,
      installment_count: Number.isInteger(o.installment_count) ? (o.installment_count as number) : null,
    };
  });
}

const ENDPOINT_RE = /\bpublic\.b2b_list_payment_method_options_secure\(\s*p_partner_id\s*,\s*p_payment_plan_id\s*\)/;
/** Ausência EXATA do endpoint (pré-instalação). Qualquer outro erro falha fechado. */
export function isOptionsRpcAbsent(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && error.code === "PGRST202" && typeof error.message === "string" &&
    /^Could not find the function /.test(error.message) && ENDPOINT_RE.test(error.message);
}

export async function fetchPaymentMethodOptions(partnerId: string, planId: string, signal: AbortSignal): Promise<PaymentMethodOptionsResult> {
  const { data, error } = await supabase
    .rpc("b2b_list_payment_method_options_secure" as never, { p_partner_id: partnerId, p_payment_plan_id: planId } as never)
    .abortSignal(signal);
  if (error) {
    if (isOptionsRpcAbsent(error)) return { status: "not_installed" };
    throw error;
  }
  return { status: "ok", mode: parsePaymentMethodMode(data), options: parsePaymentMethodOptions(data, partnerId, planId) };
}

export function useB2BPaymentMethodOptions(partnerId: string | null | undefined, planId: string | null | undefined, enabled: boolean) {
  return useScopedPortalQuery({
    queryKey: ["b2b-payment-method-options", PAYMENT_METHOD_CONTRACT, partnerId, planId],
    enabled: enabled && !!partnerId && !!planId,
    retry: false,
    staleTime: 0,
    queryFn: (signal) => {
      if (!partnerId || !planId) throw new Error("payment_method_scope_required");
      return fetchPaymentMethodOptions(partnerId, planId, signal);
    },
  });
}
