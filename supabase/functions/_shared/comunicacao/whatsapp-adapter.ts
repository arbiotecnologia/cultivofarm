// Adapter WhatsApp Cloud API (Meta Graph). Desligado por padrão.
// Requer:
//  - env: WHATSAPP_DELIVERY_ENABLED=true, COMMUNICATION_DELIVERY_ENABLED=true
//  - envs: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION
//  - template com provider_template_name + language_code + parameter_mapping
//  - address E.164 (validado por rpc_resolve_outbox_address) e opt-in verificado
//
// Nunca inclui token no log; erros são sanitizados.

import type {
  AdapterDeps,
  AdapterResult,
  AdapterSnapshot,
  RenderedContent,
  ResolvedAddress,
  WorkerEnv,
} from "./adapters.ts";

const SEND_TIMEOUT_DEFAULT_MS = 15_000;
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

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
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return { outcome: "provider_not_configured", code: "whatsapp_missing_env", message: "WA envs ausentes" };
  }
  if (!resolved.ok || resolved.canal !== "whatsapp" || !resolved.address) {
    return { outcome: "invalid_recipient", code: "invalid_address", message: "sem endereço" };
  }
  if (!E164_REGEX.test(resolved.address)) {
    return { outcome: "invalid_recipient", code: "invalid_e164", message: "telefone não é E.164" };
  }
  if (!snapshot.provider_template_name || !snapshot.language_code) {
    return { outcome: "permanent_error", code: "wa_template_meta_missing", message: "template sem metadados WA" };
  }
  const mapping = snapshot.parameter_mapping ?? [];
  if (!Array.isArray(mapping)) {
    return { outcome: "permanent_error", code: "wa_mapping_invalid", message: "mapping inválido" };
  }
  // Monta parâmetros na ordem exata declarada pelo mapping.
  const sorted = [...mapping].sort((a, b) => a.index - b.index);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].index !== i + 1) {
      return { outcome: "permanent_error", code: "wa_mapping_gap", message: "índices não sequenciais" };
    }
  }
  const parameters = sorted.map((m) => {
    const raw = variaveis?.[m.variavel];
    const value = raw == null ? "" : String(raw);
    return { type: "text" as const, text: value.slice(0, 1024) };
  });

  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: resolved.address.replace(/^\+/, ""),
    type: "template",
    template: {
      name: snapshot.provider_template_name,
      language: { code: snapshot.language_code },
      components: parameters.length > 0
        ? [{ type: "body", parameters }]
        : [],
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

  if (res.status === 429) {
    return { outcome: "transient_error", code: "whatsapp_rate_limited", message: `HTTP 429` };
  }
  if (res.status >= 500) {
    return { outcome: "transient_error", code: `whatsapp_5xx`, message: `HTTP ${res.status}` };
  }
  // 4xx (401/403/400) → permanente. Sanitiza mensagem para não vazar token.
  const err = (payload as { error?: { code?: number; message?: string; type?: string } })?.error;
  const safe = err ? `code=${err.code ?? "?"} type=${err.type ?? "?"}` : `HTTP ${res.status}`;
  return { outcome: "permanent_error", code: `whatsapp_${res.status}`, message: safe };
}
