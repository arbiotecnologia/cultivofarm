import { supabase } from "@/integrations/supabase/client";

/** Painel de diagnóstico temporário (somente leitura). Expira e fecha sozinho. */
export const ELIGIBILITY_DIAGNOSTIC_EXPIRES_AT = "2026-11-18T23:59:59Z";
export const ELIGIBILITY_SOURCE_TYPES = ["PARTNER_ORDER", "ENTREGA"] as const;
export type EligibilitySourceType = (typeof ELIGIBILITY_SOURCE_TYPES)[number];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPreviewHost(hostname: string, dev = import.meta.env.DEV): boolean {
  const h = hostname.toLowerCase();
  if (/^id-preview--[a-z0-9-]+\.lovable\.app$/.test(h)) return true;
  if (/^[a-z0-9-]+\.lovableproject\.com$/.test(h)) return true;
  return dev && (h === "localhost" || h === "127.0.0.1");
}

export function isDiagnosticOpen(hostname: string, now = new Date(), dev = import.meta.env.DEV): boolean {
  return isPreviewHost(hostname, dev) && now.getTime() < Date.parse(ELIGIBILITY_DIAGNOSTIC_EXPIRES_AT);
}

export function isValidUuid(v: string): boolean { return UUID_RE.test(v.trim()); }

export type OverloadSummary = {
  overload: "2-args" | "3-args(_current_invoice_id=null)";
  ok: boolean;
  error: string | null;
  eligible: boolean | null;
  codes: string[];
  hasOrderId: boolean;
  hasDebtorPartnerId: boolean;
  orderMatchesInput: boolean | null;
  economicDiagnosis: {
    available: boolean;
    commercialExplicit: boolean | null;
    creditExplicit: boolean | null;
    operationalCommercialRegistered: boolean | null;
    accountingPending: boolean | null;
    operationalBlocked: boolean | null;
  } | null;
};

export function summarize(overload: OverloadSummary["overload"], type: EligibilitySourceType, id: string,
  data: unknown, error: { code?: string; message?: string } | null): OverloadSummary {
  if (error) return { overload, ok: false, error: [error.code, error.message].filter(Boolean).join(": "), eligible: null, codes: [], hasOrderId: false, hasDebtorPartnerId: false, orderMatchesInput: null, economicDiagnosis: null };
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const reasons = Array.isArray(d.reasons) ? d.reasons : [];
  const codes = reasons.map((r) => (r && typeof r === "object" ? String((r as Record<string, unknown>).code ?? "") : "")).filter(Boolean);
  const orderId = typeof d.orderId === "string" && d.orderId ? d.orderId : null;
  const e = d.economicDiagnosis && typeof d.economicDiagnosis === "object" ? d.economicDiagnosis as Record<string, unknown> : null;
  const boolean = (key: string) => typeof e?.[key] === "boolean" ? e[key] as boolean : null;
  return {
    overload, ok: true, error: null,
    eligible: typeof d.eligible === "boolean" ? d.eligible : null,
    codes,
    hasOrderId: orderId !== null,
    hasDebtorPartnerId: typeof d.debtorPartnerId === "string" && d.debtorPartnerId.length > 0,
    orderMatchesInput: type === "PARTNER_ORDER" ? (orderId === null ? null : orderId.toLowerCase() === id.toLowerCase()) : null,
    economicDiagnosis: e ? {
      available: e.available === true,
      commercialExplicit: e.available === true ? boolean("commercial_explicit") : null,
      creditExplicit: e.available === true ? boolean("credit_explicit") : null,
      operationalCommercialRegistered: boolean("operational_commercial_registered"),
      accountingPending: boolean("accounting_pending"),
      operationalBlocked: boolean("operational_blocked"),
    } : null,
  };
}

/** Chama somente os dois leitores, com o cliente da sessão corrente. */
export async function runEligibilityDiagnostic(type: EligibilitySourceType, rawId: string): Promise<OverloadSummary[]> {
  const id = rawId.trim();
  if (!ELIGIBILITY_SOURCE_TYPES.includes(type) || !isValidUuid(id)) throw new Error("ENTRADA_INVALIDA");
  // Tipagem gerada da sobrecarga não resolve a união; a chamada é a RPC normal do cliente da sessão.
  const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) =>
    Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  const two = await rpc("fn_fiscal_invoice_eligibility", { _source_type: type, _source_id: id });
  const three = await rpc("fn_fiscal_invoice_eligibility", { _source_type: type, _source_id: id, _current_invoice_id: null });
  return [
    summarize("2-args", type, id, two.data, two.error),
    summarize("3-args(_current_invoice_id=null)", type, id, three.data, three.error),
  ];
}

export function databaseHost(): string {
  try { return new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname; } catch { return "desconhecido"; }
}
