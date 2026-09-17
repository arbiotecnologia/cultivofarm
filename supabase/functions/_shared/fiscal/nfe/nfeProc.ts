/**
 * H14 — Montagem do `nfeProc` (NFe assinada + protNFe autorizado).
 *
 * Fail-closed: nenhum fragmento vem do cliente. A NFe vem do XML assinado já
 * armazenado (`fiscal_xml_runs.signed_path`) e o `protNFe` vem exclusivamente
 * da resposta da SEFAZ persistida pela própria Edge Function.
 *
 * Nunca monta documento de produção: `tpAmb` diferente de `2` é recusado.
 */

export const NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
export const NFEPROC_VERSION = "4.00";

export class NfeProcError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = "NfeProcError";
  }
}

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]*)</(?:\\w+:)?${name}>`, "i").exec(xml);
  return m ? m[1].trim() : null;
}

/** Extrai o elemento `<NFe>` (com assinatura) do XML assinado armazenado. */
export function extractSignedNfe(signedXml: string): string {
  const block = /<(?:\w+:)?NFe[\s>][\s\S]*?<\/(?:\w+:)?NFe>/i.exec(signedXml)?.[0] ?? "";
  if (!block) throw new NfeProcError("NFEPROC_SIGNED_NFE_NOT_FOUND");
  if (!/<(?:\w+:)?Signature[\s>]/i.test(block)) {
    throw new NfeProcError("NFEPROC_SIGNED_NFE_UNSIGNED");
  }
  return block;
}

/** Extrai o bloco `<protNFe>` da resposta bruta da SEFAZ. */
export function extractProtNFe(responseXml: string): string {
  const block = /<(?:\w+:)?protNFe[\s>][\s\S]*?<\/(?:\w+:)?protNFe>/i.exec(responseXml)?.[0] ?? "";
  if (!block) throw new NfeProcError("NFEPROC_PROTOCOL_NOT_FOUND");
  return block;
}

export interface BuildNfeProcInput {
  signedXml: string;
  responseXml: string;
  accessKey: string;
  protocol: string;
  tpAmb?: string;
}

export interface BuiltNfeProc {
  xml: string;
  accessKey: string;
  protocol: string;
}

const AUTHORIZED_CSTAT = ["100", "150"];

/**
 * Monta o `nfeProc` validando chave, ambiente e protocolo. Qualquer divergência
 * entre o documento assinado, o retorno da SEFAZ e os dados já persistidos
 * falha fechado — jamais gera artefato "aproximado".
 */
export function buildNfeProc(input: BuildNfeProcInput): BuiltNfeProc {
  const accessKey = String(input.accessKey ?? "").trim();
  const protocol = String(input.protocol ?? "").trim();
  if (!/^[0-9]{44}$/.test(accessKey)) throw new NfeProcError("NFEPROC_ACCESS_KEY_INVALID");
  if (!/^[0-9]{1,20}$/.test(protocol)) throw new NfeProcError("NFEPROC_PROTOCOL_INVALID");

  const nfe = extractSignedNfe(input.signedXml);
  const prot = extractProtNFe(input.responseXml);

  const infNfeId = /Id="NFe([0-9]{44})"/i.exec(nfe)?.[1] ?? null;
  if (!infNfeId || infNfeId !== accessKey) throw new NfeProcError("NFEPROC_ACCESS_KEY_MISMATCH");

  if (tag(prot, "chNFe") !== accessKey) throw new NfeProcError("NFEPROC_ACCESS_KEY_MISMATCH");
  if (tag(prot, "nProt") !== protocol) throw new NfeProcError("NFEPROC_PROTOCOL_MISMATCH");

  const cStat = tag(prot, "cStat") ?? "";
  if (!AUTHORIZED_CSTAT.includes(cStat)) throw new NfeProcError("NFEPROC_NOT_AUTHORIZED");

  const protAmb = tag(prot, "tpAmb");
  const docAmb = tag(nfe, "tpAmb");
  const expected = input.tpAmb ?? "2";
  if (expected !== "2" || protAmb !== "2" || docAmb !== "2") {
    throw new NfeProcError("FISCAL_PRODUCTION_ENDPOINT_BLOCKED");
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<nfeProc xmlns="${NFE_NAMESPACE}" versao="${NFEPROC_VERSION}">${nfe}${prot}</nfeProc>`;
  return { xml, accessKey, protocol };
}

/** Caminho determinístico e idempotente por nota/chave/protocolo. */
export function nfeProcStoragePath(invoiceId: string, accessKey: string, protocol: string): string {
  return `nfeproc/${invoiceId}/${accessKey}-${protocol}.xml`;
}

export async function sha256HexOf(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
