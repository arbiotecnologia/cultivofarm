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
  emitter: { cnpj: string; municipalityIbge: string; municipalRegistration?: string | null; regime?: DpsRegime | null };
  taker: { cnpjCpf: string; name: string; email?: string | null };
  service: { nationalTaxCode: string; municipalTaxCode?: string | null; description: string; incidenceMunicipalityIbge: string };
  values: { serviceAmount: number; issRate?: number | null; issWithheld: boolean };
}

export type DpsIssue = "cnpj_emitente" | "municipio_emitente" | "documento_tomador" | "nome_tomador" | "codigo_tributacao_nacional" | "descricao" | "municipio_incidencia" | "valor" | "aliquota_iss" | "serie" | "numero" | "competencia" | "data_emissao" | "regime_tributario";

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const DT = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2}$/;

/** CRT do emitente → TCRegTrib. CRT ausente/desconhecido não é presumido. */
export function regimeFromCrt(crt: string | null | undefined): DpsRegime | null {
  switch ((crt ?? "").trim()) {
    case "1": return { opSimpNac: "3", regApTribSN: "1", regEspTrib: "0" };
    case "4": return { opSimpNac: "2", regEspTrib: "0" };
    case "2": case "3": return { opSimpNac: "1", regEspTrib: "0" };
    default: return null;
  }
}

export function validateDps(i: DpsInput): DpsIssue[] {
  const out: DpsIssue[] = [];
  if (digits(i.emitter.cnpj).length !== 14) out.push("cnpj_emitente");
  if (!/^\d{7}$/.test(i.emitter.municipalityIbge)) out.push("municipio_emitente");
  const t = digits(i.taker.cnpjCpf); if (t.length !== 11 && t.length !== 14) out.push("documento_tomador");
  if (!i.taker.name.trim() || i.taker.name.trim().length > 300) out.push("nome_tomador");
  if (!/^\d{6}$/.test(digits(i.service.nationalTaxCode))) out.push("codigo_tributacao_nacional");
  if (!i.service.description.trim() || i.service.description.length > 2000) out.push("descricao");
  if (!/^\d{7}$/.test(i.service.incidenceMunicipalityIbge)) out.push("municipio_incidencia");
  if (!(i.values.serviceAmount > 0) || i.values.serviceAmount >= 1e13) out.push("valor");
  if (i.values.issRate != null && !(i.values.issRate >= 0 && i.values.issRate < 10)) out.push("aliquota_iss");
  if (!/^\d{1,5}$/.test(i.series)) out.push("serie");
  if (!Number.isInteger(i.number) || i.number < 1 || i.number > 999999999999999) out.push("numero");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.competence)) out.push("competencia");
  if (!DT.test(i.issueDateTime)) out.push("data_emissao");
  const r = i.emitter.regime;
  if (r && (r.opSimpNac === "3") !== !!r.regApTribSN) out.push("regime_tributario");
  return out;
}

/** Id = "DPS" + cMun(7) + tpInsc(1: CPF, 2: CNPJ) + inscrição(14) + série(5) + nDPS(15). */
export function dpsId(i: DpsInput): string {
  return `DPS${i.emitter.municipalityIbge}2${digits(i.emitter.cnpj).padStart(14, "0")}${i.series.padStart(5, "0")}${String(i.number).padStart(15, "0")}`;
}

export function buildDpsXml(i: DpsInput): string {
  const issues = validateDps(i);
  if (issues.length) throw new Error(`dps_invalid:${issues.join(",")}`);
  const taker = digits(i.taker.cnpjCpf);
  const tpAmb = i.environment === "PRODUCTION" ? "1" : "2";
  const r = i.emitter.regime ?? { opSimpNac: "1", regEspTrib: "0" };
  const aliq = i.values.issRate != null ? `<pAliq>${i.values.issRate.toFixed(2)}</pAliq>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<DPS xmlns="${NFSE_NAMESPACE}" versao="${DPS_LAYOUT_VERSION}"><infDPS Id="${dpsId(i)}">` +
    `<tpAmb>${tpAmb}</tpAmb><dhEmi>${esc(i.issueDateTime)}</dhEmi><verAplic>CultivoFarm-1.0</verAplic>` +
    `<serie>${i.series}</serie><nDPS>${i.number}</nDPS><dCompet>${i.competence}</dCompet><tpEmit>1</tpEmit>` +
    `<cLocEmi>${i.emitter.municipalityIbge}</cLocEmi>` +
    `<prest><CNPJ>${digits(i.emitter.cnpj)}</CNPJ>${i.emitter.municipalRegistration ? `<IM>${esc(i.emitter.municipalRegistration)}</IM>` : ""}` +
    `<regTrib><opSimpNac>${r.opSimpNac}</opSimpNac>${r.regApTribSN ? `<regApTribSN>${r.regApTribSN}</regApTribSN>` : ""}<regEspTrib>${r.regEspTrib}</regEspTrib></regTrib></prest>` +
    `<toma>${taker.length === 14 ? `<CNPJ>${taker}</CNPJ>` : `<CPF>${taker}</CPF>`}<xNome>${esc(i.taker.name.trim())}</xNome>${i.taker.email ? `<email>${esc(i.taker.email.trim())}</email>` : ""}</toma>` +
    `<serv><locPrest><cLocPrestacao>${i.service.incidenceMunicipalityIbge}</cLocPrestacao></locPrest>` +
    `<cServ><cTribNac>${digits(i.service.nationalTaxCode)}</cTribNac>${i.service.municipalTaxCode ? `<cTribMun>${esc(i.service.municipalTaxCode)}</cTribMun>` : ""}<xDescServ>${esc(i.service.description.trim())}</xDescServ></cServ></serv>` +
    `<valores><vServPrest><vServ>${money(i.values.serviceAmount)}</vServ></vServPrest>` +
    `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>${i.values.issWithheld ? "2" : "1"}</tpRetISSQN>${aliq}</tribMun><totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores>` +
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
