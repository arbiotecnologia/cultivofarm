/**
 * Contrato da API SefinNacional (Emissor Público Nacional, manual de
 * contribuintes v1.2 out/2025): POST /nfse com {"dpsXmlGZipB64"}, GET
 * /nfse/{chaveAcesso}, GET /dps/{idDps}. Módulo puro (Web APIs): sem rede,
 * sem segredos. Autorização só é aceita após verificação do XML da NFS-e
 * devolvido — nunca por status HTTP isolado.
 */
import { NFSE_NAMESPACE, SEFIN_NACIONAL_BASE } from "./dps.ts";

export type NfseEnvironment = "HOMOLOGATION" | "PRODUCTION";
const HOSTS: Record<NfseEnvironment, string> = {
  HOMOLOGATION: "sefin.producaorestrita.nfse.gov.br",
  PRODUCTION: "sefin.nfse.gov.br",
};

export class SefinContractError extends Error {
  constructor(readonly code: string, message?: string) { super(message ?? code); this.name = "SefinContractError"; }
}

/** URL oficial para a operação; host divergente do ambiente é bloqueio duro. */
export function sefinUrl(env: NfseEnvironment, op: { kind: "emit" } | { kind: "nfse"; chave: string } | { kind: "dps"; id: string }): string {
  const base = SEFIN_NACIONAL_BASE[env];
  if (!base) throw new SefinContractError("NFSE_ENVIRONMENT_INVALID");
  let path = "/nfse";
  if (op.kind === "nfse") { if (!/^\d{50}$/.test(op.chave)) throw new SefinContractError("NFSE_ACCESS_KEY_INVALID"); path = `/nfse/${op.chave}`; }
  if (op.kind === "dps") { if (!/^DPS\d{42}$/.test(op.id)) throw new SefinContractError("NFSE_DPS_ID_INVALID"); path = `/dps/${op.id}`; }
  const url = base + path;
  assertSefinUrl(url, env);
  return url;
}

export function assertSefinUrl(url: string, env: NfseEnvironment): void {
  let u: URL;
  try { u = new URL(url); } catch { throw new SefinContractError("NFSE_ENDPOINT_BLOCKED"); }
  if (u.protocol !== "https:" || u.host !== HOSTS[env] || u.username || u.password || u.port) throw new SefinContractError("NFSE_ENDPOINT_BLOCKED");
}

async function pump(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []; const reader = stream.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function gzipBase64(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return b64(await pump(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"))));
}
/** Limite de 5 MiB descompactado: resposta maior é tratada como inválida. */
export async function gunzipBase64(data: string, maxBytes = 5 * 1024 * 1024): Promise<string> {
  let raw: Uint8Array;
  try { raw = unb64(data.replace(/\s+/g, "")); } catch { throw new SefinContractError("NFSE_RESPONSE_GZIP_INVALID"); }
  if (raw.length < 2 || raw[0] !== 0x1f || raw[1] !== 0x8b) throw new SefinContractError("NFSE_RESPONSE_GZIP_INVALID");
  let out: Uint8Array;
  try { out = await pump(new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))); } catch { throw new SefinContractError("NFSE_RESPONSE_GZIP_INVALID"); }
  if (out.length > maxBytes) throw new SefinContractError("NFSE_RESPONSE_TOO_LARGE");
  return new TextDecoder("utf-8", { fatal: true }).decode(out);
}

export async function buildEmitBody(signedDpsXml: string): Promise<string> {
  if (!signedDpsXml.includes("<Signature")) throw new SefinContractError("NFSE_DPS_NOT_SIGNED");
  return JSON.stringify({ dpsXmlGZipB64: await gzipBase64(signedDpsXml) });
}

export interface SefinMessage { code: string; description: string }
export type EmitParse =
  | { kind: "NFSE_RETURNED"; chaveAcesso: string; idDps: string | null; nfseXmlGZipB64: string; alerts: SefinMessage[] }
  | { kind: "REJECTED"; errors: SefinMessage[]; duplicate: boolean }
  | { kind: "UNKNOWN"; httpStatus: number; reason: string };

/** Rejeições que indicam DPS já processada: exigem consulta, nunca reenvio. */
export const DUPLICATE_DPS_CODES = new Set(["E0014", "E0015"]);
const clean = (v: unknown, n = 300) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, n);
function messages(v: unknown): SefinMessage[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 50).map((e) => { const o = (e ?? {}) as Record<string, unknown>;
    return { code: clean(o.Codigo ?? o.codigo, 20), description: clean(o.Descricao ?? o.descricao ?? o.Complemento) }; });
}

