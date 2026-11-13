/**
 * NFS-e Padrão Nacional — montagem da DPS (Declaração de Prestação de Serviço),
 * leiaute vigente DPS v1.01 (pacote oficial nfse-esquemas_xsd-v1-01-20260209,
 * SHA-256 e7935cbd9470527c6cc32984c1b2263e614183bf0139ce2733eaaed2de9a8072).
 * Módulo puro: sem rede, sem assinatura, sem segredos. Não presume autorização.
 * A ordem dos elementos segue TCInfDPS/TCInfoPrestador/TCTribMunicipal do XSD.
 */
export const DPS_LAYOUT_VERSION = "1.01" as const;
export const NFSE_NAMESPACE = "http://www.sped.fazenda.gov.br/nfse" as const;

/** Regime tributário do prestador (TCRegTrib). */
export interface DpsRegime {
  /** 1 = não optante; 2 = MEI; 3 = ME/EPP optante do Simples. */
  opSimpNac: "1" | "2" | "3";
  /** Obrigatório só quando opSimpNac = 3. */
  regApTribSN?: "1" | "2" | "3" | null;
  regEspTrib: "0" | "1" | "2" | "3" | "4" | "5" | "6" | "9";
}

export interface DpsInput {
  environment: "HOMOLOGATION" | "PRODUCTION";
  issueDateTime: string; // AAAA-MM-DDThh:mm:ss±hh:mm
  competence: string; // YYYY-MM-DD
  series: string; // 1..5 dígitos
  number: number; // nDPS
  emitter: { cnpj: string; municipalityIbge: string; municipalRegistration?: string | null; phone?: string | null; email?: string | null; regime?: DpsRegime | null };
  taker: { cnpjCpf: string; name: string; municipalRegistration?: string | null; phone?: string | null; email?: string | null };
  service: {
    nationalTaxCode: string; municipalTaxCode?: string | null; description: string;
    /** Local da prestação (cLocPrestacao). Distinto do município de incidência. */
    locationIbge: string;
    /** Município de incidência do ISSQN: não é campo da DPS; validado apenas para coerência do perfil. */
    incidenceMunicipalityIbge?: string | null;
    nbsCode?: string | null;
  };
  values: {
    serviceAmount: number; issRate?: number | null; issWithheld: boolean;
    pisCofins?: { cst: string; pAliqPis?: number | null; pAliqCofins?: number | null; retType?: string | null } | null;
    federalRetentions?: { cpRate?: number | null; irrfRate?: number | null; csllRate?: number | null } | null;
    /** Obrigatório (TCTribTotal): escolha explícita do perfil, nunca presumida. */
    totTrib?: { mode: "IND" | "PERCENT" | "SN"; fed?: number | null; est?: number | null; mun?: number | null; sn?: number | null } | null;
  };
}

export type DpsIssue = "cnpj_emitente" | "cnpj_emitente_alfanumerico" | "municipio_emitente" | "documento_tomador" | "documento_tomador_alfanumerico" | "nome_tomador" | "codigo_tributacao_nacional" | "nbs" | "descricao" | "local_prestacao" | "municipio_incidencia" | "valor" | "aliquota_iss" | "serie" | "numero" | "competencia" | "data_emissao" | "regime_tributario" | "fone_emitente" | "email_emitente" | "im_tomador" | "fone_tomador" | "email_tomador" | "pis_cofins" | "retencoes_federais" | "total_tributos" | "total_tributos_regime";

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
/** Documento sem pontuação, preservando letras (CNPJ alfanumérico, IN RFB 2.229/2024). */
const docKey = (s: string | null | undefined) => (s ?? "").replace(/[\s.\-/]/g, "").toUpperCase();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const dec2 = (n: number) => n.toFixed(2);
const DT = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const has = (v: string | null | undefined) => typeof v === "string" && v.trim() !== "";
const okPct = (v: number | null | undefined, max: number) => v == null || (Number.isFinite(v) && v >= 0 && v <= max);

