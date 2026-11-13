/**
 * Mapeia o rascunho canônico (fiscal_invoices/itens NFSE criados por
 * rpc_fiscal_draft_save) para a DPS, sem inventar dados: ausências viram
 * pendências. Puro; sem rede.
 *
 * O complemento DPS (NBS, local da prestação, PIS/COFINS, retenções federais,
 * total de tributos) vem de fiscal_invoices.fiscal_profile_snapshot.nfse_dps,
 * copiado do perfil do serviço no faturamento (ou reaplicado ao mesmo rascunho).
 */
import { type DpsInput, regimeFromCrt } from "./dps.ts";
import { validateNfseDpsProfile, type NfseDpsProfile } from "./dpsProfile.ts";
import { dpsDeclaredFromSnapshot, resolveIbsCbs, type DpsIbsCbsDeclared } from "../fiscal/rtc/ibsCbs.ts";

export interface InvoiceForDps {
  id: string; environment: string | null; issue_date: string | null; draft_version: number | null; total_amount: number | string;
  fiscal_profile_snapshot?: Record<string, unknown> | null;
  items: Array<{ description: string; net_value: number | string; fiscal_profile_snapshot: Record<string, unknown> | null; tax_snapshot: Record<string, unknown> | null }>;
}
export interface CompanyForDps { cnpj: string | null; municipality_ibge_code: string | null; municipal_registration: string | null; crt: string | null; fiscal_environment: string | null; phone?: string | null; fiscal_email?: string | null }
export interface CustomerForDps { cpf_cnpj: string | null; name: string | null; email: string | null; municipal_registration?: string | null; phone?: string | null }

export type DpsMapping = { ok: true; input: Omit<DpsInput, "number" | "series">; fingerprintSource: string } | { ok: false; missing: string[] };

const env = (v: string | null) => {
  const u = (v ?? "").toUpperCase();
  return u === "HOMOLOGATION" || u === "HOMOLOGACAO" ? "HOMOLOGATION" : u === "PRODUCTION" || u === "PRODUCAO" ? "PRODUCTION" : null;
};
/** Código de tributação como string de dígitos (preserva zero inicial: "010101"). */
const code = (v: unknown) => typeof v === "string" ? v.replace(/\D/g, "") : typeof v === "number" ? "__numeric__" : "";

