// Tipos e utilidades PURAS dos adapters — sem dependências Deno.
// Importado tanto pelo worker (Deno) quanto pelos testes (Node).

import type { ComunicacaoCanal } from "../communication-render.ts";

export type AdapterOutcome =
  | "sent"
  | "provider_not_configured"  // → worker faz DEFER (não cancel)
  | "opt_out"                  // → skip
  | "invalid_recipient"        // → cancel
  | "deferred"                 // → defer explícito (ex.: config SMTP inválida)
  | "transient_error"          // → fail_v2 (retry)
  | "permanent_error"          // → fail_v2 (dead_letter imediato)
  | "ambiguous";               // → efeito externo incerto; exige confirmação humana

export type AdapterCertainty = "definitive" | "ambiguous";
export type EmailAdapterStage = "preflight" | "config" | "connect" | "send" | "response";

export interface AdapterResult {
  outcome: AdapterOutcome;
  code: string;
  message: string;
  certainty?: AdapterCertainty;
  stage?: EmailAdapterStage;
  provider_message_id?: string | null;
}

export interface ResolvedAddress {
  ok: boolean;
  outcome?: "skipped" | "cancelled";
  reason?: string;
  canal: ComunicacaoCanal;
  address?: string;
  address_hash?: string;
  redacted?: string;
  user_id?: string | null;
  cliente_id?: string | null;
}

export interface RenderedContent {
  assunto?: string;
  corpo: string;
  missing?: string[];
}

export interface AdapterParameterMapping {
  index: number;
  variavel: string;
  tipo?: string;
}

export interface AdapterSnapshot {
  canal: ComunicacaoCanal;
  assunto?: string | null;
  corpo: string;
  variaveis: string[];
  provider_template_name?: string | null;
  language_code?: string | null;
  parameter_mapping?: AdapterParameterMapping[];
  provider_template_status?: string | null;
}

export interface AdapterDeps {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  // Cliente SMTP injetável para testes (denomailer é resolvido em runtime Deno).
  smtpClientFactory?: (config: {
    hostname: string;
    port: number;
    tls: boolean;
    auth: { username: string; password: string };
  }) => Promise<SmtpLikeClient>;
}

export interface SmtpLikeClient {
  send: (opts: {
    from: string;
    to: string;
    subject: string;
    content: string;
    html?: string;
  }) => Promise<unknown>;
  close: () => Promise<void>;
}

export interface WorkerEnv {
  DELIVERY_ENABLED: boolean;
  EMAIL_ENABLED: boolean;
  WHATSAPP_ENABLED: boolean;
  INAPP_ENABLED: boolean;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_API_VERSION?: string;
  // Fase 4 — webhook de recibos WhatsApp (Meta). O worker de outbox não
  // usa esses valores; existem aqui para permitir que communication-health
  // exponha booleans configured/enabled sem revelar segredos.
  WHATSAPP_WEBHOOK_ENABLED?: boolean;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string;
  // Homologação H2 — Test mode e allowlists. Default fail-closed:
  // quando TEST_MODE_ENABLED=true (default se ausente) e a lista
  // correspondente ao canal estiver vazia, nenhum envio sai.
  TEST_MODE_ENABLED?: boolean;
  TEST_ALLOWED_EMAILS?: string[];
  TEST_ALLOWED_PHONES?: string[];
}

/**
 * Allowlist explícita das versões suportadas do WhatsApp Cloud API.
 *
 * Revisão: julho/2026. Os SDKs oficiais Meta estão em v25.0.x; v24.0 é a
 * versão anterior ainda em suporte estendido. Versões v20/v21/v22 foram
 * removidas por estarem fora do janela de suporte operacional. Qualquer
 * versão fora desta lista é bloqueada por `isWhatsappConfigValid` e faz o
 * adapter retornar `provider_not_configured` — nunca há default silencioso.
 * Reavaliar trimestralmente contra a matriz de versões vigente da Meta.
 */
export const WHATSAPP_API_VERSION_ALLOWLIST = ["v24.0", "v25.0"] as const;

