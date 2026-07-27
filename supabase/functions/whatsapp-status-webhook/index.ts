// Edge Function: whatsapp-status-webhook (Fase 4 · correção final)
// - GET: challenge Meta. Requer VERIFY_TOKEN válido; funciona para
//        configuração inicial mesmo com WHATSAPP_WEBHOOK_ENABLED=false.
// - POST: público. Autenticidade via HMAC-SHA256 (X-Hub-Signature-256).
// - Feature flag REAL: WHATSAPP_WEBHOOK_ENABLED. Quando false, POST
//   válido (tamanho ok + assinatura ok) responde 200 disabled/received=0
//   SEM parse, SEM RPC, SEM tocar banco. Assinatura inválida continua 401.
// - Concorrência limitada (máximo MAX_WEBHOOK_CONCURRENCY) para RPCs.
//   Idempotência garante retry seguro. Qualquer erro → HTTP 500 genérico.
// - Nunca loga body, telefone, wamid, secrets ou detalhes de erro.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  isValidChallenge,
  MAX_BODY_BYTES,
  parseMetaWebhookBody,
  readBodyCapped,
  verifyMetaSignature,
} from "../_shared/comunicacao/whatsapp-webhook-parser.ts";
import {
  DEFAULT_WEBHOOK_CONCURRENCY,
  runWithConcurrency,
} from "../_shared/comunicacao/concurrency.ts";

const APP_SECRET      = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const VERIFY_TOKEN    = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_ENABLED = (Deno.env.get("WHATSAPP_WEBHOOK_ENABLED") ?? "").toLowerCase() === "true";

function textResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  try {
    // ---- GET challenge (Meta subscription verification) ----
    // Permitido mesmo com WEBHOOK_ENABLED=false: configuração inicial
    // precisa validar antes de habilitar o processamento.
    if (req.method === "GET") {
      if (!VERIFY_TOKEN) return textResponse(500, "not_configured");
      const url = new URL(req.url);
      const mode      = url.searchParams.get("hub.mode");
      const token     = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode !== "subscribe" || !token || !challenge) return textResponse(400, "bad_request");
      if (!isValidChallenge(challenge)) return textResponse(400, "bad_request");
      if (token.length !== VERIFY_TOKEN.length) return textResponse(401, "unauthorized");
      let diff = 0;
      for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ VERIFY_TOKEN.charCodeAt(i);
      if (diff !== 0) return textResponse(401, "unauthorized");
      return textResponse(200, challenge);
    }

    if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "method_not_allowed" });

    // ---- POST: security envelope ----
    if (!APP_SECRET || !PHONE_NUMBER_ID || !SUPABASE_URL || !SERVICE_KEY) {
      return jsonResponse(500, { ok: false, error: "not_configured" });
    }

    // Content-length é pré-filtro barato; streaming reader impõe o cap real.
    const clRaw = req.headers.get("content-length");
    if (clRaw !== null) {
      const cl = Number(clRaw);
      if (!Number.isFinite(cl) || cl < 0 || cl > MAX_BODY_BYTES) {
        return jsonResponse(413, { ok: false, error: "payload_too_large" });
      }
    }

    const bodyRes = await readBodyCapped(req.body, MAX_BODY_BYTES);
    if (!bodyRes.ok) {
      if (bodyRes.error === "payload_too_large") {
        return jsonResponse(413, { ok: false, error: "payload_too_large" });
      }
      return jsonResponse(400, { ok: false, error: "invalid_body" });
    }
    const buf = bodyRes.body;

    const sigOk = await verifyMetaSignature(
      buf,
      req.headers.get("x-hub-signature-256"),
      APP_SECRET,
    );
    if (!sigOk) return jsonResponse(401, { ok: false, error: "invalid_signature" });

    // Feature flag REAL: com assinatura válida e tamanho ok, se o processamento
    // está desligado, respondemos 200 genérico SEM parse, SEM RPC, SEM banco.
    // Assinatura inválida acima já retornou 401.
    if (!WEBHOOK_ENABLED) {
      return jsonResponse(200, { ok: true, disabled: true, received: 0 });
    }

    // Só agora parseamos o JSON — flag off nunca chega aqui.
    let bodyJson: unknown;
    try {
      bodyJson = JSON.parse(new TextDecoder().decode(buf));
    } catch {
      return jsonResponse(400, { ok: false, error: "invalid_json" });
    }

    const parsed = parseMetaWebhookBody(bodyJson, PHONE_NUMBER_ID);
    if (!parsed.ok) return jsonResponse(400, { ok: false, error: parsed.error });

    if (parsed.statuses.length === 0) {
      return jsonResponse(200, { ok: true, received: 0, ignored: parsed.ignored });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Concorrência determinística e limitada. NUNCA Promise.all irrestrito
    // sobre até MAX_STATUSES_TOTAL RPCs. Idempotência (unique idem index)
    // torna retry seguro se qualquer chamada falhar → HTTP 500 genérico.
    type RpcOut = { ok?: boolean; ignored?: boolean; duplicated?: boolean };
    let hardError = false;
    const outcomes = await runWithConcurrency(
      parsed.statuses,
      DEFAULT_WEBHOOK_CONCURRENCY,
      async (st) => {
        const { data, error } = await supabase.rpc("rpc_record_whatsapp_delivery_status", {
          p_provider_message_id: st.id,
          p_status: st.status,
          p_timestamp: st.timestamp,
          p_error_code: st.error_code,
        });
        if (error) { hardError = true; throw new Error("rpc_failed"); }
        return (data ?? {}) as RpcOut;
      },
    ).catch(() => null);

    if (hardError || outcomes === null) {
      return jsonResponse(500, { ok: false, error: "internal_error" });
    }

    let recorded = 0;
    let unmatched = 0;
    let duplicated = 0;
    for (const res of outcomes) {
      if (res.ignored) unmatched++;
      else if (res.duplicated) duplicated++;
      else if (res.ok) recorded++;
    }

    return jsonResponse(200, {
      ok: true,
      received: parsed.statuses.length,
      recorded,
      unmatched,
      duplicated,
      ignored: parsed.ignored,
    });
  } catch {
    return jsonResponse(500, { ok: false, error: "internal_error" });
  }
});
