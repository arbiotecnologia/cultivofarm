// Deno-side utilities. NÃO importar em testes Node.
// Só depende de Deno.env para materializar WorkerEnv a partir do runtime.
//
// Tipos e healthBooleans vivem em adapters-types.ts (puros).

// @ts-ignore -- Deno global fornecido pelo runtime da Edge Function.
declare const Deno: { env: { get(k: string): string | undefined } };

import type { WorkerEnv } from "./adapters-types.ts";
export * from "./adapters-types.ts";

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
    // Sem default silencioso: se WHATSAPP_API_VERSION não estiver no env,
    // isWhatsappConfigValid() vai rejeitar e o adapter retorna
    // provider_not_configured. Isso força configuração explícita e
    // impede envios com versão obsoleta implícita.
    WHATSAPP_API_VERSION: g("WHATSAPP_API_VERSION"),
    WHATSAPP_WEBHOOK_ENABLED: Deno.env.get("WHATSAPP_WEBHOOK_ENABLED") === "true",
    WHATSAPP_APP_SECRET: g("WHATSAPP_APP_SECRET"),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: g("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
  };
}
