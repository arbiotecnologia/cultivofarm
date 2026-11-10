/** Contrato do leitor tenant-scoped candidato. O legado rpc_b2b_revenue_forecast nunca é consultado. */
export const REVENUE_FORECAST_TENANT_RPC = "rpc_b2b_revenue_forecast_tenant_v1";
export const REVENUE_FORECAST_TENANT_CONTRACT = "B2B_REVENUE_FORECAST_TENANT_V1";

export interface B2BRevenueForecastTenant {
  forecast_residual: { amount: number; orders: number };
  confirmed_titles: { vencido: number; ate_30: number; ate_60: number; ate_90: number; apos_90: number; total_aberto: number };
  legacy_unproven_orders: number;
}

const money = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) throw new Error("revenue_forecast_contract_invalid");
  return n;
};
const count = (v: unknown) => {
  if (!Number.isInteger(v) || (v as number) < 0) throw new Error("revenue_forecast_contract_invalid");
  return v as number;
};

export function parseRevenueForecastTenant(data: unknown, partnerId: string | null): B2BRevenueForecastTenant {
  const d = data as Record<string, any> | null;
  if (!d || d.contract !== REVENUE_FORECAST_TENANT_CONTRACT || (d.partner_id ?? null) !== partnerId) throw new Error("revenue_forecast_contract_invalid");
  const f = d.forecast_residual, t = d.confirmed_titles;
  if (!f || f.enforceable !== false || f.due_dates_estimated !== true || !t) throw new Error("revenue_forecast_contract_invalid");
  const titles = { vencido: money(t.vencido), ate_30: money(t.ate_30), ate_60: money(t.ate_60), ate_90: money(t.ate_90), apos_90: money(t.apos_90), total_aberto: money(t.total_aberto) };
  const sum = titles.vencido + titles.ate_30 + titles.ate_60 + titles.ate_90 + titles.apos_90;
  if (Math.round(sum * 100) !== Math.round(titles.total_aberto * 100)) throw new Error("revenue_forecast_contract_invalid");
  return { forecast_residual: { amount: money(f.amount), orders: count(f.orders) }, confirmed_titles: titles, legacy_unproven_orders: count(d.legacy_unproven_orders) };
}