export function mapInvoiceToDps(inv: InvoiceForDps, c: CompanyForDps, t: CustomerForDps, now: Date, tzOffset = "-03:00"): DpsMapping {
  const missing: string[] = [];
  const e = env(c.fiscal_environment);
  if (!e) missing.push("ambiente_fiscal");
  if (inv.environment === "NOT_CONFIGURED" || (e && inv.environment && env(inv.environment) !== e && !(e === "PRODUCTION" && inv.environment === "NOT_CONFIGURED"))) missing.push("ambiente_rascunho");
  const regime = regimeFromCrt(c.crt);
  if (!regime) missing.push("crt");
  if (!inv.items.length) missing.push("itens");
  const nat = new Set(inv.items.map((i) => code(i.fiscal_profile_snapshot?.national_tax_code)));
  const mun = new Set(inv.items.map((i) => String(i.fiscal_profile_snapshot?.municipality_ibge_code ?? "")));
  const cmun = new Set(inv.items.map((i) => String(i.fiscal_profile_snapshot?.municipal_tax_code ?? "")));
  const rate = new Set(inv.items.map((i) => (i.tax_snapshot?.iss_rate ?? null) === null ? "" : String(i.tax_snapshot?.iss_rate)));
  const wh = new Set(inv.items.map((i) => i.tax_snapshot?.iss_withheld === true));
  if (nat.size > 1 || mun.size > 1 || cmun.size > 1 || rate.size > 1 || wh.size > 1) missing.push("itens_tributacao_divergente");
  if (nat.has("__numeric__")) missing.push("codigo_tributacao_nacional_numerico");
  const amount = Math.round(inv.items.reduce((s, i) => s + Number(i.net_value), 0) * 100) / 100;
  if (Math.abs(amount - Number(inv.total_amount)) > 0.005) missing.push("total_divergente");
  const rawDps = inv.fiscal_profile_snapshot?.nfse_dps;
  const dpsIssues = validateNfseDpsProfile(rawDps);
  if (dpsIssues.length) missing.push(...dpsIssues.map((x) => `perfil_dps_${x}`));
  const dp = (dpsIssues.length ? {} : (rawDps ?? {})) as Partial<NfseDpsProfile>;
  if (!dp.service_location_ibge_code) missing.push("local_prestacao");
  if (!dp.tot_trib) missing.push("total_tributos");
  // IBS/CBS: snapshot por item (fiscal_profile_snapshot.ibs_cbs). Ausência, vigência ou
  // divergência entre itens viram pendência; nada é presumido.
  const ibsDecl: DpsIbsCbsDeclared[] = [];
  for (const it of inv.items) {
    const r = resolveIbsCbs(it.fiscal_profile_snapshot?.ibs_cbs, { documentKind: "NFSE", issueDate: inv.issue_date ?? "" });
    if (r.ok === false) { missing.push(...r.missing); continue; }
    const d = dpsDeclaredFromSnapshot(r.snapshot);
    if (d) ibsDecl.push(d);
  }
  if (ibsDecl.length === inv.items.length && new Set(ibsDecl.map((d) => JSON.stringify(d))).size > 1) missing.push("ibs_cbs_itens_divergentes");
  if (missing.length) return { ok: false, missing: [...new Set(missing)] };
  const rateStr = [...rate][0];
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = new Date(now.getTime() - 3 * 3600_000);
  const issue = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}${tzOffset}`;
  const pc = dp.pis_cofins; const fr = dp.federal_retentions; const tt = dp.tot_trib!;
  const input: Omit<DpsInput, "number" | "series"> = {
    environment: e!,
    issueDateTime: issue,
    competence: inv.issue_date ?? issue.slice(0, 10),
    emitter: { cnpj: c.cnpj ?? "", municipalityIbge: c.municipality_ibge_code ?? "", municipalRegistration: c.municipal_registration, phone: c.phone ?? null, email: c.fiscal_email ?? null, regime },
    taker: { cnpjCpf: t.cpf_cnpj ?? "", name: t.name ?? "", municipalRegistration: t.municipal_registration ?? null, phone: t.phone ?? null, email: t.email },
    service: {
      nationalTaxCode: [...nat][0], municipalTaxCode: [...cmun][0] || null,
      description: inv.items.map((i) => i.description.trim()).filter(Boolean).join("; ").slice(0, 2000),
      locationIbge: dp.service_location_ibge_code!,
      incidenceMunicipalityIbge: [...mun][0] || null,
      nbsCode: dp.nbs_code ?? null,
    },
    values: {
      serviceAmount: amount, issRate: rateStr === "" ? null : Number(rateStr), issWithheld: [...wh][0],
      pisCofins: pc ? { cst: pc.cst, pAliqPis: pc.p_aliq_pis ?? null, pAliqCofins: pc.p_aliq_cofins ?? null, retType: pc.ret_type ?? null } : null,
      federalRetentions: fr ? { cpRate: fr.cp_rate ?? null, irrfRate: fr.irrf_rate ?? null, csllRate: fr.csll_rate ?? null } : null,
      totTrib: { mode: tt.mode, fed: tt.fed ?? null, est: tt.est ?? null, mun: tt.mun ?? null, sn: tt.sn ?? null },
    },
    ibsCbs: ibsDecl[0],
  };
  // Impressão digital estável do conteúdo fiscal (sem data/hora de emissão).
  const fingerprintSource = JSON.stringify({ id: inv.id, v: inv.draft_version, e, emitter: input.emitter, taker: input.taker, service: input.service, values: input.values, ibsCbs: input.ibsCbs, competence: input.competence });
  return { ok: true, input, fingerprintSource };
}
