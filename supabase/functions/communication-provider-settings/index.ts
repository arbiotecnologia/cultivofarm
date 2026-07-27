// Edge Function: communication-provider-settings
// - CORS restrito a origens confiáveis (helper compartilhado).
// - JWT + role administrador (fail-closed).
// - Rate limit persistente por (user_id, action) via RPC de serviço.
// - Todas as mutações passam por rpc_service_apply_provider_settings em UMA
//   transação; falha em qualquer etapa → rollback total.
// - GET não expõe segredos; apenas booleans, contagens e máscaras.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";

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

// ---------------- utilities ----------------
function mask(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v);
  if (s.length <= 4) return "•".repeat(s.length);
  return `${s.slice(0, 2)}${"•".repeat(Math.max(1, s.length - 4))}${s.slice(-2)}`;
}
const normEmail = (s: string) => String(s ?? "").trim().toLowerCase();
const normPhone = (s: string) => {
  const d = String(s ?? "").replace(/\D+/g, "");
  return d ? `+${d}` : "";
};
function parseList(v: unknown, kind: "email" | "phone"): string[] | null {
  if (v == null) return null;
  if (!Array.isArray(v)) return null;
  const norm = kind === "email" ? normEmail : normPhone;
  const out = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") continue;
    const n = norm(x);
    if (!n) continue;
    if (kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) continue;
    if (out.size >= 200) break;
    out.add(n);
  }
  return [...out];
}
const boolOrNull = (v: unknown): boolean | null => (v === true || v === false) ? v : null;

function validatePort(n: unknown): number | null | "invalid" {
  if (n === null) return null;
  if (n === undefined) return "invalid";
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > 65535) return "invalid";
  return v;
}

// ---------------- auth ----------------
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

// ---------------- shape ----------------
async function loadPublicView(sb: Sb) {
  const { data, error } = await sb
    .from("communication_provider_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error("db_error");
  const row = data as any ?? {};
  return {
    ok: true,
    test_mode_enabled: !!row.test_mode_enabled,
    allowed_emails_count: (row.allowed_emails ?? []).length,
    allowed_phones_count: (row.allowed_phones ?? []).length,
    allowed_emails_masked: (row.allowed_emails ?? []).map(mask),
    allowed_phones_masked: (row.allowed_phones ?? []).map(mask),
    flags: {
      delivery_enabled: !!row.delivery_enabled,
      email_delivery_enabled: !!row.email_delivery_enabled,
      whatsapp_delivery_enabled: !!row.whatsapp_delivery_enabled,
      inapp_delivery_enabled: !!row.inapp_delivery_enabled,
      whatsapp_webhook_enabled: !!row.whatsapp_webhook_enabled,
    },
    smtp: {
      host: row.smtp_host ?? null, port: row.smtp_port ?? null,
      user: row.smtp_user ?? null, from: row.smtp_from ?? null,
      password_configured: !!row.secret_smtp_password,
    },
    whatsapp: {
      phone_number_id: row.whatsapp_phone_number_id ?? null,
      api_version: row.whatsapp_api_version ?? null,
      access_token_configured: !!row.secret_whatsapp_access_token,
      allowed_api_versions: ["v24.0", "v25.0"],
    },
    webhook: {
      app_secret_configured: !!row.secret_whatsapp_app_secret,
      verify_token_configured: !!row.secret_whatsapp_verify_token,
      url: `${SUPABASE_URL}/functions/v1/whatsapp-status-webhook`,
    },
    updated_at: row.updated_at ?? null,
  };
}

// ---------------- payload shaping ----------------
type SecretSlot = "smtp_password" | "whatsapp_access_token" | "whatsapp_app_secret" | "whatsapp_verify_token";
const VALID_SLOTS: readonly SecretSlot[] = [
  "smtp_password", "whatsapp_access_token", "whatsapp_app_secret", "whatsapp_verify_token",
] as const;

interface PutPayload {
  test_mode_enabled?: boolean;
  confirm_disable_test_mode?: string;
  allowed_emails?: string[];
  allowed_phones?: string[];
  flags?: Partial<Record<"delivery_enabled"|"email_delivery_enabled"|"whatsapp_delivery_enabled"|"inapp_delivery_enabled"|"whatsapp_webhook_enabled", boolean>> & { confirm_enable?: string };
  smtp?: { host?: string | null; port?: number | null; user?: string | null; from?: string | null; password?: string };
  whatsapp?: { phone_number_id?: string | null; api_version?: string | null; access_token?: string };
  webhook?: { app_secret?: string; verify_token?: string };
}

function buildAtomicPayload(body: PutPayload): { updates: Record<string, unknown>; secret_ops: Array<{slot: SecretSlot; action: "set"|"clear"; value?: string}> } | { error: string } {
  const updates: Record<string, unknown> = {};
  const secret_ops: Array<{slot: SecretSlot; action: "set"|"clear"; value?: string}> = [];

  if (boolOrNull(body.test_mode_enabled) !== null) {
    if (body.test_mode_enabled === false && body.confirm_disable_test_mode !== "I_UNDERSTAND_REAL_SENDS") {
      return { error: "confirmation_required_disable_test_mode" };
    }
    updates.test_mode_enabled = body.test_mode_enabled;
  }
  if (body.allowed_emails !== undefined) {
    const list = parseList(body.allowed_emails, "email");
    if (list === null) return { error: "invalid_allowed_emails" };
    updates.allowed_emails = list;
  }
  if (body.allowed_phones !== undefined) {
    const list = parseList(body.allowed_phones, "phone");
    if (list === null) return { error: "invalid_allowed_phones" };
    updates.allowed_phones = list;
  }

  if (body.flags) {
    const f = body.flags;
    const toggles: Array<keyof typeof f> = ["delivery_enabled","email_delivery_enabled","whatsapp_delivery_enabled","inapp_delivery_enabled","whatsapp_webhook_enabled"];
    const anyOn = toggles.some((k) => f[k] === true);
    if (anyOn && f.confirm_enable !== "I_UNDERSTAND") return { error: "confirmation_required" };
    for (const k of toggles) {
      const b = boolOrNull(f[k]);
      if (b !== null) updates[k as string] = b;
    }
  }

  if (body.smtp) {
    const s = body.smtp;
    if (s.host !== undefined) updates.smtp_host = s.host || "";
    if (s.user !== undefined) updates.smtp_user = s.user || "";
    if (s.from !== undefined) {
      if (s.from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.from))) return { error: "invalid_smtp_from" };
      updates.smtp_from = s.from || "";
    }
    if (s.port !== undefined) {
      const p = validatePort(s.port);
      if (p === "invalid") return { error: "invalid_smtp_port" };
      updates.smtp_port = p === null ? "" : String(p);
    }
    if (typeof s.password === "string" && s.password.length > 0) {
      if (s.password.length > 4096) return { error: "smtp_password_too_long" };
      secret_ops.push({ slot: "smtp_password", action: "set", value: s.password });
    }
  }

  if (body.whatsapp) {
    const w = body.whatsapp;
    if (w.phone_number_id !== undefined) {
      if (w.phone_number_id && !/^[0-9]+$/.test(String(w.phone_number_id))) return { error: "invalid_phone_number_id" };
      updates.whatsapp_phone_number_id = w.phone_number_id || "";
    }
    if (w.api_version !== undefined) {
      if (w.api_version && !["v24.0", "v25.0"].includes(String(w.api_version))) return { error: "invalid_api_version" };
      updates.whatsapp_api_version = w.api_version || "";
    }
    if (typeof w.access_token === "string" && w.access_token.length > 0) {
      if (w.access_token.length > 8192) return { error: "access_token_too_long" };
      secret_ops.push({ slot: "whatsapp_access_token", action: "set", value: w.access_token });
    }
  }

  if (body.webhook) {
    if (typeof body.webhook.app_secret === "string" && body.webhook.app_secret.length > 0) {
      if (body.webhook.app_secret.length > 4096) return { error: "app_secret_too_long" };
      secret_ops.push({ slot: "whatsapp_app_secret", action: "set", value: body.webhook.app_secret });
    }
    if (typeof body.webhook.verify_token === "string" && body.webhook.verify_token.length > 0) {
      if (body.webhook.verify_token.length > 1024) return { error: "verify_token_too_long" };
      secret_ops.push({ slot: "whatsapp_verify_token", action: "set", value: body.webhook.verify_token });
    }
  }

  return { updates, secret_ops };
}

