/**
 * Diagnóstico seguro de chamadas HTTPS/mTLS ao Sistema Nacional (consulta/reconciliação).
 * Só enums allowlisted: etapa, classe, causas encadeadas, status HTTP, tipo de conteúdo e
 * capacidades do runtime. Nunca URL com identificador, corpo, XML, mensagem bruta, credenciais
 * ou dados pessoais. As mensagens de erro do runtime são lidas apenas para classificar.
 */
export type NfseHttpStage = "dps_lookup" | "nfse_download" | "emit" | "route_probe" | "unknown";
export type NfseHttpFailure =
  | "certificate_unavailable" | "mtls_unavailable" | "mtls_client_rejected" | "timeout" | "tls_error" | "network_error"
  | "dns_error" | "tcp_error" | "unsupported_feature" | "http2_error"
  | "redirect_blocked" | "authorization_denied" | "client_certificate_not_presented" | "route_not_found"
  | "not_found" | "server_error" | "unexpected_status" | "unexpected_format" | "ok";

/** Causas encadeadas (e → e.cause → …), allowlist fechada. */
export const NFSE_CAUSES = [
  "dns_lookup_failed", "tcp_connection_refused", "tcp_connection_reset", "tcp_unreachable", "tcp_broken_pipe", "timed_out",
  "tls_unknown_issuer", "tls_cert_expired", "tls_name_mismatch", "tls_cert_invalid", "tls_protocol_version", "tls_cipher_mismatch",
  "tls_handshake_failure", "tls_alert_certificate_required", "tls_alert_bad_certificate", "tls_alert_unknown_ca", "tls_alert_access_denied",
  "tls_renegotiation_unsupported", "client_cert_renegotiation_suspected", "tls_private_key_invalid", "tls_cert_pem_invalid",
  "alpn_http11_required", "http2_protocol_error", "connection_closed_early", "unsupported_option", "aborted", "unclassified",
] as const;
export type NfseCause = typeof NFSE_CAUSES[number];
export type NfseContentKind = "json" | "html_access_denied" | "html_not_found" | "html_other" | "xml" | "empty" | "other";

export interface NfseHttpDiagnostic {
  stage: NfseHttpStage;
  result: NfseHttpFailure;
  causes?: NfseCause[];
  httpStatus: number | null;
  contentKind?: NfseContentKind | null;
  officialErrorCodes?: string[];
  runtime: { createHttpClient: boolean; denoVersion: string | null; http1Forced?: boolean };
  routeProbe?: { documentedBase: NfseHttpFailure | null; legacyBase: NfseHttpFailure | null };
  /** Transporte usado; `go_wasm_reneg` = TLS 1.2 com renegociação segura RFC 5746 (somente GET em homologação). */
  transport?: "deno_fetch" | "go_wasm_reneg";
  renegCode?: string | null;
  tls?: NfseTlsDiag | null;
}
export interface NfseTlsDiag { version: string | null; cipher: string | null; alpn: string | null; chainVerified: boolean; certRequested: boolean;
  clientCertSent: boolean; certRequestedOnRenegotiation: boolean; secureRenegotiation: boolean }
const TOKEN = /^[A-Za-z0-9_.\/-]{1,64}$/;
/** Somente tokens fixos do crypto/tls e booleanos. */
export function sanitizeTls(t: unknown): NfseTlsDiag | null {
  if (!t || typeof t !== "object") return null; const o = t as Record<string, unknown>;
  const tok = (v: unknown) => typeof v === "string" && TOKEN.test(v) ? v : null; const b = (v: unknown) => v === true;
  return { version: tok(o.version), cipher: tok(o.cipher), alpn: tok(o.alpn), chainVerified: b(o.chainVerified), certRequested: b(o.certRequested),
    clientCertSent: b(o.clientCertSent), certRequestedOnRenegotiation: b(o.certRequestedOnRenegotiation), secureRenegotiation: b(o.secureRenegotiation) };
}
/** Código do transporte de renegociação → classe do diagnóstico. */
export function renegFailureClass(code: string): NfseHttpFailure {
  if (code === "timeout") return "timeout";
  if (code.startsWith("tcp_")) return "tcp_error";
  if (code === "tls_hostname_mismatch" || code.startsWith("tls_") || code === "client_cert_invalid") return code === "client_cert_invalid" ? "mtls_client_rejected" : "tls_error";
  if (code === "wasm_unavailable" || code === "config_blocked") return "unsupported_feature";
  if (code === "url_blocked" || code === "path_blocked") return "redirect_blocked";
  return "unexpected_format";
}

