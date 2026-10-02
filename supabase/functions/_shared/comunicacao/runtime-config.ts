// Runtime configuration loader — pure, importable from Node (tests) and Deno.
//
// Precedência:
//   1) DB (rpc_service_load_provider_runtime_config) — `present:true` dita todo o efetivo.
//   2) Env fallback — via `envFallback()` fornecido pelo chamador Deno, usado APENAS
//      quando a RPC retorna `present:false`.
//   3) Fail-closed — qualquer erro/payload inesperado força delivery/webhook OFF e test mode ON.
//
// Nenhum import de Deno globals; segredos ficam somente em memória da invocação.

import type { WorkerEnv } from "./adapters-types.ts";

type SbLike = {
  rpc: (name: string, args?: unknown) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type RuntimeSource = "db" | "env" | "fail_closed";

export interface RuntimeConfig extends WorkerEnv {
  source: RuntimeSource;
}

/** Env estritamente fail-closed: nada sai, tudo em modo teste, sem segredos. */
export function failClosed(): RuntimeConfig {
  return {
    DELIVERY_ENABLED: false,
    EMAIL_ENABLED: false,
    WHATSAPP_ENABLED: false,
    INAPP_ENABLED: false,
    WHATSAPP_WEBHOOK_ENABLED: false,
    TEST_MODE_ENABLED: true,
    TEST_ALLOWED_EMAILS: [],
    TEST_ALLOWED_PHONES: [],
    SMTP_HOST: undefined, SMTP_PORT: undefined, SMTP_USER: undefined,
    SMTP_PASSWORD: undefined, SMTP_FROM: undefined,
    WHATSAPP_ACCESS_TOKEN: undefined, WHATSAPP_PHONE_NUMBER_ID: undefined,
    WHATSAPP_API_VERSION: undefined, WHATSAPP_APP_SECRET: undefined,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: undefined,
    source: "fail_closed",
  };
}

/** Mapeia payload jsonb do RPC para WorkerEnv (puro; sem side-effects). */
export function fromDbPayload(payload: Record<string, unknown>): RuntimeConfig {
  const s = (k: string) => {
    const v = payload[k];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const b = (k: string) => payload[k] === true;
  const arr = (k: string): string[] => {
    const v = payload[k];
    return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
  };
  const portRaw = payload["smtp_port"];
  const port = typeof portRaw === "number" ? String(portRaw)
             : typeof portRaw === "string" && portRaw.length > 0 ? portRaw : undefined;
  return {
    DELIVERY_ENABLED: b("delivery_enabled"),
    EMAIL_ENABLED: b("email_delivery_enabled"),
    WHATSAPP_ENABLED: b("whatsapp_delivery_enabled"),
    INAPP_ENABLED: b("inapp_delivery_enabled"),
    WHATSAPP_WEBHOOK_ENABLED: b("whatsapp_webhook_enabled"),
    // Fail-closed default: se o campo vier ausente/nulo/qualquer coisa != false, forçamos true.
    TEST_MODE_ENABLED: payload["test_mode_enabled"] === false ? false : true,
    TEST_ALLOWED_EMAILS: arr("allowed_emails"),
    TEST_ALLOWED_PHONES: arr("allowed_phones"),
    SMTP_HOST: s("smtp_host"),
    SMTP_PORT: port,
    SMTP_USER: s("smtp_user"),
    SMTP_FROM: s("smtp_from"),
    SMTP_PASSWORD: s("smtp_password"),
    WHATSAPP_PHONE_NUMBER_ID: s("whatsapp_phone_number_id"),
    WHATSAPP_API_VERSION: s("whatsapp_api_version"),
    WHATSAPP_ACCESS_TOKEN: s("whatsapp_access_token"),
    WHATSAPP_APP_SECRET: s("whatsapp_app_secret"),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: s("whatsapp_verify_token"),
    source: "db",
  };
}

/**
 * Carrega a configuração efetiva. Nunca lança; fail-closed em qualquer erro.
 * `envFallback` é responsabilidade do chamador (Deno preenche via readWorkerEnv;
 * testes Node podem passar () => failClosed() para verificar cadeia).
 */
export async function loadRuntimeConfig(
  sb: SbLike,
  envFallback: () => WorkerEnv,
): Promise<RuntimeConfig> {
  let res: { data: unknown; error: unknown };
  try {
    res = await sb.rpc("rpc_service_load_provider_runtime_config");
  } catch {
    return failClosed();
  }
  if (res.error) return failClosed();
  const p = (res.data ?? null) as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return failClosed();
  if (p.present === true) return fromDbPayload(p);
  if (p.present === false) {
    try {
      const env = envFallback();
      return { ...env, source: "env" };
    } catch { return failClosed(); }
  }
  return failClosed();
}