const SAFE_ERROR_CODES = new Set([
  "test_mode_off_requires_email_provider",
  "test_mode_off_requires_whatsapp_provider",
  "email_enabled_requires_provider_configured",
  "whatsapp_enabled_requires_provider_configured",
  "settings_row_missing", "invalid_slot", "invalid_secret_action",
  "empty_secret_value", "invalid_payload", "invalid_updates", "invalid_secret_ops",
]);

function sanitizeRpcError(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? "");
  for (const code of SAFE_ERROR_CODES) if (msg.includes(code)) return code;
  return "atomic_apply_failed";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  try {
    if (req.method === "OPTIONS") return handlePreflight(req);

    // Deny non-trusted origins for any real request.
    if (origin && !isTrustedOrigin(origin)) {
      return new Response(JSON.stringify({ ok: false, error: "origin_not_allowed" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }

    const az = await authorizeAdmin(req, origin);
    if (!az.ok) return az.res;
    const { sb, userId } = az;

    // Rate limit per (user, method).
    const action = req.method === "GET" ? "get" : "mutate";
    if (!(await checkRateLimit(sb, userId, action))) {
      return jsonWith(origin, 429, { ok: false, error: "rate_limited" });
    }

    if (req.method === "GET") {
      return jsonWith(origin, 200, await loadPublicView(sb));
    }
    if (req.method === "PUT" || req.method === "POST") {
      let body: any = {};
      try { body = await req.json(); } catch { return jsonWith(origin, 400, { ok: false, error: "invalid_json" }); }

      // Clear-secret action (dedicated path with typed confirmation).
      if (body && body.action === "clear_secret") {
        if (body.confirm !== "REMOVE") return jsonWith(origin, 400, { ok: false, error: "confirmation_required" });
        const slot = body.slot as SecretSlot;
        if (!slot || !VALID_SLOTS.includes(slot)) return jsonWith(origin, 400, { ok: false, error: "invalid_slot" });
        const { error } = await sb.rpc("rpc_service_apply_provider_settings", {
          p_actor: userId,
          p_payload: { updates: {}, secret_ops: [{ slot, action: "clear" }] },
        });
        if (error) return jsonWith(origin, 400, { ok: false, error: sanitizeRpcError(error) });
        return jsonWith(origin, 200, await loadPublicView(sb));
      }

      const shaped = buildAtomicPayload(body as PutPayload);
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
