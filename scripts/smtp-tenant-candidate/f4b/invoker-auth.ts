// Dedicated invoker credential for POST process-communication-outbox?lane=tenant_smtp ONLY.
// Header x-tenant-smtp-secret vs Edge secret TENANT_SMTP_LANE_INVOKER_SECRET. Never authorizes the global route.
// Missing/empty/short configured value or header => deny. Constant-time comparison; never logs/echoes values.
export const LANE_INVOKER_HEADER = "x-tenant-smtp-secret";
export const LANE_INVOKER_MIN_LENGTH = 32;

export function timingSafeEqualText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
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
  if (expected.length < LANE_INVOKER_MIN_LENGTH || got.length === 0) return false;
  return timingSafeEqualText(got, expected);
}
