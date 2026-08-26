/**
 * FASE H7f — Camada SOAP pura da NF-e 4.00 (SEFAZ-MG HOMOLOGAÇÃO).
 *
 * Módulo determinístico e testável: monta envelopes, extrai o retorno e
 * sanitiza qualquer texto antes de virar log/response. NÃO faz I/O, não lê
 * secrets e não conhece certificado — o transporte real vive na Edge
 * Function `fiscal-sefaz-transport`.
 *
 * Regras absolutas:
 *   - `tpAmb` sempre '2'. Qualquer outro valor é rejeitado na origem.
 *   - Nenhum texto devolvido pode conter PEM, chave, token ou base64 longo.
 */
import type { SefazService } from "../sefazEndpoints.ts";

export const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
export const SOAP12_NS = "http://www.w3.org/2003/05/soap-envelope";

/** cUF de Minas Gerais (tabela IBGE) — único estado habilitado nesta fase. */
export const CUF_MG = "31";

export class SefazSoapError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "SefazSoapError";
  }
}

function assertHomologation(tpAmb: string): void {
  if (tpAmb !== "2") {
    throw new SefazSoapError(
      "FISCAL_PRODUCTION_ENDPOINT_BLOCKED",
      "somente tpAmb=2 (homologação) é permitido",
    );
  }
}

/** Namespace do serviço, usado no atributo `xmlns` de `nfeDadosMsg`. */
export function serviceNamespace(service: SefazService): string {
  const map: Record<SefazService, string> = {
    NFeStatusServico4: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4",
    NFeAutorizacao4: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4",
    NFeRetAutorizacao4: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4",
    NFeConsultaProtocolo4: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4",
    NFeRecepcaoEvento4: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4",
    NFeInutilizacao4: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4",
  };
  const ns = map[service];
  if (!ns) throw new SefazSoapError("SEFAZ_SERVICE_UNKNOWN", `serviço desconhecido: ${service}`);
  return ns;
}

/** Envelope SOAP 1.2 padrão do Portal Nacional (elemento `nfeDadosMsg`). */
export function buildSoapEnvelope(service: SefazService, innerXml: string): string {
  if (!innerXml.trim().startsWith("<")) {
    throw new SefazSoapError("SEFAZ_SOAP_BODY_INVALID", "corpo da mensagem inválido");
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="${SOAP12_NS}">` +
    `<soap12:Body>` +
    `<nfeDadosMsg xmlns="${serviceNamespace(service)}">${innerXml}</nfeDadosMsg>` +
    `</soap12:Body></soap12:Envelope>`
  );
}

// ---------------------------------------------------------------------------
// Corpos das mensagens
// ---------------------------------------------------------------------------

export function buildConsStatServ(tpAmb: string, cUF = CUF_MG): string {
  assertHomologation(tpAmb);
  return (
    `<consStatServ xmlns="${NFE_NS}" versao="4.00">` +
    `<tpAmb>${tpAmb}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ>`
  );
}

export function buildConsSitNFe(tpAmb: string, chNFe: string): string {
  assertHomologation(tpAmb);
  if (!/^\d{44}$/.test(chNFe)) {
    throw new SefazSoapError("SEFAZ_ACCESS_KEY_INVALID", "chave de acesso inválida");
  }
  return (
    `<consSitNFe xmlns="${NFE_NS}" versao="4.00">` +
    `<tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chNFe}</chNFe></consSitNFe>`
  );
}

export function buildConsReciNFe(tpAmb: string, nRec: string): string {
  assertHomologation(tpAmb);
  if (!/^\d{10,20}$/.test(nRec)) {
    throw new SefazSoapError("SEFAZ_RECEIPT_INVALID", "número de recibo inválido");
  }
  return (
    `<consReciNFe xmlns="${NFE_NS}" versao="4.00">` +
    `<tpAmb>${tpAmb}</tpAmb><nRec>${nRec}</nRec></consReciNFe>`
  );
}

/**
 * Lote de autorização. `signedNfeXml` deve ser o XML JÁ ASSINADO produzido
 * pelo `fiscal-xml-engine` — este módulo nunca assina nem altera o documento.
 */
export function buildEnviNFe(args: {
  tpAmb: string;
  idLote: string;
  signedNfeXml: string;
  indSinc?: "0" | "1";
}): string {
  assertHomologation(args.tpAmb);
  if (!/^\d{1,15}$/.test(args.idLote)) {
    throw new SefazSoapError("SEFAZ_LOTE_INVALID", "idLote inválido");
  }
  const xml = args.signedNfeXml.replace(/^<\?xml[^>]*\?>\s*/i, "").trim();
  if (!xml.includes("<NFe") || !xml.includes("<Signature")) {
    throw new SefazSoapError("SEFAZ_DOCUMENT_NOT_SIGNED", "documento não assinado");
  }
  if (!xml.includes(`<tpAmb>${args.tpAmb}</tpAmb>`)) {
    throw new SefazSoapError(
      "FISCAL_PRODUCTION_ENDPOINT_BLOCKED",
      "tpAmb do documento diverge do ambiente de homologação",
    );
  }
  return (
    `<enviNFe xmlns="${NFE_NS}" versao="4.00">` +
    `<idLote>${args.idLote}</idLote><indSinc>${args.indSinc ?? "1"}</indSinc>${xml}</enviNFe>`
  );
}

/** Envelope de evento já assinado (cancelamento / CC-e). */
export function buildEnvEvento(args: {
  tpAmb: string;
  idLote: string;
  signedEventXml: string;
}): string {
  assertHomologation(args.tpAmb);
  const xml = args.signedEventXml.replace(/^<\?xml[^>]*\?>\s*/i, "").trim();
  if (!xml.includes("<evento") || !xml.includes("<Signature")) {
    throw new SefazSoapError("SEFAZ_EVENT_NOT_SIGNED", "evento não assinado");
  }
  if (!xml.includes(`<tpAmb>${args.tpAmb}</tpAmb>`)) {
    throw new SefazSoapError(
      "FISCAL_PRODUCTION_ENDPOINT_BLOCKED",
      "tpAmb do evento diverge do ambiente de homologação",
    );
  }
  return (
    `<envEvento xmlns="${NFE_NS}" versao="1.00">` +
    `<idLote>${args.idLote}</idLote>${xml}</envEvento>`
  );
}

// ---------------------------------------------------------------------------
// Leitura do retorno
// ---------------------------------------------------------------------------

export interface SefazResult {
  cStat: string | null;
  xMotivo: string | null;
  tpAmb: string | null;
  chNFe: string | null;
  nProt: string | null;
  nRec: string | null;
  dhRecbto: string | null;
  /** cStat do protocolo do documento, quando o lote traz `protNFe`. */
  protocolCStat: string | null;
}

function firstTag(xml: string, tag: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${tag}>`, "i").exec(xml);
  return m ? m[1].trim() : null;
}

