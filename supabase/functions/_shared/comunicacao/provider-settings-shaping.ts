// Provider settings payload shaping — pure, importável em Node.
// Toda validação, normalização e sanitização de erro do PUT vive aqui.
// index.ts do Edge Function apenas encaminha ao RPC atômico.

export type SecretSlot =
  | "smtp_password" | "whatsapp_access_token"
  | "whatsapp_app_secret" | "whatsapp_verify_token";

export const VALID_SECRET_SLOTS: readonly SecretSlot[] = [
  "smtp_password", "whatsapp_access_token", "whatsapp_app_secret", "whatsapp_verify_token",
] as const;

export const ALLOWED_WA_API_VERSIONS = ["v24.0", "v25.0"] as const;

export const SAFE_ERROR_CODES = new Set<string>([
  "test_mode_off_requires_email_provider",
  "test_mode_off_requires_whatsapp_provider",
  "email_enabled_requires_provider_configured",
  "whatsapp_enabled_requires_provider_configured",
  "settings_row_missing", "invalid_slot", "invalid_secret_action",
  "empty_secret_value", "invalid_payload", "invalid_updates", "invalid_secret_ops",
]);

const boolOrNull = (v: unknown): boolean | null => (v === true || v === false) ? v : null;

export function mask(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v);
  if (s.length <= 4) return "•".repeat(s.length);
  return `${s.slice(0, 2)}${"•".repeat(Math.max(1, s.length - 4))}${s.slice(-2)}`;
}

export const normEmail = (s: string) => String(s ?? "").trim().toLowerCase();
export const normPhone = (s: string) => {
  const d = String(s ?? "").replace(/\D+/g, "");
  return d ? `+${d}` : "";
};

export function parseList(v: unknown, kind: "email" | "phone"): string[] | null {
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

export function validatePort(n: unknown): number | null | "invalid" {
  if (n === null) return null;
  if (n === undefined) return "invalid";
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > 65535) return "invalid";
  return v;
}

export interface PutPayload {
  test_mode_enabled?: boolean;
  confirm_disable_test_mode?: string;
  allowed_emails?: unknown;
  allowed_phones?: unknown;
  flags?: Partial<Record<
    "delivery_enabled"|"email_delivery_enabled"|"whatsapp_delivery_enabled"|"inapp_delivery_enabled"|"whatsapp_webhook_enabled",
    boolean
  >> & { confirm_enable?: string };
  smtp?: { host?: string | null; port?: number | null; user?: string | null; from?: string | null; password?: string };
  whatsapp?: { phone_number_id?: string | null; api_version?: string | null; access_token?: string };
  webhook?: { app_secret?: string; verify_token?: string };
}

export interface AtomicPayload {
  updates: Record<string, unknown>;
  secret_ops: Array<{ slot: SecretSlot; action: "set" | "clear"; value?: string }>;
}

export function buildAtomicPayload(body: PutPayload): AtomicPayload | { error: string } {
  const updates: Record<string, unknown> = {};
  const secret_ops: AtomicPayload["secret_ops"] = [];

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
    const toggles = ["delivery_enabled","email_delivery_enabled","whatsapp_delivery_enabled","inapp_delivery_enabled","whatsapp_webhook_enabled"] as const;
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
    // password ausente ou string vazia → NÃO gera secret_op (preserva).
  }

  if (body.whatsapp) {
    const w = body.whatsapp;
    if (w.phone_number_id !== undefined) {
      if (w.phone_number_id && !/^[0-9]+$/.test(String(w.phone_number_id))) return { error: "invalid_phone_number_id" };
      updates.whatsapp_phone_number_id = w.phone_number_id || "";
    }
    if (w.api_version !== undefined) {
      if (w.api_version && !(ALLOWED_WA_API_VERSIONS as readonly string[]).includes(String(w.api_version))) {
        return { error: "invalid_api_version" };
      }
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

export interface ClearSecretRequest {
  action: "clear_secret";
  slot?: unknown;
  confirm?: unknown;
}

export function buildClearSecretPayload(body: ClearSecretRequest): AtomicPayload | { error: string } {
  if (body.confirm !== "REMOVE") return { error: "confirmation_required" };
  const slot = body.slot as SecretSlot;
  if (!slot || !VALID_SECRET_SLOTS.includes(slot)) return { error: "invalid_slot" };
  return { updates: {}, secret_ops: [{ slot, action: "clear" }] };
}

export function sanitizeRpcError(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? "");
  for (const code of SAFE_ERROR_CODES) if (msg.includes(code)) return code;
  return "atomic_apply_failed";
}
