// Edge Function: communication-provider-settings
// - GET: retorna apenas campos não sensíveis + booleans "configured" + máscaras.
// - PUT: valida payload, atualiza Vault (create/update/delete) e a linha única
//        de configuração. Blank em campo secreto = preservar; para remover, use
//        action clear_secret com confirmação explícita.
// - Requer JWT + role 'administrador' (fail-closed). Nunca loga body/secret.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------------- utilities ----------------
function mask(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v);
  if (s.length <= 4) return "•".repeat(s.length);
  return `${s.slice(0, 2)}${"•".repeat(Math.max(1, s.length - 4))}${s.slice(-2)}`;
}

function normEmail(s: string): string {
  return String(s ?? "").trim().toLowerCase();
}
function normPhone(s: string): string {
  const d = String(s ?? "").replace(/\D+/g, "");
  return d ? `+${d}` : "";
}
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

function bool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  return null;
}

// ---------------- auth ----------------
async function authorizeAdmin(req: Request):
  Promise<{ ok: true; sb: ReturnType<typeof createClient>; userId: string } | { ok: false; res: Response }>
{
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { ok: false, res: json(500, { ok: false, error: "not_configured" }) };
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return { ok: false, res: json(401, { ok: false, error: "unauthorized" }) };
  const token = auth.slice(7).trim();
  if (!token) return { ok: false, res: json(401, { ok: false, error: "unauthorized" }) };

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { ok: false, res: json(401, { ok: false, error: "invalid_token" }) };
  const uid = data.user.id;
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", uid);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "administrador");
  if (!isAdmin) return { ok: false, res: json(403, { ok: false, error: "forbidden" }) };
  return { ok: true, sb, userId: uid };
}

// ---------------- vault helpers ----------------
type SecretSlot =
  | "smtp_password"
  | "whatsapp_access_token"
  | "whatsapp_app_secret"
  | "whatsapp_verify_token";

const VALID_SLOTS: readonly SecretSlot[] = [
  "smtp_password", "whatsapp_access_token", "whatsapp_app_secret", "whatsapp_verify_token",
] as const;

// The RPCs vault_create_secret / vault_update_secret don't exist by default.
// Simpler safe approach: create tiny SECURITY DEFINER wrappers inline via SQL is not possible here.
// So we use a lightweight approach: call a shared helper RPC we create in this same session? Not available.
// Instead, expose two additional service-role-only RPCs the function calls:
//   rpc_service_set_provider_secret(slot text, value text)
//   rpc_service_clear_provider_secret(slot text)
// These must exist in the DB. Since we defined only the runtime loader, we need
// to add them via migration. To keep this file coherent, we assume they exist
// (created in the accompanying migration).

async function setSecretViaRpc(sb: ReturnType<typeof createClient>, slot: SecretSlot, value: string, actor: string): Promise<void> {
  const { error } = await sb.rpc("rpc_service_set_provider_secret", {
    p_slot: slot, p_value: value, p_actor: actor,
  });
  if (error) throw new Error("vault_error");
}
async function clearSecretViaRpc(sb: ReturnType<typeof createClient>, slot: SecretSlot, actor: string): Promise<void> {
  const { error } = await sb.rpc("rpc_service_clear_provider_secret", { p_slot: slot, p_actor: actor });
  if (error) throw new Error("vault_error");
}

