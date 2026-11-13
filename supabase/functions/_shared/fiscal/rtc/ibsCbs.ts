/**
 * IBS/CBS (RTC) — resolução pura do perfil do item para o snapshot e para os
 * leiautes NF-e 55 (PL_010g) e DPS NFS-e (homologação 20/10/2026 e produção 1.01).
 *
 * Regras (fail-closed, sem alíquota presumida):
 *  - CST 3 dígitos, cClassTrib 6 dígitos e prefixo do cClassTrib = CST.
 *  - CST suportados: 000 (tributação integral: exige pCBS, pIBSUF e pIBSMun
 *    declarados no perfil) e 410 (imunidade/não incidência: sem alíquotas).
 *    Demais CSTs, redução, diferimento, monofasia e crédito presumido ficam
 *    pendentes até haver grupo XML homologado.
 *  - Vigência: effective_from ≤ data de emissão ≤ additional_fields.effective_to.
 *  - NF-e interestadual: alíquotas de destino em
 *    additional_fields.ibs_destino[UF] = { uf, mun }; sem a UF de destino → pendência.
 *  - DPS: só declara CST/cClassTrib/cIndOp/indFinal/indDest. Base, alíquotas e
 *    valores do IBS/CBS da NFS-e são DEVOLVIDOS pelo autorizador e lidos de
 *    volta por parseReturnedIbsCbs — nunca calculados como se autorizados.
 */

export type IbsCbsCst = "000" | "410";
export interface IbsCbsRates { cbs: number; ibsUf: number; ibsMun: number }
/** Snapshot congelado por item (o que o operador declarou e foi validado). */
export interface IbsCbsItemSnapshot {
  schemaVersion: 1;
  cst: IbsCbsCst;
  cClassTrib: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  cIndOp: string | null;
  indFinal: "0" | "1" | null;
  indDest: "0" | "1" | null;
  /** Alíquotas efetivas da operação (destino aplicado). Null quando o CST não tributa. */
  rates: IbsCbsRates | null;
  destinationUf: string | null;
}
export type IbsCbsResolution = { ok: true; snapshot: IbsCbsItemSnapshot; missing?: undefined } | { ok: false; missing: string[]; snapshot?: undefined };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const pct = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export interface ResolveContext {
  documentKind: "NFE" | "NFSE";
  issueDate: string; // AAAA-MM-DD
  emitterUf?: string | null;
  destinationUf?: string | null;
}

