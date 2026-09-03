/**
 * H7 — Gate e sanitização dos smokes autenticados de homologação.
 *
 * Regras (fail-closed, puras e testáveis):
 *   - só administrador;
 *   - só ambiente HOMOLOGATION com tpAmb=2 e produção desabilitada;
 *   - o autoteste de certificado exige certificado ativo e vigente.
 *
 * O gate do cliente é conveniência de UI: a autorização real é server-side
 * (`fn_fiscal_can_operate` + guards de endpoint). Nada aqui expõe segredo:
 * as funções de sanitização descartam qualquer campo que possa carregar
 * material (PEM, assinatura, fingerprint/serial, path, IV, resposta bruta).
 */

export const SMOKE_ADMIN_ROLE = "administrador";

export type SmokeBlockReason =
  | "not_admin"
  | "settings_unavailable"
  | "not_homologation"
  | "production_enabled"
  | "certificate_unavailable"
  | "certificate_expired";

export const SMOKE_BLOCK_MESSAGE: Record<SmokeBlockReason, string> = {
  not_admin: "Disponível apenas para administrador.",
  settings_unavailable: "Configuração fiscal da empresa indisponível.",
  not_homologation: "Disponível apenas em ambiente de homologação (tpAmb 2).",
  production_enabled: "Bloqueado: a emissão de produção está habilitada.",
  certificate_unavailable: "Nenhum certificado A1 ativo e disponível para homologação.",
  certificate_expired: "O certificado de homologação está fora da validade.",
};

export interface SmokeEnvironmentInput {
  isAdmin: boolean;
  fiscalEnvironment?: string | null;
  nfeEnvironmentCode?: string | number | null;
  productionEnabled?: boolean | null;
}

export interface SmokeCertificateInput {
  environment?: string | null;
  status?: string | null;
  isActive?: boolean | null;
  daysUntilExpiration?: number | null;
}

export interface SmokeGate {
  enabled: boolean;
  reason?: SmokeBlockReason;
  message?: string;
}

function block(reason: SmokeBlockReason): SmokeGate {
  return { enabled: false, reason, message: SMOKE_BLOCK_MESSAGE[reason] };
}

/** Gate comum de ambiente — usado pelos dois smokes. */
export function checkSmokeEnvironment(input: SmokeEnvironmentInput): SmokeGate {
  if (!input.isAdmin) return block("not_admin");
  if (!input.fiscalEnvironment) return block("settings_unavailable");
  if (String(input.fiscalEnvironment).toUpperCase() !== "HOMOLOGATION") {
    return block("not_homologation");
  }
  if (String(input.nfeEnvironmentCode ?? "") !== "2") return block("not_homologation");
  if (input.productionEnabled === true) return block("production_enabled");
  return { enabled: true };
}

/** Gate do autoteste do certificado: ambiente + certificado ativo e vigente. */
export function checkCertificateSelfTestGate(
  env: SmokeEnvironmentInput,
  cert: SmokeCertificateInput | null | undefined,
): SmokeGate {
  const base = checkSmokeEnvironment(env);
  if (!base.enabled) return base;
  if (
    !cert ||
    cert.isActive !== true ||
    String(cert.status ?? "") !== "AVAILABLE" ||
    String(cert.environment ?? "").toUpperCase() !== "HOMOLOGATION"
  ) {
    return block("certificate_unavailable");
  }
  if (typeof cert.daysUntilExpiration === "number" && cert.daysUntilExpiration < 0) {
    return block("certificate_expired");
  }
  return { enabled: true };
}

// --- Sanitização das respostas ---------------------------------------------

export interface CertificateSelfTestView {
  bundleParsed: boolean;
  keyMatchesCertificate: boolean;
  signatureVerified: boolean;
  withinValidity: boolean;
  keyUsageDigitalSignature: boolean;
  daysUntilExpiry: number | null;
  persisted: boolean;
  transmitted: boolean;
  environmentCode: string | null;
  checkedAt: string;
}

function bool(v: unknown): boolean {
  return v === true;
}

/**
 * Extrai APENAS os indicadores permitidos. Qualquer outro campo da resposta
 * (inclusive campos futuros) é descartado por construção.
 */
export function sanitizeSelfTestResponse(
  raw: unknown,
  now: Date = new Date(),
): CertificateSelfTestView {
  const r = (raw ?? {}) as Record<string, unknown>;
  const days = r.days_until_expiry;
  return {
    bundleParsed: bool(r.bundle_parsed),
    keyMatchesCertificate: bool(r.key_matches_certificate),
    signatureVerified: bool(r.signature_verified),
    withinValidity: bool(r.certificate_within_validity),
    keyUsageDigitalSignature: bool(r.key_usage_digital_signature),
    daysUntilExpiry: typeof days === "number" && Number.isFinite(days) ? days : null,
    // Fail-closed na leitura: só é "não persistiu/não transmitiu" se a função afirmar.
    persisted: r.persisted !== false,
    transmitted: r.transmitted !== false,
    environmentCode: typeof r.environmentCode === "string" ? r.environmentCode : null,
    checkedAt: now.toISOString(),
  };
}

export interface SefazStatusView {
  cStat: string | null;
  xMotivo: string | null;
  environmentCode: string | null;
  durationMs: number;
  checkedAt: string;
}

const MAX_MOTIVO = 200;

export function sanitizeSefazStatusResponse(
  raw: unknown,
  durationMs: number,
  now: Date = new Date(),
): SefazStatusView {
  const r = (raw ?? {}) as Record<string, unknown>;
  const motivo = typeof r.xMotivo === "string" ? r.xMotivo.replace(/\s+/g, " ").trim() : "";
  return {
    cStat: typeof r.cStat === "string" && /^[0-9]{1,3}$/.test(r.cStat) ? r.cStat : null,
    xMotivo: motivo ? motivo.slice(0, MAX_MOTIVO) : null,
    environmentCode: typeof r.environmentCode === "string" ? r.environmentCode : null,
    durationMs: Math.max(0, Math.round(durationMs)),
    checkedAt: now.toISOString(),
  };
}

/** Mensagem de erro sanitizada: apenas código estável, nunca detalhe bruto. */
export function sanitizeSmokeError(err: unknown): string {
  const raw = err && typeof err === "object" && "message" in err
    ? String((err as { message?: unknown }).message ?? "")
    : "";
  const code = raw.match(/[A-Z][A-Z0-9_]{4,60}/)?.[0] ?? null;
  return code
    ? `Falha no teste (código ${code}).`
    : "Falha no teste. Nenhum detalhe sensível é exibido.";
}
