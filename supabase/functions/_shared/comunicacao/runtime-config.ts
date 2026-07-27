// Runtime configuration loader — server-only, service_role.
//
// Precedência:
//   1) DB (rpc_service_load_provider_runtime_config) — se `present:true`, dita todo o efetivo.
//   2) Env fallback — usado APENAS quando a RPC retorna `present:false` (nenhuma linha configurada).
//   3) Fail-closed — qualquer erro na leitura da RPC força delivery/webhook OFF e test_mode ON.
//
// Segredos resolvidos ficam somente em memória da invocação e nunca são logados/expostos.

import type { WorkerEnv } from "./adapters-types.ts";
import { parseAllowlist, readWorkerEnv } from "./adapters.ts";

// @ts-ignore -- SupabaseClient injetado pelo chamador.
type SbLike = { rpc: (name: string, args?: unknown) => Promise<{ data: unknown; error: unknown }> };

export type RuntimeSource = "db" | "env" | "fail_closed";

export interface RuntimeConfig extends WorkerEnv {
  source: RuntimeSource;
}

/** Env estritamente fail-closed: nada sai, tudo em modo teste, sem segredos. */
function failClosed(): RuntimeConfig {
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

/** Mapeia payload do RPC (jsonb) para WorkerEnv. */
export function fromDbPayload(payload: Record<string, unknown>): RuntimeConfig {
  const s = (k: string) => {
    const v = payload[k];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const b = (k: string) => payload[k] === true;
  const arr = (k: string): string[] => {
    const v = payload[k];
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") as string[] : [];
  };
  const portRaw = payload["smtp_port"];
  const port = typeof portRaw === "number" ? String(portRaw)
             : typeof portRaw === "string" ? portRaw : undefined;
  return {
    DELIVERY_ENABLED: b("delivery_enabled"),
    EMAIL_ENABLED: b("email_delivery_enabled"),
    WHATSAPP_ENABLED: b("whatsapp_delivery_enabled"),
    INAPP_ENABLED: b("inapp_delivery_enabled"),
    WHATSAPP_WEBHOOK_ENABLED: b("whatsapp_webhook_enabled"),
    TEST_MODE_ENABLED: payload["test_mode_enabled"] === false ? false : true, // fail-closed default
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

/** Carrega a configuração efetiva. Nunca lança; fail-closed em qualquer erro. */
export async function loadRuntimeConfig(sb: SbLike): Promise<RuntimeConfig> {
  try {
    const { data, error } = await sb.rpc("rpc_service_load_provider_runtime_config");
    if (error) return failClosed();
    const p = (data ?? {}) as Record<string, unknown>;
    if (p.present === true) return fromDbPayload(p);
    if (p.present === false) {
      // Fallback ao env legado (ainda respeita fail-closed do adapters-types).
      const env = readWorkerEnv();
      return { ...env, source: "env" };
    }
    // Formato inesperado — fail-closed.
    return failClosed();
  } catch {
    return failClosed();
  }
}

/** Utilitário de teste: injeta valores como se viessem do env. */
export function fromEnvValues(env: WorkerEnv): RuntimeConfig {
  return { ...env, source: "env" };
}

export { parseAllowlist };