export function parseEmitResponse(httpStatus: number, bodyText: string): EmitParse {
  let body: Record<string, unknown>;
  try { body = JSON.parse(bodyText); } catch { return { kind: "UNKNOWN", httpStatus, reason: "body_not_json" }; }
  if (!body || typeof body !== "object") return { kind: "UNKNOWN", httpStatus, reason: "body_not_object" };
  const chave = typeof body.chaveAcesso === "string" ? body.chaveAcesso : "";
  const gz = typeof body.nfseXmlGZipB64 === "string" ? body.nfseXmlGZipB64 : "";
  if (httpStatus >= 200 && httpStatus < 300 && /^\d{50}$/.test(chave) && gz) {
    return { kind: "NFSE_RETURNED", chaveAcesso: chave, idDps: typeof body.idDps === "string" ? body.idDps : null, nfseXmlGZipB64: gz, alerts: messages(body.alertas) };
  }
  const errors = messages(body.erros ?? body.Erros ?? body.erro);
  if (httpStatus >= 400 && httpStatus < 500 && errors.length) {
    return { kind: "REJECTED", errors, duplicate: errors.some((e) => DUPLICATE_DPS_CODES.has(e.code)) };
  }
  return { kind: "UNKNOWN", httpStatus, reason: httpStatus >= 500 ? "server_error" : "unexpected_shape" };
}

/**
 * Códigos OFICIAIS que identificam "DPS não localizada". Vazio de propósito: o Swagger da produção
 * restrita exige certificado e não foi lido; sem código oficial confirmado nenhum 404 vira NOT_FOUND.
 */
export const DPS_NOT_FOUND_OFFICIAL_CODES: ReadonlySet<string> = new Set<string>();

export function parseDpsLookup(httpStatus: number, bodyText: string): { found: boolean; chaveAcesso: string | null; notFoundConfirmed: boolean } {
  let b: Record<string, unknown> | null = null;
  try { const j = JSON.parse(bodyText); b = j && typeof j === "object" && !Array.isArray(j) ? j as Record<string, unknown> : null; } catch { b = null; }
  if (httpStatus === 200 && b) { const c = String(b.chaveAcesso ?? ""); if (/^\d{50}$/.test(c)) return { found: true, chaveAcesso: c, notFoundConfirmed: false }; }
  if (httpStatus === 404 && b) {
    const list = (b.erros ?? b.Erros ?? b.erro) as unknown; const arr = Array.isArray(list) ? list : list ? [list] : [];
    const codes = arr.map((x) => String((x as Record<string, unknown>)?.Codigo ?? (x as Record<string, unknown>)?.codigo ?? ""));
    if (codes.some((c) => DPS_NOT_FOUND_OFFICIAL_CODES.has(c))) return { found: false, chaveAcesso: null, notFoundConfirmed: true };
  }
  return { found: false, chaveAcesso: null, notFoundConfirmed: false };
}

export interface AuthorizationCheck {
  ok: boolean; reasons: string[]; nfseNumber: string | null; dhProc: string | null;
}
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1] ?? null;

/**
 * Verifica o XML da NFS-e devolvido contra a DPS enviada: namespace, Id da
 * infNFSe = "NFS"+chave, DPS embutida com o mesmo Id, ambiente, CNPJ do
 * prestador, valor do serviço e presença da assinatura do Sistema Nacional.
 * A cadeia ICP-Brasil da assinatura do município NÃO é verificada aqui.
 */
export function verifyAuthorizedNfse(args: {
  nfseXml: string; chaveAcesso: string; expectedDpsId: string; expectedTpAmb: "1" | "2"; expectedCnpj: string; expectedServiceAmount: string;
}): AuthorizationCheck {
  const r: string[] = []; const x = args.nfseXml;
  if (!/^\d{50}$/.test(args.chaveAcesso)) r.push("access_key_invalid");
  if (!/<NFSe\b[^>]*xmlns="http:\/\/www\.sped\.fazenda\.gov\.br\/nfse"/.test(x)) r.push("nfse_root_namespace");
  if (!x.includes(`<infNFSe Id="NFS${args.chaveAcesso}"`)) r.push("infnfse_id_mismatch");
  if (!x.includes(`<infDPS Id="${args.expectedDpsId}"`)) r.push("dps_id_mismatch");
  const infDps = x.slice(Math.max(0, x.indexOf("<infDPS")));
  if (tag(infDps, "tpAmb") !== args.expectedTpAmb) r.push("environment_mismatch");
  const prest = infDps.match(/<prest>([\s\S]*?)<\/prest>/)?.[1] ?? "";
  if (tag(prest, "CNPJ") !== args.expectedCnpj) r.push("emitter_mismatch");
  if (tag(infDps, "vServ") !== args.expectedServiceAmount) r.push("amount_mismatch");
  const head = x.slice(0, Math.max(0, x.indexOf("<DPS")));
  if (!/<Signature\b/.test(x.slice(x.lastIndexOf("</infNFSe>")))) r.push("nfse_signature_absent");
  void NFSE_NAMESPACE;
  return { ok: r.length === 0, reasons: r, nfseNumber: tag(head, "nNFSe"), dhProc: tag(head, "dhProc") };
}