/** Extrai o resultado canônico de qualquer retorno NF-e 4.00. */
export function parseSefazResult(xml: string): SefazResult {
  const protBlock = /<(?:\w+:)?protNFe[\s\S]*?<\/(?:\w+:)?protNFe>/i.exec(xml)?.[0] ?? "";
  const evtBlock = /<(?:\w+:)?retEvento[\s\S]*?<\/(?:\w+:)?retEvento>/i.exec(xml)?.[0] ?? "";
  const detail = protBlock || evtBlock;
  return {
    cStat: firstTag(detail, "cStat") ?? firstTag(xml, "cStat"),
    xMotivo: firstTag(detail, "xMotivo") ?? firstTag(xml, "xMotivo"),
    tpAmb: firstTag(xml, "tpAmb"),
    chNFe: firstTag(detail, "chNFe") ?? firstTag(xml, "chNFe"),
    nProt: firstTag(detail, "nProt"),
    nRec: firstTag(xml, "nRec"),
    dhRecbto: firstTag(detail, "dhRecbto") ?? firstTag(xml, "dhRecbto"),
    protocolCStat: protBlock ? firstTag(protBlock, "cStat") : null,
  };
}

/** cStat de autorização/uso concedido (100) e autorização fora de prazo (150). */
export const AUTHORIZED_CSTAT = ["100", "150"];
/** cStat de serviço em operação. */
export const SERVICE_UP_CSTAT = ["107"];

export function isAuthorized(result: SefazResult): boolean {
  return AUTHORIZED_CSTAT.includes(result.protocolCStat ?? result.cStat ?? "");
}

/**
 * Rejeições em que reenviar é INSEGURO ou inútil (duplicidade / documento já
 * existente). Retry automático só é permitido fora desta lista.
 */
export const NON_RETRYABLE_CSTAT = ["100", "150", "204", "539", "110", "301", "302"];

export function isRetryable(result: SefazResult): boolean {
  const c = result.protocolCStat ?? result.cStat ?? "";
  if (!c) return true;
  return !NON_RETRYABLE_CSTAT.includes(c);
}

// ---------------------------------------------------------------------------
// Sanitização
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}/g,
  /[A-Za-z0-9+/]{120,}={0,2}/g,
];

/** Remove qualquer material sensível e limita o tamanho antes de logar/responder. */
export function sanitizeSefazText(input: unknown, maxLength = 500): string {
  let text = typeof input === "string" ? input : String(input ?? "");
  for (const re of SECRET_PATTERNS) text = text.replace(re, "[REDACTED]");
  text = text.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** Resumo sanitizado e estável, seguro para persistir em `response_summary`. */
export function summarizeResponse(args: {
  httpStatus: number;
  result: SefazResult;
  durationMs: number;
}): Record<string, unknown> {
  return {
    httpStatus: args.httpStatus,
    durationMs: args.durationMs,
    cStat: args.result.cStat,
    xMotivo: sanitizeSefazText(args.result.xMotivo ?? "", 200),
    protocolCStat: args.result.protocolCStat,
    tpAmb: args.result.tpAmb,
  };
}
