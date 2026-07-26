// Tipos e utilidades PURAS dos adapters — sem dependências Deno.
// Este arquivo é importado tanto pelo worker (Deno) quanto pelos testes (Node).

import type { ComunicacaoCanal } from "../communication-render.ts";

export type AdapterOutcome =
  | "sent"
  | "provider_not_configured"
  | "opt_out"
  | "invalid_recipient"
  | "transient_error"
  | "permanent_error";

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

export interface AdapterSnapshot {
  canal: ComunicacaoCanal;
  assunto?: string | null;
  corpo: string;
  variaveis: string[];
  provider_template_name?: string | null;
  language_code?: string | null;
  parameter_mapping?: Array<{ index: number; variavel: string; tipo?: string }>;
}

export interface AdapterDeps {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
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
}

export function healthBooleans(env: WorkerEnv) {
  return {
    delivery_enabled: env.DELIVERY_ENABLED,
    email: {
      enabled: env.EMAIL_ENABLED,
      configured: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM),
    },
    whatsapp: {
      enabled: env.WHATSAPP_ENABLED,
      configured: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    },
    in_app: { enabled: env.INAPP_ENABLED, configured: env.INAPP_ENABLED },
  };
}
