// Edge Function: whatsapp-status-webhook (Fase 4)
// - GET: challenge Meta (hub.mode=subscribe + verify_token) → devolve hub.challenge em text/plain.
//        Challenge é validado: numérico 1..512 chars. Qualquer outra coisa é 400.
// - POST: público (Meta não envia JWT). Autenticidade via HMAC-SHA256 do RAW body
//         (X-Hub-Signature-256) usando WHATSAPP_APP_SECRET. Constant-time compare.
// - Body é lido em STREAMING com cap explícito (MAX_BODY_BYTES). NUNCA usa
//   req.arrayBuffer() sem limite; content-length é pré-filtro, não defesa única.
// - Falha em qualquer RPC (não em unmatched/duplicated) escala HTTP 500 genérico
//   para forçar retry Meta — nunca 200 com ok:false.
// - Nunca loga body, telefone, wamid, secrets ou detalhes de erro.
// - Chama service_role RPC rpc_record_whatsapp_delivery_status por status extraído.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  isValidChallenge,
  MAX_BODY_BYTES,
  parseMetaWebhookBody,
  readBodyCapped,
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

      // Challenge: numérico 1..512 chars. Fora disso = 400 (fecha eco arbitrário).
      if (!isValidChallenge(challenge)) return textResponse(400, "bad_request");

      // Constant-time compare do verify_token.
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

    // Content-length é pré-filtro barato. Não é a defesa única (header não
    // é confiável): o streaming reader impõe o mesmo cap.
    const clRaw = req.headers.get("content-length");
    if (clRaw !== null) {
      const cl = Number(clRaw);
      if (!Number.isFinite(cl) || cl < 0 || cl > MAX_BODY_BYTES) {
        return jsonResponse(413, { ok: false, error: "payload_too_large" });
      }
    }

    // Streaming read com cap. Cancela o stream ao exceder MAX_BODY_BYTES.
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
    let duplicated = 0;
    let errors = 0;
    for (const st of parsed.statuses) {
      const { data, error } = await supabase.rpc("rpc_record_whatsapp_delivery_status", {
        p_provider_message_id: st.id,
        p_status: st.status,
        p_timestamp: st.timestamp,
        p_error_code: st.error_code,
      });
      if (error) { errors++; continue; }
      const res = (data ?? {}) as { ok?: boolean; ignored?: boolean; duplicated?: boolean };
      if (res.ignored) unmatched++;
      else if (res.duplicated) duplicated++;
      else if (res.ok) recorded++;
    }

    // Se QUALQUER RPC falhou, retorna 500 genérico. Meta reentrega — não
    // podemos ACK 200 e perder o evento. Nada de PII no corpo.
    if (errors > 0) {
      return jsonResponse(500, { ok: false, error: "internal_error" });
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
    // Never echo error details to Meta.
    return jsonResponse(500, { ok: false, error: "internal_error" });
  }
});
