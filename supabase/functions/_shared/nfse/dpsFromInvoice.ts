/**
 * Mapeia o rascunho canônico (fiscal_invoices/itens NFSE criados por
 * rpc_fiscal_draft_save) para a DPS, sem inventar dados: ausências viram
 * pendências. Puro; sem rede.
 */
import { type DpsInput, regimeFromCrt } from "./dps.ts";

export interface InvoiceForDps {
  id: string; environment: string | null; issue_date: string | null; draft_version: number | null; total_amount: number | string;
  items: Array<{ description: string; net_value: number | string; fiscal_profile_snapshot: Record<string, unknown> | null; tax_snapshot: Record<string, unknown> | null }>;
}
export interface CompanyForDps { cnpj: string | null; municipality_ibge_code: string | null; municipal_registration: string | null; crt: string | null; fiscal_environment: string | null }
export interface CustomerForDps { cpf_cnpj: string | null; name: string | null; email: string | null }

export type DpsMapping = { ok: true; input: Omit<DpsInput, "number" | "series">; fingerprintSource: string } | { ok: false; missing: string[] };

const env = (v: string | null) => {
  const u = (v ?? "").toUpperCase();
  return u === "HOMOLOGATION" || u === "HOMOLOGACAO" ? "HOMOLOGATION" : u === "PRODUCTION" || u === "PRODUCAO" ? "PRODUCTION" : null;
};

export function mapInvoiceToDps(inv: InvoiceForDps, c: CompanyForDps, t: CustomerForDps, now: Date, tzOffset = "-03:00"): DpsMapping {
  const missing: string[] = [];
  const e = env(c.fiscal_environment);
  if (!e) missing.push("ambiente_fiscal");
  if (inv.environment === "NOT_CONFIGURED" || (e && inv.environment && env(inv.environment) !== e && !(e === "PRODUCTION" && inv.environment === "NOT_CONFIGURED"))) missing.push("ambiente_rascunho");
  const regime = regimeFromCrt(c.crt);
  if (!regime) missing.push("crt");
  if (!inv.items.length) missing.push("itens");
  const nat = new Set(inv.items.map((i) => String(i.fiscal_profile_snapshot?.national_tax_code ?? "").replace(/\D/g, "")));
  const mun = new Set(inv.items.map((i) => String(i.fiscal_profile_snapshot?.municipality_ibge_code ?? "")));
  const cmun = new Set(inv.items.map((i) => String(i.fiscal_profile_snapshot?.municipal_tax_code ?? "")));
  const rate = new Set(inv.items.map((i) => (i.tax_snapshot?.iss_rate ?? null) === null ? "" : String(i.tax_snapshot?.iss_rate)));
  const wh = new Set(inv.items.map((i) => i.tax_snapshot?.iss_withheld === true));
  if (nat.size > 1 || mun.size > 1 || cmun.size > 1 || rate.size > 1 || wh.size > 1) missing.push("itens_tributacao_divergente");
  const amount = Math.round(inv.items.reduce((s, i) => s + Number(i.net_value), 0) * 100) / 100;
  if (Math.abs(amount - Number(inv.total_amount)) > 0.005) missing.push("total_divergente");
  if (missing.length) return { ok: false, missing };
  const first = inv.items[0];
  const rateStr = [...rate][0];
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = new Date(now.getTime() - 3 * 3600_000);
  const issue = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}${tzOffset}`;
  const input: Omit<DpsInput, "number" | "series"> = {
    environment: e!,
    issueDateTime: issue,
    competence: inv.issue_date ?? issue.slice(0, 10),
    emitter: { cnpj: c.cnpj ?? "", municipalityIbge: c.municipality_ibge_code ?? "", municipalRegistration: c.municipal_registration, regime },
    taker: { cnpjCpf: t.cpf_cnpj ?? "", name: t.name ?? "", email: t.email },
    service: {
      nationalTaxCode: [...nat][0], municipalTaxCode: [...cmun][0] || null,
      description: inv.items.map((i) => i.description.trim()).filter(Boolean).join("; ").slice(0, 2000),
      incidenceMunicipalityIbge: [...mun][0],
    },
    values: { serviceAmount: amount, issRate: rateStr === "" ? null : Number(rateStr), issWithheld: [...wh][0] },
  };
  void first;
  // Impressão digital estável do conteúdo fiscal (sem data/hora de emissão).
  const fingerprintSource = JSON.stringify({ id: inv.id, v: inv.draft_version, e, emitter: input.emitter, taker: input.taker, service: input.service, values: input.values, competence: input.competence });
  return { ok: true, input, fingerprintSource };
}
