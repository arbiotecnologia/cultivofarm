/** Contrato do leitor tenant-scoped V2. O legado rpc_b2b_revenue_forecast nunca é consultado. */
export const REVENUE_FORECAST_TENANT_RPC = "rpc_b2b_revenue_forecast_tenant_v2";
export const REVENUE_FORECAST_TENANT_CONTRACT = "B2B_REVENUE_FORECAST_TENANT_V2";

export interface B2BRevenueForecastTenant {
  organization_id: string;
  forecast_residual: { amount: number; orders: number; inconsistent: number };
  confirmed_titles: { installments: number; vencido: number; ate_30: number; ate_60: number; ate_90: number; apos_90: number; total_aberto: number };
  titles_unavailable: { unproven: number; legacy: number; inconsistent: number };
  legacy_unproven_orders: number;
}

const bad = () => new Error("revenue_forecast_contract_invalid");
const money = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) throw bad();
  return n;
};
const count = (v: unknown) => { if (!Number.isInteger(v) || (v as number) < 0) throw bad(); return v as number; };

/** Rejeita resposta de outra empresa (sessão trocada) ou de parceiro diferente do pedido. */
export function parseRevenueForecastTenant(data: unknown, partnerId: string | null, sessionOrganizationId: string | null | undefined): B2BRevenueForecastTenant {
  const d = data as Record<string, any> | null;
  if (!sessionOrganizationId || !d || d.contract !== REVENUE_FORECAST_TENANT_CONTRACT
      || d.organization_id !== sessionOrganizationId || (d.partner_id ?? null) !== partnerId) throw bad();
  const f = d.forecast_residual, t = d.confirmed_titles, u = d.titles_unavailable;
  if (!f || f.enforceable !== false || f.due_dates_estimated !== true || !t || t.proof !== "b2b_document_allocation_v1" || !u) throw bad();
  const titles = { installments: count(t.installments), vencido: money(t.vencido), ate_30: money(t.ate_30), ate_60: money(t.ate_60),
    ate_90: money(t.ate_90), apos_90: money(t.apos_90), total_aberto: money(t.total_aberto) };
  const sum = titles.vencido + titles.ate_30 + titles.ate_60 + titles.ate_90 + titles.apos_90;
  if (Math.round(sum * 100) !== Math.round(titles.total_aberto * 100)) throw bad();
  return {
    organization_id: d.organization_id,
    forecast_residual: { amount: money(f.amount), orders: count(f.orders), inconsistent: count(f.inconsistent) },
    confirmed_titles: titles,
    titles_unavailable: { unproven: count(u.unproven), legacy: count(u.legacy), inconsistent: count(u.inconsistent) },
    legacy_unproven_orders: count(d.legacy_unproven_orders),
  };
}
