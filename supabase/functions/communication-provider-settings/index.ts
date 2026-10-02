// Edge Function: communication-provider-settings
// - CORS restrito a origens confiáveis (helper compartilhado).
// - JWT + role administrador (fail-closed).
// - Rate limit persistente por (user_id, action) via RPC de serviço.
// - Toda mutação passa por UMA chamada a rpc_service_apply_provider_settings;
//   qualquer falha aborta a transação inteira.
// - GET nunca expõe segredos ou allowlists em texto claro (apenas máscaras).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";
import {
  buildAtomicPayload,
  buildClearSecretPayload,
  mask,
  sanitizeRpcError,
  type PutPayload,
} from "../_shared/comunicacao/provider-settings-shaping.ts";
import { buildSmtpReadiness } from "../_shared/comunicacao/smtp-readiness.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const RATE_LIMIT_MAX = 30;      // requests
const RATE_LIMIT_WINDOW = 60;   // seconds

function jsonWith(origin: string | null, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin), "Content-Type": "application/json" },
  });
}

type Sb = ReturnType<typeof createClient>;

async function authorizeAdmin(req: Request, origin: string | null):
  Promise<{ ok: true; sb: Sb; userId: string } | { ok: false; res: Response }>
{
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { ok: false, res: jsonWith(origin, 500, { ok: false, error: "not_configured" }) };
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return { ok: false, res: jsonWith(origin, 401, { ok: false, error: "unauthorized" }) };
  const token = auth.slice(7).trim();
  if (!token) return { ok: false, res: jsonWith(origin, 401, { ok: false, error: "unauthorized" }) };

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { ok: false, res: jsonWith(origin, 401, { ok: false, error: "invalid_token" }) };
  const uid = data.user.id;
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", uid);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "administrador");
  if (!isAdmin) return { ok: false, res: jsonWith(origin, 403, { ok: false, error: "forbidden" }) };
  return { ok: true, sb, userId: uid };
}

async function checkRateLimit(sb: Sb, userId: string, action: string): Promise<boolean> {
  const { data, error } = await sb.rpc("rpc_service_check_rate_limit", {
    p_user: userId, p_action: action, p_max: RATE_LIMIT_MAX, p_window_seconds: RATE_LIMIT_WINDOW,
  });
  if (error) return false; // fail-closed
  return data === true;
}

async function loadPublicView(sb: Sb) {
  // Leitura direta apenas via cliente service_role dentro desta função — nunca
  // exposta ao cliente. Segredos ficam SÓ nas colunas boolean secret_*_configured.
  const { data, error } = await sb
    .from("communication_provider_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error("db_error");
  const singletonExists = data !== null;
  const row = (data ?? {}) as Record<string, unknown>;
  const arr = (k: string): string[] => Array.isArray(row[k]) ? (row[k] as string[]) : [];
  const bool = (k: string) => row[k] === true;
  const str  = (k: string) => (typeof row[k] === "string" ? (row[k] as string) : null);
  const num  = (k: string) => (typeof row[k] === "number" ? (row[k] as number) : null);
  return {
    ok: true,
    test_mode_enabled: bool("test_mode_enabled"),
    allowed_emails_count: arr("allowed_emails").length,
    allowed_phones_count: arr("allowed_phones").length,
    // MÁSCARAS APENAS — jamais o valor em texto claro.
    allowed_emails_masked: arr("allowed_emails").map(mask),
    allowed_phones_masked: arr("allowed_phones").map(mask),
    flags: {
      delivery_enabled: bool("delivery_enabled"),
      email_delivery_enabled: bool("email_delivery_enabled"),
      whatsapp_delivery_enabled: bool("whatsapp_delivery_enabled"),
      inapp_delivery_enabled: bool("inapp_delivery_enabled"),
      whatsapp_webhook_enabled: bool("whatsapp_webhook_enabled"),
    },
    smtp: {
      host: str("smtp_host"), port: num("smtp_port"),
      user: str("smtp_user"), from: str("smtp_from"),
      password_configured: bool("secret_smtp_password"),
    },
    smtp_readiness: buildSmtpReadiness(singletonExists ? row : null),
    whatsapp: {
      phone_number_id: str("whatsapp_phone_number_id"),
      api_version: str("whatsapp_api_version"),
      access_token_configured: bool("secret_whatsapp_access_token"),
      allowed_api_versions: ["v24.0", "v25.0"],
    },
    webhook: {
      app_secret_configured: bool("secret_whatsapp_app_secret"),
      verify_token_configured: bool("secret_whatsapp_verify_token"),
      url: `${SUPABASE_URL}/functions/v1/whatsapp-status-webhook`,
    },
    updated_at: str("updated_at"),
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  try {
    if (req.method === "OPTIONS") return handlePreflight(req);

    if (origin && !isTrustedOrigin(origin)) {
      return new Response(JSON.stringify({ ok: false, error: "origin_not_allowed" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }

    const az = await authorizeAdmin(req, origin);
    if (!az.ok) return az.res;
    const { sb, userId } = az;

    const action = req.method === "GET" ? "get" : "mutate";
    if (!(await checkRateLimit(sb, userId, action))) {
      return jsonWith(origin, 429, { ok: false, error: "rate_limited" });
    }

    if (req.method === "GET") {
      return jsonWith(origin, 200, await loadPublicView(sb));
    }
    if (req.method === "PUT" || req.method === "POST") {
      let body: Record<string, unknown> = {};
      try { body = await req.json(); } catch { return jsonWith(origin, 400, { ok: false, error: "invalid_json" }); }

      let shaped: ReturnType<typeof buildAtomicPayload>;
      if (body && (body as { action?: unknown }).action === "clear_secret") {
        shaped = buildClearSecretPayload(body as Parameters<typeof buildClearSecretPayload>[0]);
      } else {
        shaped = buildAtomicPayload(body as PutPayload);
      }
      if ("error" in shaped) return jsonWith(origin, 400, { ok: false, error: shaped.error });
      if (Object.keys(shaped.updates).length === 0 && shaped.secret_ops.length === 0) {
        return jsonWith(origin, 400, { ok: false, error: "empty_payload" });
      }

      const { error } = await sb.rpc("rpc_service_apply_provider_settings", {
        p_actor: userId,
        p_payload: { updates: shaped.updates, secret_ops: shaped.secret_ops },
      });
      if (error) return jsonWith(origin, 400, { ok: false, error: sanitizeRpcError(error) });
      return jsonWith(origin, 200, await loadPublicView(sb));
    }
    return jsonWith(origin, 405, { ok: false, error: "method_not_allowed" });
  } catch {
    return jsonWith(origin, 500, { ok: false, error: "internal_error" });
  }
});