export function resolveIbsCbs(config: unknown, ctx: ResolveContext): IbsCbsResolution {
  const missing: string[] = [];
  if (!isObj(config) || Object.keys(config).filter((k) => k !== "schema_version").length === 0) return { ok: false, missing: ["ibs_cbs_ausente"] };
  const af = isObj(config.additional_fields) ? config.additional_fields : {};
  const cst = str(config.cst_ibs_cbs);
  const cls = str(config.c_class_trib);
  if (!/^\d{3}$/.test(cst)) missing.push("ibs_cbs_cst");
  if (!/^\d{6}$/.test(cls)) missing.push("ibs_cbs_cclasstrib");
  if (/^\d{3}$/.test(cst) && /^\d{6}$/.test(cls) && cls.slice(0, 3) !== cst) missing.push("ibs_cbs_cst_cclasstrib_divergente");
  if (/^\d{3}$/.test(cst) && cst !== "000" && cst !== "410") missing.push("ibs_cbs_cst_nao_suportado");
  for (const k of ["reducao", "diferimento", "monofasia"] as const) {
    if (isObj(config[k]) && (config[k] as Record<string, unknown>).applies === true) missing.push(`ibs_cbs_${k}_nao_suportado`);
  }
  if (str(config.c_credito_presumido)) missing.push("ibs_cbs_credito_presumido_nao_suportado");

  const from = day(config.effective_from), to = day(af.effective_to);
  const issue = day(ctx.issueDate);
  if (!issue) missing.push("ibs_cbs_data_emissao");
  else if (!from) missing.push("ibs_cbs_vigencia_inicio");
  else if (issue < from || (to !== null && issue > to)) missing.push("ibs_cbs_fora_vigencia");
  if (from && to && to < from) missing.push("ibs_cbs_vigencia_invertida");

  const cIndOp = str(config.c_ind_op) || null;
  const indFinal = af.indFinal === "0" || af.indFinal === "1" ? af.indFinal : null;
  const indDest = af.indDest === "0" || af.indDest === "1" ? af.indDest : null;
  if (ctx.documentKind === "NFSE") {
    if (!cIndOp || !/^\d{6}$/.test(cIndOp)) missing.push("ibs_cbs_cindop");
    if (indDest === null) missing.push("ibs_cbs_inddest");
    else if (indDest === "1") missing.push("ibs_cbs_destinatario_terceiro_nao_suportado");
  }

  let rates: IbsCbsRates | null = null;
  const destUf = str(ctx.destinationUf).toUpperCase() || null;
  if (cst === "000") {
    const cbs = pct(config.aliquota_cbs);
    let ibsUf = pct(config.aliquota_ibs_uf), ibsMun = pct(config.aliquota_ibs_municipio);
    const interstate = ctx.documentKind === "NFE" && !!destUf && !!ctx.emitterUf && destUf !== str(ctx.emitterUf).toUpperCase();
    if (interstate) {
      const map = isObj(af.ibs_destino) ? af.ibs_destino : {};
      const d = isObj(map[destUf!]) ? (map[destUf!] as Record<string, unknown>) : null;
      ibsUf = d ? pct(d.uf) : null; ibsMun = d ? pct(d.mun) : null;
      if (ibsUf === null || ibsMun === null) missing.push("ibs_cbs_aliquota_destino");
    }
    if (cbs === null) missing.push("ibs_cbs_aliquota_cbs");
    if (!interstate && ibsUf === null) missing.push("ibs_cbs_aliquota_ibs_uf");
    if (!interstate && ibsMun === null) missing.push("ibs_cbs_aliquota_ibs_mun");
    if (cbs !== null && ibsUf !== null && ibsMun !== null) rates = { cbs, ibsUf, ibsMun };
  } else if (cst === "410" && [config.aliquota_cbs, config.aliquota_ibs_uf, config.aliquota_ibs_municipio].some((v) => typeof v === "number" && v > 0)) {
    missing.push("ibs_cbs_aliquota_com_cst_nao_tributado");
  }
  if (missing.length) return { ok: false, missing: [...new Set(missing)] };
  return { ok: true, snapshot: { schemaVersion: 1, cst: cst as IbsCbsCst, cClassTrib: cls, effectiveFrom: from, effectiveTo: to, cIndOp, indFinal, indDest, rates, destinationUf: destUf } };
}

// ———————————— NF-e 55 ————————————
const r2 = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 100 + Number.EPSILON) / 100;
const m2 = (n: number) => r2(n).toFixed(2);
const p4 = (n: number) => (n === 0 ? "0" : n.toFixed(4));
const v2 = (n: number) => (r2(n) === 0 ? "0.00" : m2(n));

export interface NfeIbsCbsItemValues { vBC: number; vIBSUF: number; vIBSMun: number; vIBS: number; vCBS: number }
/**
 * Base 2026 (NT 2025.002): vProd + vFrete + vSeg + vOutro − vDesc − vPIS − vCOFINS − vICMS − vFCP.
 * Recebe os valores já apurados pelo motor canônico para o item.
 */
