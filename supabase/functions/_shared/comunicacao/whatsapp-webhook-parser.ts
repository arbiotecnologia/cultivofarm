// Pure utilities for the WhatsApp status webhook (Meta Cloud API).
// No Deno globals. Import from both the Edge Function (Deno) and tests (Node).

export const MAX_BODY_BYTES = 128 * 1024; // 128 KiB — Meta webhook payloads are small.
export const MAX_ENTRIES = 50;
export const MAX_CHANGES_PER_ENTRY = 20;
export const MAX_STATUSES_PER_CHANGE = 200;
export const MAX_STATUSES_TOTAL = 200;
export const MAX_STRING = 512;
export const MAX_CHALLENGE_LEN = 512;

export type ParsedStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | "deleted";
  timestamp: string; // ISO-8601 UTC
  error_code: string | null;
};

export type ParseResult =
  | { ok: true; statuses: ParsedStatus[]; ignored: number }
  | { ok: false; error: string };

export type ReadBodyResult =
  | { ok: true; body: Uint8Array }
  | { ok: false; error: "empty" | "payload_too_large" | "no_body" };

const STATUS_ALLOW = new Set(["sent", "delivered", "read", "failed", "deleted"]);
const ERROR_CODE_RE = /^[a-z0-9_.:-]{1,80}$/;
const CHALLENGE_RE = /^\d{1,512}$/;

/** Meta GET verification challenge must be a numeric string, 1..512 chars. */
export function isValidChallenge(v: string | null): boolean {
  if (typeof v !== "string") return false;
  if (v.length < 1 || v.length > MAX_CHALLENGE_LEN) return false;
  return CHALLENGE_RE.test(v);
}

/**
 * Stream the body with a hard byte cap. NEVER calls req.arrayBuffer() (which
 * has no upstream limit). Cancels the stream and returns payload_too_large
 * the instant the accumulated size would exceed `max`.
 */
export async function readBodyCapped(
  body: ReadableStream<Uint8Array> | null | undefined,
  max: number,
): Promise<ReadBodyResult> {
  if (!body) return { ok: false, error: "no_body" };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > max) {
        try { await reader.cancel(); } catch { /* noop */ }
        return { ok: false, error: "payload_too_large" };
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
  if (total === 0) return { ok: false, error: "empty" };
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return { ok: true, body: out };
}

function truncStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (v.length < 1 || v.length > MAX_STRING) return null;
  return v;
}

function normalizeErrorCode(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).toLowerCase().replace(/[^a-z0-9_.:-]/g, "_").slice(0, 80);
  if (!s || !ERROR_CODE_RE.test(s)) return null;
  return s;
}

function toIsoTimestamp(raw: unknown): string | null {
  // Meta sends unix-seconds as string. Accept string of digits or number.
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d{1,12}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Strict parser for Meta webhook body. Extracts ONLY id/status/timestamp/error_code
 * from `entry[].changes[].value.statuses[]`. Ignores incoming messages/contacts/media.
 *
 * Fail-closed on structural malformations. Content-level `phone_number_id`
 * mismatch on a `messages`/`whatsapp` change is a HARD ERROR
 * (`invalid_phone_number_id`) — it means Meta is delivering webhooks for a
 * phone we don't own; treating it as "ignored" would silently swallow that.
 *
 * Valid inbound content with no `statuses` (e.g. incoming user messages)
 * returns ok with statuses=[] and is safely ignored/200 by the caller.
 */
export function parseMetaWebhookBody(
  raw: unknown,
  expectedPhoneNumberId: string,
): ParseResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid_body" };
  const body = raw as Record<string, unknown>;
  if (body.object !== "whatsapp_business_account") return { ok: false, error: "invalid_object" };

  const entries = Array.isArray(body.entry) ? body.entry : null;
  if (!entries || entries.length === 0 || entries.length > MAX_ENTRIES) {
    return { ok: false, error: "invalid_entries" };
  }

  const out: ParsedStatus[] = [];
  let ignored = 0;

  for (const entryRaw of entries) {
    if (!entryRaw || typeof entryRaw !== "object") continue;
    const entry = entryRaw as Record<string, unknown>;
    const changes = Array.isArray(entry.changes) ? entry.changes : null;
    if (!changes || changes.length === 0 || changes.length > MAX_CHANGES_PER_ENTRY) continue;

    for (const changeRaw of changes) {
      if (!changeRaw || typeof changeRaw !== "object") continue;
      const change = changeRaw as Record<string, unknown>;
      if (change.field !== "messages") { ignored++; continue; }
      const value = (change.value ?? null) as Record<string, unknown> | null;
      if (!value || typeof value !== "object") { ignored++; continue; }
      if (value.messaging_product !== "whatsapp") { ignored++; continue; }

      const metadata = (value.metadata ?? null) as Record<string, unknown> | null;
      const phoneId = metadata && typeof metadata === "object"
        ? truncStr(metadata.phone_number_id)
        : null;
      // Structural malformation (metadata/phone_number_id ausente ou não string).
      if (!phoneId) return { ok: false, error: "invalid_body" };
      // phone_number_id mismatch é FAIL-CLOSED. Nunca deve chegar aqui em
      // produção; se chegar, Meta está entregando ao webhook errado.
      if (phoneId !== expectedPhoneNumberId) {
        return { ok: false, error: "invalid_phone_number_id" };
      }

      // Ignore inbound messages/contacts/media entirely.
      const statuses = Array.isArray(value.statuses) ? value.statuses : null;
      if (!statuses) { ignored++; continue; }
      if (statuses.length > MAX_STATUSES_PER_CHANGE) return { ok: false, error: "statuses_too_large" };

      for (const st of statuses) {
        if (out.length >= MAX_STATUSES_TOTAL) return { ok: false, error: "statuses_total_too_large" };
        if (!st || typeof st !== "object") { ignored++; continue; }
        const s = st as Record<string, unknown>;
        const id = truncStr(s.id);
        const status = typeof s.status === "string" ? s.status : null;
        const ts = toIsoTimestamp(s.timestamp);
        if (!id || !status || !STATUS_ALLOW.has(status) || !ts) { ignored++; continue; }
        // Individual receipt id must fit in the DB (200 chars).
        if (id.length > 200) { ignored++; continue; }

        let errorCode: string | null = null;
        const errors = Array.isArray(s.errors) ? s.errors : null;
        if (errors && errors.length > 0) {
          const first = errors[0] as Record<string, unknown>;
          errorCode = normalizeErrorCode(first?.code ?? first?.error_code ?? first?.title);
        }

        out.push({ id, status: status as ParsedStatus["status"], timestamp: ts, error_code: errorCode });
      }
    }
  }

  return { ok: true, statuses: out, ignored };
}

/**
 * Verifies Meta X-Hub-Signature-256 header (`sha256=<hex>`) against the raw body
 * using HMAC-SHA256 with the app secret. Constant-time comparison via WebCrypto.
 */
export async function verifyMetaSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const provided = signatureHeader.slice(prefix.length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody as BufferSource));
  const expected = Array.from(sigBuf).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time compare on same-length hex strings.
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}