/** CRT do emitente → TCRegTrib. CRT ausente/desconhecido não é presumido. */
export function regimeFromCrt(crt: string | null | undefined): DpsRegime | null {
  switch ((crt ?? "").trim()) {
    case "1": return { opSimpNac: "3", regApTribSN: "1", regEspTrib: "0" };
    case "4": return { opSimpNac: "2", regEspTrib: "0" };
    case "2": case "3": return { opSimpNac: "1", regEspTrib: "0" };
    default: return null;
  }
}

/** Leiaute 1.01 aceita CNPJ só numérico (TSCNPJ [0-9]{14}); alfanumérico vira pendência, nunca é truncado. */
function docIssue(doc: string, allowCpf: boolean, base: "cnpj_emitente" | "documento_tomador"): DpsIssue | null {
  const k = docKey(doc);
  if (/^[0-9A-Z]{12}\d{2}$/.test(k) && /[A-Z]/.test(k)) return base === "cnpj_emitente" ? "cnpj_emitente_alfanumerico" : "documento_tomador_alfanumerico";
  if (/^\d{14}$/.test(k) || (allowCpf && /^\d{11}$/.test(k))) return null;
  return base;
}

export function validateDps(i: DpsInput): DpsIssue[] {
  const out: DpsIssue[] = [];
  const ce = docIssue(i.emitter.cnpj, false, "cnpj_emitente"); if (ce) out.push(ce);
  if (!/^\d{7}$/.test(i.emitter.municipalityIbge)) out.push("municipio_emitente");
  if (has(i.emitter.phone) && !/^\d{6,20}$/.test(digits(i.emitter.phone))) out.push("fone_emitente");
  if (has(i.emitter.email) && (!EMAIL.test(i.emitter.email!.trim()) || i.emitter.email!.trim().length > 80)) out.push("email_emitente");
  const ct = docIssue(i.taker.cnpjCpf, true, "documento_tomador"); if (ct) out.push(ct);
  if (!i.taker.name.trim() || i.taker.name.trim().length > 300) out.push("nome_tomador");
  if (has(i.taker.municipalRegistration) && i.taker.municipalRegistration!.trim().length > 15) out.push("im_tomador");
  if (has(i.taker.phone) && !/^\d{6,20}$/.test(digits(i.taker.phone))) out.push("fone_tomador");
  if (has(i.taker.email) && (!EMAIL.test(i.taker.email!.trim()) || i.taker.email!.trim().length > 80)) out.push("email_tomador");
  // cTribNac é string de 6 dígitos: zero inicial é significativo e nunca convertido em número.
  if (!/^\d{6}$/.test(i.service.nationalTaxCode)) out.push("codigo_tributacao_nacional");
  if (has(i.service.nbsCode) && !/^\d{9}$/.test(i.service.nbsCode!)) out.push("nbs");
  if (!i.service.description.trim() || i.service.description.length > 2000) out.push("descricao");
  if (!/^\d{7}$/.test(i.service.locationIbge ?? "")) out.push("local_prestacao");
  if (i.service.incidenceMunicipalityIbge != null && i.service.incidenceMunicipalityIbge !== "" && !/^\d{7}$/.test(i.service.incidenceMunicipalityIbge)) out.push("municipio_incidencia");
  if (!(i.values.serviceAmount > 0) || i.values.serviceAmount >= 1e13) out.push("valor");
  if (i.values.issRate != null && !(i.values.issRate >= 0 && i.values.issRate < 10)) out.push("aliquota_iss");
  if (!/^\d{1,5}$/.test(i.series)) out.push("serie");
  if (!Number.isInteger(i.number) || i.number < 1 || i.number > 999999999999999) out.push("numero");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.competence)) out.push("competencia");
  if (!DT.test(i.issueDateTime)) out.push("data_emissao");
  const r = i.emitter.regime;
  if (!r || (r.opSimpNac === "3") !== !!r.regApTribSN) out.push("regime_tributario");
  const pc = i.values.pisCofins;
  if (pc && (!/^\d{2}$/.test(pc.cst) || !okPct(pc.pAliqPis, 99.99) || !okPct(pc.pAliqCofins, 99.99) || ((pc.pAliqPis == null) !== (pc.pAliqCofins == null)) || (pc.retType != null && !/^\d$/.test(pc.retType)))) out.push("pis_cofins");
  const fr = i.values.federalRetentions;
  if (fr && (!okPct(fr.cpRate, 100) || !okPct(fr.irrfRate, 100) || !okPct(fr.csllRate, 100))) out.push("retencoes_federais");
  const tt = i.values.totTrib;
  if (!tt) out.push("total_tributos");
  else if (tt.mode === "PERCENT" && !(tt.fed != null && tt.est != null && tt.mun != null && okPct(tt.fed, 999.99) && okPct(tt.est, 999.99) && okPct(tt.mun, 999.99))) out.push("total_tributos");
  else if (tt.mode === "SN") { if (tt.sn == null || !okPct(tt.sn, 99.99)) out.push("total_tributos"); else if (r && r.opSimpNac !== "3") out.push("total_tributos_regime"); }
  else if (!["IND", "PERCENT", "SN"].includes(tt.mode)) out.push("total_tributos");
  return out;
}