// ---------------- shape ----------------
async function loadPublicView(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb
    .from("communication_provider_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
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
      host: row.smtp_host ?? null,
      port: row.smtp_port ?? null,
      user: row.smtp_user ?? null,
      from: row.smtp_from ?? null,
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

// ---------------- PUT payload ----------------
interface PutPayload {
  test_mode_enabled?: boolean;
  allowed_emails?: string[];
  allowed_phones?: string[];
  flags?: {
    delivery_enabled?: boolean;
    email_delivery_enabled?: boolean;
    whatsapp_delivery_enabled?: boolean;
    inapp_delivery_enabled?: boolean;
    whatsapp_webhook_enabled?: boolean;
    confirm_enable?: string; // "I_UNDERSTAND" required when toggling any flag ON
  };
  smtp?: {
    host?: string | null;
    port?: number | null;
    user?: string | null;
    from?: string | null;
    password?: string; // blank/undefined = preserve
  };
  whatsapp?: {
    phone_number_id?: string | null;
    api_version?: string | null;
    access_token?: string; // blank/undefined = preserve
  };
  webhook?: {
    app_secret?: string;
    verify_token?: string;
  };
}

function validatePort(n: unknown): number | null | undefined {
  if (n === null) return null;
  if (n === undefined) return undefined;
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > 65535) return undefined; // ignore invalid
  return v;
}

async function handlePut(sb: ReturnType<typeof createClient>, userId: string, body: PutPayload) {
  const changed: string[] = [];
  const secretActions: { slot: SecretSlot; value: string }[] = [];
  const update: Record<string, unknown> = {};

  if (bool(body.test_mode_enabled) !== null) { update.test_mode_enabled = body.test_mode_enabled; changed.push("test_mode_enabled"); }
  if (body.allowed_emails !== undefined) {
    const list = parseList(body.allowed_emails, "email");
    if (list === null) return json(400, { ok: false, error: "invalid_allowed_emails" });
    update.allowed_emails = list; changed.push("allowed_emails");
  }
  if (body.allowed_phones !== undefined) {
    const list = parseList(body.allowed_phones, "phone");
    if (list === null) return json(400, { ok: false, error: "invalid_allowed_phones" });
    update.allowed_phones = list; changed.push("allowed_phones");
  }

  if (body.flags) {
    const f = body.flags;
    const toggles: Array<[keyof typeof f, string]> = [
      ["delivery_enabled", "delivery_enabled"],
      ["email_delivery_enabled", "email_delivery_enabled"],
      ["whatsapp_delivery_enabled", "whatsapp_delivery_enabled"],
      ["inapp_delivery_enabled", "inapp_delivery_enabled"],
      ["whatsapp_webhook_enabled", "whatsapp_webhook_enabled"],
    ];
    const anyOn = toggles.some(([k]) => f[k] === true);
    if (anyOn && f.confirm_enable !== "I_UNDERSTAND") {
      return json(400, { ok: false, error: "confirmation_required" });
    }
    for (const [k, col] of toggles) {
      const b = bool(f[k]);
      if (b !== null) { update[col] = b; changed.push(col); }
    }
  }

  if (body.smtp) {
    const s = body.smtp;
    if (s.host !== undefined) { update.smtp_host = s.host || null; changed.push("smtp_host"); }
    if (s.user !== undefined) { update.smtp_user = s.user || null; changed.push("smtp_user"); }
    if (s.from !== undefined) {
      if (s.from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.from))) return json(400, { ok: false, error: "invalid_smtp_from" });
      update.smtp_from = s.from || null; changed.push("smtp_from");
    }
    if (s.port !== undefined) {
      const p = validatePort(s.port);
      if (p === undefined && s.port !== null) return json(400, { ok: false, error: "invalid_smtp_port" });
      update.smtp_port = p === undefined ? null : p; changed.push("smtp_port");
    }
    if (typeof s.password === "string" && s.password.length > 0) {
      if (s.password.length > 4096) return json(400, { ok: false, error: "smtp_password_too_long" });
      secretActions.push({ slot: "smtp_password", value: s.password });
    }
  }

  if (body.whatsapp) {
    const w = body.whatsapp;
    if (w.phone_number_id !== undefined) {
      if (w.phone_number_id && !/^[0-9]+$/.test(String(w.phone_number_id))) return json(400, { ok: false, error: "invalid_phone_number_id" });
      update.whatsapp_phone_number_id = w.phone_number_id || null; changed.push("whatsapp_phone_number_id");
    }
    if (w.api_version !== undefined) {
      if (w.api_version && !["v24.0", "v25.0"].includes(String(w.api_version))) return json(400, { ok: false, error: "invalid_api_version" });
      update.whatsapp_api_version = w.api_version || null; changed.push("whatsapp_api_version");
    }
    if (typeof w.access_token === "string" && w.access_token.length > 0) {
      if (w.access_token.length > 8192) return json(400, { ok: false, error: "access_token_too_long" });
      secretActions.push({ slot: "whatsapp_access_token", value: w.access_token });
    }
  }

  if (body.webhook) {
    if (typeof body.webhook.app_secret === "string" && body.webhook.app_secret.length > 0) {
      if (body.webhook.app_secret.length > 4096) return json(400, { ok: false, error: "app_secret_too_long" });
      secretActions.push({ slot: "whatsapp_app_secret", value: body.webhook.app_secret });
    }
    if (typeof body.webhook.verify_token === "string" && body.webhook.verify_token.length > 0) {
      if (body.webhook.verify_token.length > 1024) return json(400, { ok: false, error: "verify_token_too_long" });
      secretActions.push({ slot: "whatsapp_verify_token", value: body.webhook.verify_token });
    }
  }

  // Apply secrets first via RPC (each RPC updates the settings row too).
  for (const sa of secretActions) {
    await setSecretViaRpc(sb, sa.slot, sa.value, userId);
    changed.push(`secret_${sa.slot}`);
  }

  if (Object.keys(update).length > 0) {
    update.updated_at = new Date().toISOString();
    update.updated_by = userId;
    const { error } = await sb.from("communication_provider_settings").update(update).eq("id", 1);
    if (error) return json(500, { ok: false, error: "db_error" });
  }

  await sb.from("communication_provider_settings_audit").insert({
    actor_id: userId, action: "update", changed_fields: changed,
  });

  const view = await loadPublicView(sb);
  return json(200, view);
}

async function handleClearSecret(sb: ReturnType<typeof createClient>, userId: string, body: { slot?: string; confirm?: string }) {
  if (body.confirm !== "REMOVE") return json(400, { ok: false, error: "confirmation_required" });
  const slot = body.slot as SecretSlot;
  if (!slot || !VALID_SLOTS.includes(slot)) return json(400, { ok: false, error: "invalid_slot" });
  await clearSecretViaRpc(sb, slot, userId);
  await sb.from("communication_provider_settings_audit").insert({
    actor_id: userId, action: "clear_secret", secret_field: slot, changed_fields: [`secret_${slot}`],
  });
  return json(200, await loadPublicView(sb));
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const az = await authorizeAdmin(req);
    if (!az.ok) return az.res;
    const { sb, userId } = az;

    if (req.method === "GET") {
      return json(200, await loadPublicView(sb));
    }
    if (req.method === "PUT" || req.method === "POST") {
      let body: any = {};
      try { body = await req.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
      if (body && body.action === "clear_secret") {
        return await handleClearSecret(sb, userId, body);
      }
      return await handlePut(sb, userId, body);
    }
    return json(405, { ok: false, error: "method_not_allowed" });
  } catch (_e) {
    return json(500, { ok: false, error: "internal_error" });
  }
});