/** Validação forte de config WhatsApp (sem default silencioso). */
export function isWhatsappConfigValid(env: WorkerEnv): boolean {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return false;
  if (!/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID)) return false;
  const v = env.WHATSAPP_API_VERSION ?? "";
  return (WHATSAPP_API_VERSION_ALLOWLIST as readonly string[]).includes(v);
}

export type SmtpConfigError = "email_config_invalid" | "smtp_port_blocked_by_edge_runtime";

/**
 * Validação SMTP para Supabase Edge Runtime. As portas 25 e 587 são
 * bloqueadas pelo ambiente e devem falhar antes de claim ou abertura de socket.
 */
export function getSmtpConfigError(env: WorkerEnv): SmtpConfigError | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM) return "email_config_invalid";
  const port = Number(env.SMTP_PORT ?? "");
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "email_config_invalid";
  if (port === 25 || port === 587) return "smtp_port_blocked_by_edge_runtime";
  return null;
}

export function isSmtpConfigValid(env: WorkerEnv): boolean {
  return getSmtpConfigError(env) === null;
}

/** Escape mínimo de HTML para conteúdo texto enviado como html. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isWhatsappWebhookConfigValid(env: WorkerEnv): boolean {
  if (!env.WHATSAPP_APP_SECRET) return false;
  if (!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) return false;
  // phone_number_id é obrigatório e numérico — reaproveitado do worker.
  // Sem ele, o webhook não consegue validar phone mismatch fail-closed.
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID)) return false;
  return true;
}

export function healthBooleans(env: WorkerEnv) {
  const testMode = isTestModeEnabled(env);
  return {
    delivery_enabled: env.DELIVERY_ENABLED,
    email: {
      enabled: env.EMAIL_ENABLED,
      configured: isSmtpConfigValid(env),
    },
    whatsapp: {
      enabled: env.WHATSAPP_ENABLED,
      configured: isWhatsappConfigValid(env),
    },
    in_app: { enabled: env.INAPP_ENABLED, configured: env.INAPP_ENABLED },
    whatsapp_webhook: {
      enabled: Boolean(env.WHATSAPP_WEBHOOK_ENABLED),
      configured: isWhatsappWebhookConfigValid(env),
    },
    // Homologação — expõe apenas booleans/contagens, jamais valores.
    test_mode: {
      enabled: testMode,
      allowlist_emails_count: (env.TEST_ALLOWED_EMAILS ?? []).length,
      allowlist_phones_count: (env.TEST_ALLOWED_PHONES ?? []).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Homologação H2 — Test mode + allowlists (fail-closed em staging/prod).
// ---------------------------------------------------------------------------

/**
 * true apenas quando explicitamente configurado. `readWorkerEnv` traduz
 * ausência de env var em `true` (fail-closed em runtime); consumidores que
 * constroem WorkerEnv manualmente controlam o campo explicitamente.
 */
export function isTestModeEnabled(env: WorkerEnv): boolean {
  return env.TEST_MODE_ENABLED === true;
}

