// Dedicated invoker credential for POST process-communication-outbox?lane=tenant_smtp ONLY.
// Header x-tenant-smtp-secret vs Edge secret TENANT_SMTP_LANE_INVOKER_SECRET. Never authorizes the global route.
// Transport v1 (ASCII-safe): header = "b64u1." + base64url(UTF-8 bytes of the secret), no padding, no CR/LF.
// The SQL invoker computes the same representation in memory. The raw secret is never accepted as header.
// Derived representations are secret material: never log, persist or echo them.
// Missing/empty/short configured value, missing/malformed header => deny. Constant-time comparison.
export const LANE_INVOKER_HEADER = "x-tenant-smtp-secret";
export const LANE_INVOKER_MIN_LENGTH = 32;
export const LANE_INVOKER_TRANSPORT_PREFIX = "b64u1.";
const HEADER_SHAPE = /^b64u1\.[A-Za-z0-9_-]+$/;

export function timingSafeEqualText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** base64url (RFC 4648 §5) of the UTF-8 bytes, without padding. */
export function base64UrlUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Versioned ASCII header representation of the configured secret (in memory only). */
export function laneInvokerTransportValue(secret: string): string {
  return LANE_INVOKER_TRANSPORT_PREFIX + base64UrlUtf8(secret);
}

/** True only for the exact lane route (POST, single lane=tenant_smtp param). */
export function isTenantLaneRequest(req: Request): boolean {
  const u = new URL(req.url);
  const lanes = u.searchParams.getAll("lane");
  return req.method === "POST" && lanes.length === 1 && lanes[0] === "tenant_smtp";
}

export function authorizeLaneInvoker(req: Request, configured: string | undefined): boolean {
  if (!isTenantLaneRequest(req)) return false;
  const expected = configured ?? "";
  const got = req.headers.get(LANE_INVOKER_HEADER) ?? "";
  if (expected.length < LANE_INVOKER_MIN_LENGTH || !HEADER_SHAPE.test(got)) return false;
  return timingSafeEqualText(got, laneInvokerTransportValue(expected));
}
