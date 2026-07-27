// Edge Function: whatsapp-status-webhook (Fase 4)
// - GET: challenge Meta (hub.mode=subscribe + verify_token) → devolve hub.challenge em text/plain.
// - POST: público (Meta não envia JWT). Autenticidade via HMAC-SHA256 do raw body
//         (X-Hub-Signature-256) usando WHATSAPP_APP_SECRET.
// - Nunca loga body, telefone, wamid completo ou secrets.
// - Chama service_role RPC rpc_record_whatsapp_delivery_status por status extraído.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  MAX_BODY_BYTES,
  parseMetaWebhookBody,
  verifyMetaSignature,
} from "../_shared/comunicacao/whatsapp-webhook-parser.ts";

const APP_SECRET      = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const VERIFY_TOKEN    = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    if (req.method === "GET") {
      if (!VERIFY_TOKEN) return textResponse(500, "not_configured");
      const url = new URL(req.url);
      const mode      = url.searchParams.get("hub.mode");
      const token     = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode !== "subscribe" || !token || !challenge) return textResponse(400, "bad_request");

      // Constant-time compare.
      if (token.length !== VERIFY_TOKEN.length) return textResponse(401, "unauthorized");
      let diff = 0;
      for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ VERIFY_TOKEN.charCodeAt(i);
      if (diff !== 0) return textResponse(401, "unauthorized");

      return textResponse(200, challenge);
    }

    if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "method_not_allowed" });

    // ---- POST: security envelope ----
    if (!APP_SECRET || !PHONE_NUMBER_ID || !SUPABASE_URL || !SERVICE_KEY) {
      // Never disclose which piece is missing.
      return jsonResponse(500, { ok: false, error: "not_configured" });
    }

    // Read raw body with a hard size cap BEFORE JSON.parse. Length header is
    // untrusted; we still enforce the cap while draining the stream.
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return jsonResponse(413, { ok: false, error: "payload_too_large" });
    }
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BODY_BYTES) {
      return jsonResponse(413, { ok: false, error: "payload_too_large" });
    }

    const sigOk = await verifyMetaSignature(
      buf,
      req.headers.get("x-hub-signature-256"),
      APP_SECRET,
    );
    if (!sigOk) return jsonResponse(401, { ok: false, error: "invalid_signature" });

    // Only after signature validation do we parse JSON.
    let bodyJson: unknown;
    try {
      bodyJson = JSON.parse(new TextDecoder().decode(buf));
    } catch {
      return jsonResponse(400, { ok: false, error: "invalid_json" });
    }

    const parsed = parseMetaWebhookBody(bodyJson, PHONE_NUMBER_ID);
    if (!parsed.ok) return jsonResponse(400, { ok: false, error: parsed.error });

    // Fast ACK when there is nothing to do.
    if (parsed.statuses.length === 0) {
      return jsonResponse(200, { ok: true, received: 0, ignored: parsed.ignored });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let recorded = 0;
    let unmatched = 0;
    let errors = 0;
    for (const st of parsed.statuses) {
      const { data, error } = await supabase.rpc("rpc_record_whatsapp_delivery_status", {
        p_provider_message_id: st.id,
        p_status: st.status,
        p_timestamp: st.timestamp,
        p_error_code: st.error_code,
      });
      if (error) { errors++; continue; }
      const res = (data ?? {}) as { ok?: boolean; ignored?: boolean };
      if (res.ignored) unmatched++;
      else if (res.ok) recorded++;
    }

    // Meta wants 200 quickly. We surface counters without any PII.
    return jsonResponse(200, {
      ok: errors === 0,
      received: parsed.statuses.length,
      recorded,
      unmatched,
      errors,
      ignored: parsed.ignored,
    });
  } catch {
    // Never echo error details to Meta.
    return jsonResponse(500, { ok: false, error: "internal_error" });
  }
});
