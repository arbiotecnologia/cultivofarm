// Adapter WhatsApp Cloud API (Meta Graph). Desligado por padrão.
// Requisitos:
//   - env: WHATSAPP_DELIVERY_ENABLED=true, COMMUNICATION_DELIVERY_ENABLED=true
//   - envs válidos: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID (numérico),
//     WHATSAPP_API_VERSION (allowlist explícita)
//   - snapshot.provider_template_status === 'approved'
//   - mapping completo; variáveis ausentes → permanent_error ANTES do fetch
//
// Nunca inclui token no log; erros são sanitizados.

import type {
  AdapterDeps,
  AdapterResult,
  AdapterSnapshot,
  RenderedContent,
  ResolvedAddress,
  WorkerEnv,
} from "./adapters-types.ts";
import { isRecipientAllowedInTestMode, isWhatsappConfigValid } from "./adapters-types.ts";

const SEND_TIMEOUT_DEFAULT_MS = 15_000;
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * Classificador PURO do resultado HTTP do envio de template WhatsApp Cloud API.
 * - 429 → transient (rate limit)
 * - 5xx → transient (Meta indisponível)
 * - 401/403 → permanent (credencial inválida / conta suspensa)
 * - 404 → permanent (template ou phone-number-id inexistente)
 * - 400 e outros 4xx → permanent (payload/template/param inválidos)
 * Nunca inclui token/body; usa apenas `error.code` e `error.type` do Meta.
 */
export function classifyWhatsappHttpError(
  status: number,
  metaError?: { code?: number | string; type?: string } | null,
): { outcome: "transient_error" | "permanent_error"; code: string; message: string } {
  const safe = metaError
    ? `code=${metaError.code ?? "?"} type=${metaError.type ?? "?"}`
    : `HTTP ${status}`;
  if (status === 429) return { outcome: "transient_error", code: "whatsapp_rate_limited", message: `HTTP 429` };
  if (status >= 500) return { outcome: "transient_error", code: "whatsapp_5xx", message: `HTTP ${status}` };
  if (status === 401 || status === 403) return { outcome: "permanent_error", code: "whatsapp_auth", message: safe };
  if (status === 404) return { outcome: "permanent_error", code: "whatsapp_not_found", message: safe };
  if (status === 400) return { outcome: "permanent_error", code: "whatsapp_bad_request", message: safe };
  return { outcome: "permanent_error", code: `whatsapp_${status}`, message: safe };
}


export async function sendWhatsapp(
  env: WorkerEnv,
  resolved: ResolvedAddress,
  snapshot: AdapterSnapshot,
  _rendered: RenderedContent,
  variaveis: Record<string, unknown>,
  deps: AdapterDeps = {},
): Promise<AdapterResult> {
  if (!env.DELIVERY_ENABLED || !env.WHATSAPP_ENABLED) {
    return { outcome: "provider_not_configured", code: "whatsapp_disabled", message: "flag OFF" };
  }
  if (!isWhatsappConfigValid(env)) {
    return { outcome: "provider_not_configured", code: "whatsapp_config_invalid", message: "envs WA inválidos" };
  }
  if (!resolved.ok || resolved.canal !== "whatsapp" || !resolved.address) {
    return { outcome: "invalid_recipient", code: "invalid_address", message: "sem endereço" };
  }
  if (!E164_REGEX.test(resolved.address)) {
    return { outcome: "invalid_recipient", code: "invalid_e164", message: "telefone não é E.164" };
  }
  // Homologação — test mode gate ANTES do template/rede.
  const gate = isRecipientAllowedInTestMode(env, "whatsapp", resolved.address);
  if (!gate.allowed) {
    return { outcome: "deferred", code: gate.reason, message: "test mode block" };
  }
  if (!snapshot.provider_template_name || !snapshot.language_code) {
    return { outcome: "permanent_error", code: "wa_template_meta_missing", message: "template sem metadados WA" };
  }
  if (snapshot.provider_template_status !== "approved") {
    return {
      outcome: "permanent_error",
      code: "wa_template_not_approved",
      message: `status=${snapshot.provider_template_status ?? "unknown"}`,
    };
  }
  const mapping = snapshot.parameter_mapping ?? [];
  if (!Array.isArray(mapping)) {
    return { outcome: "permanent_error", code: "wa_mapping_invalid", message: "mapping inválido" };
  }
  const sorted = [...mapping].sort((a, b) => a.index - b.index);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].index !== i + 1) {
      return { outcome: "permanent_error", code: "wa_mapping_gap", message: "índices não sequenciais" };
    }
  }
  // Variáveis ausentes/null → erro permanente ANTES da rede.
  const parameters: Array<{ type: "text"; text: string }> = [];
  for (const m of sorted) {
    const raw = variaveis?.[m.variavel];
    if (raw === undefined || raw === null || String(raw).length === 0) {
      return {
        outcome: "permanent_error",
        code: "wa_variable_missing",
        message: `variável obrigatória ausente: ${m.variavel}`,
      };
    }
    parameters.push({ type: "text", text: String(raw).slice(0, 1024) });
  }

  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: resolved.address.replace(/^\+/, ""),
    type: "template",
    template: {
      name: snapshot.provider_template_name,
      language: { code: snapshot.language_code },
      components: parameters.length > 0 ? [{ type: "body", parameters }] : [],
    },
  };

  const fetchImpl = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? SEND_TIMEOUT_DEFAULT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    const isAbort = /abort/i.test(msg);
    return {
      outcome: "transient_error",
      code: isAbort ? "whatsapp_timeout" : "whatsapp_network_error",
      message: msg,
    };
  }
  clearTimeout(timer);

  let payload: unknown = null;
  try { payload = await res.json(); } catch { /* body vazio */ }

  if (res.ok) {
    const messages = (payload as { messages?: Array<{ id?: string }> })?.messages ?? [];
    return {
      outcome: "sent",
      code: "sent",
      message: "ok",
      provider_message_id: messages[0]?.id ?? null,
    };
  }
  const err = (payload as { error?: { code?: number; message?: string; type?: string } })?.error ?? null;
  return classifyWhatsappHttpError(res.status, err);
}

