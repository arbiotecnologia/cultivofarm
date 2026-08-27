/**
 * FASE H7g — Geração e assinatura server-side do evento NF-e 4.00
 * (cancelamento 110111 e CC-e 110110) em HOMOLOGAÇÃO.
 *
 * H7G-002: nenhum XML de evento vindo do cliente é aceito. O documento é
 * construído a partir do evento fiscal canônico (`fiscal_events`) e assinado
 * com o mesmo cofre A1 usado pela NF-e — material apenas em memória.
 */

export const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
export const EVENT_VERSION = "1.00";
export const CANCEL_CODE = "110111";
export const CORRECTION_CODE = "110110";

export const CCE_COND_USO =
  "A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do " +
  "Convenio S/N, de 15 de dezembro de 1970 e pode ser utilizada para " +
  "regularizacao de erro ocorrido na emissao de documento fiscal, desde que o " +
  "erro nao esteja relacionado com: I - as variaveis que determinam o valor do " +
  "imposto tais como: base de calculo, aliquota, diferenca de preco, quantidade, " +
  "valor da operacao ou da prestacao; II - a correcao de dados cadastrais que " +
  "implique mudanca do remetente ou do destinatario; III - a data de emissao ou " +
  "de saida.";

export class FiscalEventXmlError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "FiscalEventXmlError";
  }
}

/** Escapa texto para conteúdo XML (sem CDATA, sem comentário). */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export interface BuildEventoArgs {
  tpAmb: string;
  cOrgao: string;
  cnpj: string;
  accessKey: string;
  eventCode: string;
  seqEvento: number;
  reason: string;
  protocol?: string | null;
  dhEvento: string;
}

export interface BuiltEvento {
  xml: string;
  infEventoId: string;
}

export function buildEventoXml(args: BuildEventoArgs): BuiltEvento {
  if (args.tpAmb !== "2") {
    throw new FiscalEventXmlError(
      "FISCAL_PRODUCTION_ENDPOINT_BLOCKED",
      "evento fiscal permitido apenas em homologação",
    );
  }
  if (!/^[0-9]{44}$/.test(args.accessKey)) {
    throw new FiscalEventXmlError("SEFAZ_ACCESS_KEY_INVALID");
  }
  if (!/^[0-9]{14}$/.test(args.cnpj)) {
    throw new FiscalEventXmlError("FISCAL_EVENT_CNPJ_INVALID");
  }
  if (!Number.isInteger(args.seqEvento) || args.seqEvento < 1 || args.seqEvento > 20) {
    throw new FiscalEventXmlError("FISCAL_EVENT_SEQUENCE_INVALID");
  }
  const reason = args.reason.trim();
  let detEvento: string;
  if (args.eventCode === CANCEL_CODE) {
    if (reason.length < 15 || reason.length > 255) {
      throw new FiscalEventXmlError("FISCAL_EVENT_REASON_INVALID");
    }
    if (!args.protocol) throw new FiscalEventXmlError("FISCAL_EVENT_PROTOCOL_REQUIRED");
    detEvento =
      `<detEvento versao="${EVENT_VERSION}">` +
      `<descEvento>Cancelamento</descEvento>` +
      `<nProt>${escapeXml(args.protocol)}</nProt>` +
      `<xJust>${escapeXml(reason)}</xJust>` +
      `</detEvento>`;
  } else if (args.eventCode === CORRECTION_CODE) {
    if (reason.length < 15 || reason.length > 1000) {
      throw new FiscalEventXmlError("FISCAL_EVENT_REASON_INVALID");
    }
    detEvento =
      `<detEvento versao="${EVENT_VERSION}">` +
      `<descEvento>Carta de Correcao</descEvento>` +
      `<xCorrecao>${escapeXml(reason)}</xCorrecao>` +
      `<xCondUso>${escapeXml(CCE_COND_USO)}</xCondUso>` +
      `</detEvento>`;
  } else {
    throw new FiscalEventXmlError("FISCAL_EVENT_TYPE_UNSUPPORTED");
  }

  const seq = String(args.seqEvento).padStart(2, "0");
  const infEventoId = `ID${args.eventCode}${args.accessKey}${seq}`;

  const xml =
    `<evento xmlns="${NFE_NS}" versao="${EVENT_VERSION}">` +
    `<infEvento Id="${infEventoId}">` +
    `<cOrgao>${args.cOrgao}</cOrgao>` +
    `<tpAmb>${args.tpAmb}</tpAmb>` +
    `<CNPJ>${args.cnpj}</CNPJ>` +
    `<chNFe>${args.accessKey}</chNFe>` +
    `<dhEvento>${args.dhEvento}</dhEvento>` +
    `<tpEvento>${args.eventCode}</tpEvento>` +
    `<nSeqEvento>${args.seqEvento}</nSeqEvento>` +
    `<verEvento>${EVENT_VERSION}</verEvento>` +
    detEvento +
    `</infEvento>` +
    `</evento>`;

  return { xml, infEventoId };
}

/** C14N do nó `infEvento` gerado acima (namespace default herdado de `evento`). */
export function canonicalizeInfEvento(xml: string): string {
  const start = xml.indexOf("<infEvento ");
  const end = xml.indexOf("</infEvento>");
  if (start < 0 || end < 0) {
    throw new FiscalEventXmlError("FISCAL_EVENT_NO_INFEVENTO");
  }
  const fragment = xml.slice(start, end + "</infEvento>".length);
  if (fragment.includes("xmlns=")) return fragment;
  return fragment.replace("<infEvento ", `<infEvento xmlns="${NFE_NS}" `);
}