export function stageFromUrl(url: string): NfseHttpStage {
  try {
    const p = new URL(url).pathname;
    if (/\/docs\/index$/i.test(p)) return "route_probe";
    if (/\/dps\//i.test(p)) return "dps_lookup";
    if (/\/nfse\/[^/]+/i.test(p)) return "nfse_download";
    if (/\/nfse\/?$/i.test(p)) return "emit";
  } catch { /* noop */ }
  return "unknown";
}

const RULES: Array<[RegExp, NfseCause]> = [
  [/dns error|failed to lookup address|name or service not known|no such host|NotFound.*lookup/i, "dns_lookup_failed"],
  [/connection refused|ConnectionRefused/i, "tcp_connection_refused"],
  [/connection reset|ConnectionReset|reset by peer/i, "tcp_connection_reset"],
  [/network is unreachable|host is unreachable|NetworkUnreachable/i, "tcp_unreachable"],
  [/broken pipe|BrokenPipe/i, "tcp_broken_pipe"],
  [/timed out|TimedOut|deadline/i, "timed_out"],
  [/UnknownIssuer|unknown issuer|unable to get local issuer/i, "tls_unknown_issuer"],
  [/Expired|certificate has expired|NotValidYet/i, "tls_cert_expired"],
  [/NotValidForName|name mismatch|CertNotValidForName|hostname/i, "tls_name_mismatch"],
  [/BadEncoding|invalid peer certificate|InvalidCertificate/i, "tls_cert_invalid"],
  [/ProtocolVersion|protocol version|unsupported protocol/i, "tls_protocol_version"],
  [/no cipher|NoCipherSuitesInCommon|InsufficientSecurity|cipher/i, "tls_cipher_mismatch"],
  [/CertificateRequired|certificate required/i, "tls_alert_certificate_required"],
  [/BadCertificate|bad certificate/i, "tls_alert_bad_certificate"],
  [/UnknownCA|unknown ca/i, "tls_alert_unknown_ca"],
  [/AccessDenied\b|alert.*access denied/i, "tls_alert_access_denied"],
  [/renegotiat|NoRenegotiation/i, "tls_renegotiation_unsupported"],
  [/HandshakeFailure|handshake/i, "tls_handshake_failure"],
  [/private key|InvalidPrivateKey|key.*(invalid|unsupported)/i, "tls_private_key_invalid"],
  [/no certificates found|invalid certificate.*pem|PEM/i, "tls_cert_pem_invalid"],
  [/HTTP_1_1_REQUIRED|http_1_1_required/i, "alpn_http11_required"],
  [/http2|h2 protocol|GOAWAY|PROTOCOL_ERROR|stream error/i, "http2_protocol_error"],
  [/connection closed|unexpected eof|IncompleteMessage|closed before message completed|UnexpectedEof/i, "connection_closed_early"],
  [/unsupported|not supported|unknown option/i, "unsupported_option"],
];

/** Percorre a cadeia de causas (máx. 6) e devolve só enums; nunca a mensagem. */
export function errorCauses(e: unknown): NfseCause[] {
  const out: NfseCause[] = []; let cur: unknown = e;
  for (let depth = 0; cur && depth < 6; depth++) {
    const name = String((cur as { name?: unknown }).name ?? ""); const msg = String((cur as { message?: unknown }).message ?? "");
    const code = String((cur as { code?: unknown }).code ?? "");
    const text = `${name} ${code} ${msg}`;
    if (name === "AbortError" || name === "TimeoutError") out.push("aborted");
    for (const [re, c] of RULES) if (re.test(text)) { out.push(c); break; }
    cur = (cur as { cause?: unknown }).cause;
  }
  const uniq = [...new Set(out)];
  return uniq.length ? uniq : ["unclassified"];
}

/** Classifica exceção sem expor a mensagem original. */
export function classifyHttpError(e: unknown): NfseHttpFailure {
  const code = (e as { code?: unknown })?.code;
  if (code === "NFSE_MTLS_UNAVAILABLE") return "mtls_unavailable";
  if (code === "NFSE_MTLS_CLIENT_REJECTED") return "mtls_client_rejected";
  if (code === "NFSE_REDIRECT_BLOCKED" || /redirect/i.test(String(code ?? ""))) return "redirect_blocked";
  const c = errorCauses(e);
  if (c.includes("aborted") || c.includes("timed_out")) return "timeout";
  if (c.includes("dns_lookup_failed")) return "dns_error";
  if (c.some((x) => x.startsWith("tcp_"))) return "tcp_error";
  if (c.some((x) => x.startsWith("tls_"))) return "tls_error";
  if (c.includes("alpn_http11_required") || c.includes("http2_protocol_error")) return "http2_error";
  if (c.includes("unsupported_option")) return "unsupported_feature";
  return "network_error";
}

/** Tipo do conteúdo devolvido, lido só para classificar (o corpo nunca é guardado). */
export function contentKind(contentType: string | null, bodyHead: string): NfseContentKind {
  const ct = (contentType ?? "").toLowerCase(); const h = bodyHead.slice(0, 4096);
  if (!h.trim()) return "empty";
  if (ct.includes("json") || /^\s*[{[]/.test(h)) return "json";
  if (ct.includes("html") || /<html|<!doctype html/i.test(h)) {
    if (/Access is denied|403\s*-\s*Forbidden|403\.7|client certificate/i.test(h)) return "html_access_denied";
    if (/404|not found|cannot be found/i.test(h)) return "html_not_found";
    return "html_other";
  }
  if (ct.includes("xml") || /^\s*<\?xml/.test(h)) return "xml";
  return "other";
}

/** Classe pelo status E conteúdo: 404 genérico de rota/HTML nunca vira "DPS não localizada". */
export function classifyStatus(status: number, kind: NfseContentKind = "json"): NfseHttpFailure {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "redirect_blocked";
  if (status === 403 && kind === "html_access_denied") return "client_certificate_not_presented";
  if (status === 401 || status === 403 || status === 495 || status === 496) return "authorization_denied";
  if (status === 404) return kind === "json" ? "not_found" : "route_not_found";
  if (status >= 500) return "server_error";
  return "unexpected_status";
}

/** Códigos oficiais (formato do catálogo, ex. E0001) extraídos de `erros`; descrições nunca. */
export function officialErrorCodes(bodyText: string): string[] {
  try {
    const b = JSON.parse(bodyText) as Record<string, unknown>;
    const list = (b.erros ?? b.Erros ?? b.erro) as unknown;
    const arr = Array.isArray(list) ? list : list ? [list] : [];
    return arr.map((x) => String((x as Record<string, unknown>)?.Codigo ?? (x as Record<string, unknown>)?.codigo ?? ""))
      .filter((c) => /^[A-Z]{0,2}\d{1,5}$/.test(c)).slice(0, 5);
  } catch { return []; }
}

/** Resultado final: uma resposta 2xx que não resolveu a consulta vira formato inesperado. */
export function finalizeDiagnostic(d: NfseHttpDiagnostic | null, code: string): NfseHttpDiagnostic | null {
  if (!d) return null;
  if (d.result === "ok" && code === "reconciliation_unavailable") return { ...d, result: "unexpected_format" };
  return d;
}

export function runtimeCapabilities(): NfseHttpDiagnostic["runtime"] {
  const D = (globalThis as { Deno?: { createHttpClient?: unknown; version?: { deno?: string } } }).Deno;
  return { createHttpClient: typeof D?.createHttpClient === "function", denoVersion: typeof D?.version?.deno === "string" ? D.version.deno : null };
}

/** Linha de log da função: somente enums/números (sem identificadores). */
export function diagnosticLogLine(d: NfseHttpDiagnostic): string {
  return JSON.stringify({ evt: "nfse_http_diag", stage: d.stage, result: d.result, causes: d.causes ?? [], httpStatus: d.httpStatus,
    contentKind: d.contentKind ?? null, officialErrorCodes: d.officialErrorCodes ?? [], routeProbe: d.routeProbe ?? null,
    transport: d.transport ?? null, renegCode: d.renegCode ?? null, tls: d.tls ?? null,
    createHttpClient: d.runtime.createHttpClient, http1Forced: d.runtime.http1Forced ?? null, denoVersion: d.runtime.denoVersion });
}