export function nfeIbsCbsBase(i: { vProd: number; vFrete?: number; vSeg?: number; vOutro?: number; vDesc?: number; vPIS?: number; vCOFINS?: number; vICMS?: number; vFCP?: number }): number {
  const b = i.vProd + (i.vFrete ?? 0) + (i.vSeg ?? 0) + (i.vOutro ?? 0) - (i.vDesc ?? 0) - (i.vPIS ?? 0) - (i.vCOFINS ?? 0) - (i.vICMS ?? 0) - (i.vFCP ?? 0);
  return r2(Math.max(0, b));
}
export function nfeIbsCbsValues(s: IbsCbsItemSnapshot, base: number): NfeIbsCbsItemValues | null {
  if (!s.rates) return null;
  const vIBSUF = r2(base * s.rates.ibsUf / 100), vIBSMun = r2(base * s.rates.ibsMun / 100);
  return { vBC: r2(base), vIBSUF, vIBSMun, vIBS: r2(vIBSUF + vIBSMun), vCBS: r2(base * s.rates.cbs / 100) };
}
export function nfeIbsCbsItemXml(s: IbsCbsItemSnapshot, v: NfeIbsCbsItemValues | null): string {
  const head = `<IBSCBS><CST>${s.cst}</CST><cClassTrib>${s.cClassTrib}</cClassTrib>`;
  if (s.cst === "410") return `${head}</IBSCBS>`;
  if (!v || !s.rates) throw new Error("ibs_cbs_valores_ausentes");
  return `${head}<gIBSCBS><vBC>${v2(v.vBC)}</vBC>` +
    `<gIBSUF><pIBSUF>${p4(s.rates.ibsUf)}</pIBSUF><vIBSUF>${v2(v.vIBSUF)}</vIBSUF></gIBSUF>` +
    `<gIBSMun><pIBSMun>${p4(s.rates.ibsMun)}</pIBSMun><vIBSMun>${v2(v.vIBSMun)}</vIBSMun></gIBSMun>` +
    `<vIBS>${v2(v.vIBS)}</vIBS><gCBS><pCBS>${p4(s.rates.cbs)}</pCBS><vCBS>${v2(v.vCBS)}</vCBS></gCBS></gIBSCBS></IBSCBS>`;
}
export function nfeIbsCbsTotals(items: Array<NfeIbsCbsItemValues | null>) {
  const sum = (k: keyof NfeIbsCbsItemValues) => r2(items.reduce((a, v) => a + (v ? v[k] : 0), 0));
  return { vBCIBSCBS: sum("vBC"), vIBSUF: sum("vIBSUF"), vIBSMun: sum("vIBSMun"), vIBS: sum("vIBS"), vCBS: sum("vCBS") };
}
export function nfeIbsCbsTotXml(t: ReturnType<typeof nfeIbsCbsTotals>): string {
  return `<IBSCBSTot><vBCIBSCBS>${v2(t.vBCIBSCBS)}</vBCIBSCBS>` +
    `<gIBS><gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>${v2(t.vIBSUF)}</vIBSUF></gIBSUF>` +
    `<gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>${v2(t.vIBSMun)}</vIBSMun></gIBSMun>` +
    `<vIBS>${v2(t.vIBS)}</vIBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gIBS>` +
    `<gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>${v2(t.vCBS)}</vCBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gCBS></IBSCBSTot>`;
}

// ———————————— DPS NFS-e (somente campos declarados) ————————————
export interface DpsIbsCbsDeclared { cst: string; cClassTrib: string; cIndOp: string; indFinal: "0" | "1" | null; indDest: "0" }
export function dpsDeclaredFromSnapshot(s: IbsCbsItemSnapshot): DpsIbsCbsDeclared | null {
  if (!s.cIndOp || s.indDest !== "0") return null;
  return { cst: s.cst, cClassTrib: s.cClassTrib, cIndOp: s.cIndOp, indFinal: s.indFinal, indDest: "0" };
}
/** HOMOLOGATION (20/10/2026): finNFSe fica em infDPS; trib = CST, cClassTrib.
 *  PRODUCTION (1.01): finNFSe dentro de IBSCBS; trib = gIBSCBS{CST, cClassTrib}. */
export function dpsIbsCbsXml(d: DpsIbsCbsDeclared, env: "HOMOLOGATION" | "PRODUCTION"): string {
  const tribInner = `<CST>${d.cst}</CST><cClassTrib>${d.cClassTrib}</cClassTrib>`;
  return `<IBSCBS>${env === "PRODUCTION" ? "<finNFSe>0</finNFSe>" : ""}${d.indFinal ? `<indFinal>${d.indFinal}</indFinal>` : ""}` +
    `<cIndOp>${d.cIndOp}</cIndOp><indDest>${d.indDest}</indDest>` +
    `<valores><trib>${env === "PRODUCTION" ? `<gIBSCBS>${tribInner}</gIBSCBS>` : tribInner}</trib></valores></IBSCBS>`;
}

/** Valores IBS/CBS DEVOLVIDOS pelo autorizador no XML da NFS-e (grupo filho de infNFSe, fora da DPS). */
export interface ReturnedIbsCbs { cLocalidadeIncid: string | null; vBC: string | null; pIBSUF: string | null; pIBSMun: string | null; pCBS: string | null; vIBSTot: string | null; vCBS: string | null }
export function parseReturnedIbsCbs(nfseXml: string): ReturnedIbsCbs | null {
  const cut = nfseXml.search(/<(?:\w+:)?DPS[\s>]/);
  const head = cut >= 0 ? nfseXml.slice(0, cut) : nfseXml;
  const g = head.match(/<(?:\w+:)?IBSCBS>([\s\S]*?)<\/(?:\w+:)?IBSCBS>/);
  if (!g) return null;
  const t = (name: string) => g[1].match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`))?.[1] ?? null;
  return { cLocalidadeIncid: t("cLocalidadeIncid"), vBC: t("vBC"), pIBSUF: t("pIBSUF"), pIBSMun: t("pIBSMun"), pCBS: t("pCBS"), vIBSTot: t("vIBSTot"), vCBS: t("vCBS") };
}
