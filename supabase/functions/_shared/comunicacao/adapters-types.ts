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
  | "permanent_error";         // → fail_v2 (dead_letter imediato)

export interface AdapterResult {
  outcome: AdapterOutcome;
  code: string;
  message: string;
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

/** Validação forte de config SMTP (porta 1-65535, host+user+password+from). */
export function isSmtpConfigValid(env: WorkerEnv): boolean {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM) return false;
  const port = Number(env.SMTP_PORT ?? "");
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  return true;
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
  return Boolean(env.WHATSAPP_APP_SECRET && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
}

export function healthBooleans(env: WorkerEnv) {
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
  };
}