/** Id = "DPS" + cMun(7) + tpInsc(1: CPF, 2: CNPJ) + inscrição(14) + série(5) + nDPS(15). */
export function dpsId(i: DpsInput): string {
  return `DPS${i.emitter.municipalityIbge}2${digits(i.emitter.cnpj).padStart(14, "0")}${i.series.padStart(5, "0")}${String(i.number).padStart(15, "0")}`;
}

const pctOf = (base: number, rate: number) => Math.round(base * rate) / 100;

/**
 * Leiaute por ambiente (sem alterar produção):
 * - HOMOLOGATION: pacote oficial de produção restrita 20/10/2026 (SHA-256 25fdcecc…ea267):
 *   finNFSe (obrigatório, "0" = regular) entre tpEmit e cLocEmi; TCCServ = cTribNac, cTribMun?, cNBS?, cIntContrib?, xDescServ.
 * - PRODUCTION: pacote 1.01 de 09/02/2026 (sem finNFSe; cNBS após xDescServ), inalterado.
 */
export function dpsLayout(env: DpsInput["environment"]) {
  return env === "HOMOLOGATION" ? { finNFSe: true, nbsBeforeDesc: true } : { finNFSe: false, nbsBeforeDesc: false };
}

export function buildDpsXml(i: DpsInput): string {
  const issues = validateDps(i);
  if (issues.length) throw new Error(`dps_invalid:${issues.join(",")}`);
  const taker = docKey(i.taker.cnpjCpf);
  const tpAmb = i.environment === "PRODUCTION" ? "1" : "2";
  const r = i.emitter.regime!;
  const v = i.values;
  const opt = (tag: string, val: string | null | undefined) => has(val) ? `<${tag}>${esc(val!.trim())}</${tag}>` : "";
  const aliq = v.issRate != null ? `<pAliq>${dec2(v.issRate)}</pAliq>` : "";
  // TCTribFederal: piscofins?, vRetCP?, vRetIRRF?, vRetCSLL? — só o que o perfil declarou.
  let fed = "";
  if (v.pisCofins) {
    const p = v.pisCofins; const withRates = p.pAliqPis != null && p.pAliqCofins != null;
    fed += `<piscofins><CST>${p.cst}</CST>` +
      (withRates ? `<vBCPisCofins>${money(v.serviceAmount)}</vBCPisCofins><pAliqPis>${dec2(p.pAliqPis!)}</pAliqPis><pAliqCofins>${dec2(p.pAliqCofins!)}</pAliqCofins><vPis>${money(pctOf(v.serviceAmount, p.pAliqPis!))}</vPis><vCofins>${money(pctOf(v.serviceAmount, p.pAliqCofins!))}</vCofins>` : "") +
      (p.retType != null ? `<tpRetPisCofins>${p.retType}</tpRetPisCofins>` : "") + `</piscofins>`;
  }
  const fr = v.federalRetentions;
  if (fr?.cpRate != null) fed += `<vRetCP>${money(pctOf(v.serviceAmount, fr.cpRate))}</vRetCP>`;
  if (fr?.irrfRate != null) fed += `<vRetIRRF>${money(pctOf(v.serviceAmount, fr.irrfRate))}</vRetIRRF>`;
  if (fr?.csllRate != null) fed += `<vRetCSLL>${money(pctOf(v.serviceAmount, fr.csllRate))}</vRetCSLL>`;
  const tt = v.totTrib!;
  const lay = dpsLayout(i.environment);
  const nbs = has(i.service.nbsCode) ? `<cNBS>${i.service.nbsCode}</cNBS>` : "";
  const desc = `<xDescServ>${esc(i.service.description.trim())}</xDescServ>`;
  const tot = tt.mode === "PERCENT" ? `<pTotTrib><pTotTribFed>${dec2(tt.fed!)}</pTotTribFed><pTotTribEst>${dec2(tt.est!)}</pTotTribEst><pTotTribMun>${dec2(tt.mun!)}</pTotTribMun></pTotTrib>`
    : tt.mode === "SN" ? `<pTotTribSN>${dec2(tt.sn!)}</pTotTribSN>` : `<indTotTrib>0</indTotTrib>`;
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<DPS xmlns="${NFSE_NAMESPACE}" versao="${DPS_LAYOUT_VERSION}"><infDPS Id="${dpsId(i)}">` +
    `<tpAmb>${tpAmb}</tpAmb><dhEmi>${esc(i.issueDateTime)}</dhEmi><verAplic>CultivoFarm-1.0</verAplic>` +
    `<serie>${i.series}</serie><nDPS>${i.number}</nDPS><dCompet>${i.competence}</dCompet><tpEmit>1</tpEmit>${lay.finNFSe ? "<finNFSe>0</finNFSe>" : ""}` +
    `<cLocEmi>${i.emitter.municipalityIbge}</cLocEmi>` +
    // TCInfoPrestador: CNPJ, IM?, [xNome/end não informados quando o emitente é o prestador], fone?, email?, regTrib
    `<prest><CNPJ>${docKey(i.emitter.cnpj)}</CNPJ>${opt("IM", i.emitter.municipalRegistration)}` +
    `${has(i.emitter.phone) ? `<fone>${digits(i.emitter.phone)}</fone>` : ""}${opt("email", i.emitter.email)}` +
    `<regTrib><opSimpNac>${r.opSimpNac}</opSimpNac>${r.regApTribSN ? `<regApTribSN>${r.regApTribSN}</regApTribSN>` : ""}<regEspTrib>${r.regEspTrib}</regEspTrib></regTrib></prest>` +
    // TCInfoPessoa: CNPJ|CPF, IM?, xNome, fone?, email?
    `<toma>${taker.length === 14 ? `<CNPJ>${taker}</CNPJ>` : `<CPF>${taker}</CPF>`}${opt("IM", i.taker.municipalRegistration)}<xNome>${esc(i.taker.name.trim())}</xNome>` +
    `${has(i.taker.phone) ? `<fone>${digits(i.taker.phone)}</fone>` : ""}${opt("email", i.taker.email)}</toma>` +
    `<serv><locPrest><cLocPrestacao>${i.service.locationIbge}</cLocPrestacao></locPrest>` +
    `<cServ><cTribNac>${i.service.nationalTaxCode}</cTribNac>${opt("cTribMun", i.service.municipalTaxCode)}${lay.nbsBeforeDesc ? nbs + desc : desc + nbs}</cServ></serv>` +
    `<valores><vServPrest><vServ>${money(v.serviceAmount)}</vServ></vServPrest>` +
    `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>${v.issWithheld ? "2" : "1"}</tpRetISSQN>${aliq}</tribMun>` +
    `${fed ? `<tribFed>${fed}</tribFed>` : ""}<totTrib>${tot}</totTrib></trib></valores>` +
    `</infDPS></DPS>`;
}

/** Endpoints oficiais da SefinNacional (API REST, mTLS). */
export const SEFIN_NACIONAL_BASE = {
  HOMOLOGATION: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
  PRODUCTION: "https://sefin.nfse.gov.br/SefinNacional",
} as const;
/** Compatibilidade com consumidores anteriores. */
export const SEFIN_NACIONAL_ENDPOINTS = {
  HOMOLOGATION: `${SEFIN_NACIONAL_BASE.HOMOLOGATION}/nfse`,
} as const;
