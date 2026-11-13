/**
 * Diagnóstico seguro de chamadas HTTP ao Sistema Nacional (consulta/reconciliação).
 * Nunca guarda URL com identificador, corpo, XML, mensagem bruta de erro, credenciais
 * ou dados pessoais — só etapa, categoria, status HTTP e capacidades do runtime.
 */
export type NfseHttpStage = "dps_lookup" | "nfse_download" | "emit" | "unknown";
export type NfseHttpFailure =
  | "mtls_unavailable" | "mtls_client_rejected" | "timeout" | "tls_error" | "network_error"
  | "redirect_blocked" | "authorization_denied" | "not_found" | "server_error" | "unexpected_status" | "unexpected_format" | "ok";

export interface NfseHttpDiagnostic {
  stage: NfseHttpStage;
  result: NfseHttpFailure;
  httpStatus: number | null;
  runtime: { createHttpClient: boolean; denoVersion: string | null };
}

export function stageFromUrl(url: string): NfseHttpStage {
  try {
    const p = new URL(url).pathname;
    if (/\/dps\//i.test(p)) return "dps_lookup";
    if (/\/nfse\/[^/]+/i.test(p)) return "nfse_download";
    if (/\/nfse\/?$/i.test(p)) return "emit";
  } catch { /* noop */ }
  return "unknown";
}

/** Classifica exceção sem expor a mensagem original. */
export function classifyHttpError(e: unknown): NfseHttpFailure {
  const code = (e as { code?: unknown })?.code;
  if (code === "NFSE_MTLS_UNAVAILABLE") return "mtls_unavailable";
  if (code === "NFSE_MTLS_CLIENT_REJECTED") return "mtls_client_rejected";
  if (code === "NFSE_REDIRECT_BLOCKED" || /redirect/i.test(String(code ?? ""))) return "redirect_blocked";
  const name = (e as { name?: unknown })?.name;
  if (name === "AbortError" || name === "TimeoutError") return "timeout";
  const msg = String((e as { message?: unknown })?.message ?? "");
  if (/certificate|tls|handshake|ssl|x509|alert/i.test(msg)) return "tls_error";
  return "network_error";
}

export function classifyStatus(status: number): NfseHttpFailure {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "redirect_blocked";
  if (status === 401 || status === 403 || status === 495 || status === 496) return "authorization_denied";
  if (status === 404) return "not_found";
  if (status >= 500) return "server_error";
  return "unexpected_status";
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
