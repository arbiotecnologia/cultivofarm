// Edge Function: whatsapp-status-webhook (runtime DB wiring)
// - GET: challenge Meta (VERIFY_TOKEN da DB, com fallback ao env).
// - POST: assinatura HMAC-SHA256 (APP_SECRET da DB, com fallback ao env).
// - Feature flag WHATSAPP_WEBHOOK_ENABLED lida da DB primeiro (fail-closed).
// - Erro na carga da configuração → 500 not_configured; nada é processado.
// - Nunca loga body/telefone/wamid/secrets.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  isValidChallenge, MAX_BODY_BYTES, parseMetaWebhookBody, readBodyCapped, verifyMetaSignature,
} from "../_shared/comunicacao/whatsapp-webhook-parser.ts";
import { DEFAULT_WEBHOOK_CONCURRENCY, runWithConcurrency } from "../_shared/comunicacao/concurrency.ts";
import { readWorkerEnv } from "../_shared/comunicacao/adapters.ts";
import { loadRuntimeConfig } from "../_shared/comunicacao/runtime-config.ts";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function textResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}
function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  try {
    // NOTIF-3: no secret fetch or receipt mutation before a proven contract.
    const webhookContractAvailable = false;
    if (!webhookContractAvailable) return jsonResponse(503, { ok: false, error: "NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE" });
    if (!SUPABASE_URL || !SERVICE_KEY) return jsonResponse(500, { ok: false, error: "not_configured" });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const cfg = await loadRuntimeConfig(supabase, readWorkerEnv);
    const APP_SECRET = cfg.WHATSAPP_APP_SECRET ?? "";
    const VERIFY_TOKEN = cfg.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "";
    const PHONE_NUMBER_ID = cfg.WHATSAPP_PHONE_NUMBER_ID ?? "";
    const WEBHOOK_ENABLED = !!cfg.WHATSAPP_WEBHOOK_ENABLED;

    // ---- GET challenge ----
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

    if (!APP_SECRET || !PHONE_NUMBER_ID) return jsonResponse(500, { ok: false, error: "not_configured" });

    const clRaw = req.headers.get("content-length");
    if (clRaw !== null) {
      const cl = Number(clRaw);
      if (!Number.isFinite(cl) || cl < 0 || cl > MAX_BODY_BYTES) {
        return jsonResponse(413, { ok: false, error: "payload_too_large" });
      }
    }

    const bodyRes = await readBodyCapped(req.body, MAX_BODY_BYTES);
    if (!bodyRes.ok) {
      if (bodyRes.error === "payload_too_large") return jsonResponse(413, { ok: false, error: "payload_too_large" });
      return jsonResponse(400, { ok: false, error: "invalid_body" });
    }
    const buf = bodyRes.body;

    const sigOk = await verifyMetaSignature(buf, req.headers.get("x-hub-signature-256"), APP_SECRET);
    if (!sigOk) return jsonResponse(401, { ok: false, error: "invalid_signature" });

    if (!WEBHOOK_ENABLED) return jsonResponse(200, { ok: true, disabled: true, received: 0 });

    let bodyJson: unknown;
    try { bodyJson = JSON.parse(new TextDecoder().decode(buf)); }
    catch { return jsonResponse(400, { ok: false, error: "invalid_json" }); }

    const parsed = parseMetaWebhookBody(bodyJson, PHONE_NUMBER_ID);
    if (!parsed.ok) return jsonResponse(400, { ok: false, error: parsed.error });
    if (parsed.statuses.length === 0) return jsonResponse(200, { ok: true, received: 0, ignored: parsed.ignored });

    type RpcOut = { ok?: boolean; ignored?: boolean; duplicated?: boolean };
    let hardError = false;
    const outcomes = await runWithConcurrency(
      parsed.statuses, DEFAULT_WEBHOOK_CONCURRENCY,
      async (st) => {
        const { data, error } = await supabase.rpc("rpc_record_whatsapp_delivery_status", {
          p_provider_message_id: st.id, p_status: st.status,
          p_timestamp: st.timestamp, p_error_code: st.error_code,
        });
        if (error) { hardError = true; throw new Error("rpc_failed"); }
        return (data ?? {}) as RpcOut;
      },
    ).catch(() => null);

    if (hardError || outcomes === null) return jsonResponse(500, { ok: false, error: "internal_error" });

    let recorded = 0, unmatched = 0, duplicated = 0;
    for (const res of outcomes) {
      if (res.ignored) unmatched++;
      else if (res.duplicated) duplicated++;
      else if (res.ok) recorded++;
    }

    return jsonResponse(200, {
      ok: true, received: parsed.statuses.length, recorded, unmatched, duplicated, ignored: parsed.ignored,
    });
  } catch {
    return jsonResponse(500, { ok: false, error: "internal_error" });
  }
});
