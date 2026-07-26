// Adapters de canal do Módulo de Comunicação — Fase 2.
// Separados por canal. Nenhum realiza rede se as flags globais estiverem OFF
// (ou ausentes/malformadas). Nunca logam PII ou segredos.
//
// Todos os adapters recebem:
//   - resolved: retorno de rpc_resolve_outbox_address (address já normalizado)
//   - snapshot: template_snapshot da fila (imutável, com metadados)
//   - rendered: { assunto?, corpo, missing } vindo do renderer canônico
//   - deps: hooks de rede (fetch) injetáveis para teste
//
// Todos retornam AdapterResult normalizado.

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

export function readWorkerEnv(): WorkerEnv {
  const g = (k: string) => Deno.env.get(k) ?? undefined;
  return {
    DELIVERY_ENABLED: Deno.env.get("COMMUNICATION_DELIVERY_ENABLED") === "true",
    EMAIL_ENABLED: Deno.env.get("EMAIL_DELIVERY_ENABLED") === "true",
    WHATSAPP_ENABLED: Deno.env.get("WHATSAPP_DELIVERY_ENABLED") === "true",
    INAPP_ENABLED: Deno.env.get("COMMUNICATION_INAPP_ADAPTER_ENABLED") === "true",
    SMTP_HOST: g("SMTP_HOST"),
    SMTP_PORT: g("SMTP_PORT"),
    SMTP_USER: g("SMTP_USER"),
    SMTP_PASSWORD: g("SMTP_PASSWORD"),
    SMTP_FROM: g("SMTP_FROM"),
    WHATSAPP_ACCESS_TOKEN: g("WHATSAPP_ACCESS_TOKEN"),
    WHATSAPP_PHONE_NUMBER_ID: g("WHATSAPP_PHONE_NUMBER_ID"),
    WHATSAPP_API_VERSION: g("WHATSAPP_API_VERSION") ?? "v20.0",
  };
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