export function normalizeEmail(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

/** Normaliza para E.164: preserva '+' inicial, remove tudo que não é dígito. */
export function normalizePhoneE164(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const digits = s.replace(/\D+/g, "");
  if (!digits) return "";
  return `+${digits}`;
}

/** Parse CSV de allowlist: split por vírgula/ponto-e-vírgula/espaço, normaliza. */
export function parseAllowlist(
  raw: string | undefined,
  kind: "email" | "phone",
): string[] {
  if (!raw) return [];
  const parts = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const norm = kind === "email" ? normalizeEmail : normalizePhoneE164;
  const set = new Set<string>();
  for (const p of parts) {
    const n = norm(p);
    if (n) set.add(n);
  }
  return [...set];
}

export interface TestModeGateResult {
  allowed: boolean;
  reason?: string;
}

/** Fail-closed: test mode ativo + lista vazia → sempre bloqueia. */
export function isRecipientAllowedInTestMode(
  env: WorkerEnv,
  canal: "email" | "whatsapp",
  address: string,
): TestModeGateResult {
  if (!isTestModeEnabled(env)) return { allowed: true };
  const list = canal === "email"
    ? (env.TEST_ALLOWED_EMAILS ?? [])
    : (env.TEST_ALLOWED_PHONES ?? []);
  if (list.length === 0) {
    return { allowed: false, reason: "test_mode_allowlist_empty" };
  }
  const norm = canal === "email" ? normalizeEmail(address) : normalizePhoneE164(address);
  if (!list.includes(norm)) {
    return { allowed: false, reason: "test_mode_not_allowlisted" };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Gate 3 — Helpers puros para e-mail e política de retry (auditáveis, testáveis).
// ---------------------------------------------------------------------------

/** Limite máx. do corpo do e-mail (10 MiB — evita abuso e explosão de memória). */
export const MAX_EMAIL_BODY_BYTES = 10 * 1024 * 1024;
/** Limite RFC 5322 razoável para assunto renderizado. */
export const MAX_EMAIL_SUBJECT_LEN = 300;
/** Limite RFC 5321 para endereços. */
export const MAX_EMAIL_ADDRESS_LEN = 320;

/**
 * Detecta CR/LF/NUL — vetor clássico de header injection SMTP.
 * Fail-closed: qualquer sequência com \r, \n ou \0 é considerada inválida.
 */
export function hasHeaderInjection(value: string | null | undefined): boolean {
  if (value == null) return false;
  return /[\r\n\0]/.test(String(value));
}

/** Tamanho em bytes de uma string UTF-8. */
export function utf8ByteLength(input: string): number {
  // TextEncoder está disponível tanto em Deno quanto em Node/jsdom.
  return new TextEncoder().encode(input ?? "").length;
}

/**
 * Backoff exponencial determinístico com jitter simétrico ±20%.
 * Espelha exatamente a lógica de `rpc_fail_communication_delivery_v2`
 * (base = 30s, capa em 3600s). `jitter01` deve estar em [0,1); use
 * `Math.random()` em produção e valores fixos em testes.
 */
export function computeBackoffSeconds(
  attempts: number,
  jitter01: number,
  baseSeconds = 30,
  capSeconds = 3600,
): number {
  const safeAttempts = Math.max(0, Math.floor(attempts));
  const exp = Math.pow(2, Math.max(0, safeAttempts - 1));
  const base = Math.max(1, Math.min(capSeconds, Math.floor(baseSeconds * exp)));
  const j = Math.max(0, Math.min(0.999999, jitter01));
  const jittered = Math.floor(base * (0.8 + 0.4 * j));
  return Math.max(1, Math.min(capSeconds, jittered));
}

/**
 * Classificação determinística de erro de provedor em outcome do adapter.
 * RFC 5321 §4.2.1:
 *  - 4yz (Transient Negative Completion) → retentar (transient_error).
 *    Inclui 421 (serviço indisponível), 450 (mailbox busy), 451 (erro local),
 *    452 (armazenamento insuficiente), etc.
 *  - 5yz (Permanent Negative Completion) → permanent_error. Não inventamos
 *    exceções: se o provider quiser tratar algum 5xx como transitório, isso
 *    exige documentação explícita antes de mudar esta função.
 *  - timeout/abort e falhas de rede/DNS/reset/refused → transient_error.
 *  - qualquer outro → transient_error (fail-safe: prefere retentar).
 */
export type EmailErrorClass = "transient_error" | "permanent_error" | "ambiguous";
export function classifyEmailError(
  message: string,
  stage: "connect" | "send" = "send",
): { outcome: EmailErrorClass; code: string; certainty: AdapterCertainty; stage: EmailAdapterStage } {
  const msg = String(message ?? "").slice(0, 500);
  if (stage === "connect") {
    if (/timeout|abort|ETIMEDOUT/i.test(msg)) {
      return { outcome: "transient_error", code: "email_connect_timeout", certainty: "definitive", stage };
    }
    return { outcome: "transient_error", code: "email_connect_network", certainty: "definitive", stage };
  }
  if (/\b5\d\d\b/.test(msg)) {
    return { outcome: "permanent_error", code: "email_smtp_5xx", certainty: "definitive", stage: "response" };
  }
  if (/\b4\d\d\b/.test(msg)) {
    return { outcome: "transient_error", code: "email_smtp_4xx", certainty: "definitive", stage: "response" };
  }
  return { outcome: "ambiguous", code: "email_send_ambiguous", certainty: "ambiguous", stage };
}



