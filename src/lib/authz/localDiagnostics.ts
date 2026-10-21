/** Local bounded diagnostics only: never identity, URLs, fingerprints, payloads or error text. */
export interface AuthzDiagnostic {
  event: "request" | "response" | "expire" | "environment" | "stale" | "auth_refresh" | "auth_reconfirmed" | "load_restart" | "load_timeout" | "auto_retry" | "lapse";
  state: string;
  reason: "error" | "offline" | "timeout" | "ineligible" | null;
  visible: boolean;
  online: boolean;
  rttMs: number | null;
  leaseRemainingMs: number | null;
  requestRemainingMs: number | null;
}
const records: AuthzDiagnostic[] = [];
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value)
  ? Math.round(Math.max(-3_600_000, Math.min(3_600_000, value))) : null;
export function recordAuthzDiagnostic(sample: AuthzDiagnostic): void {
  // Reconstruct the allowlist, never spread untrusted input into diagnostics.
  const event = ["request", "response", "expire", "environment", "stale", "auth_refresh", "auth_reconfirmed", "load_restart", "load_timeout", "auto_retry", "lapse"].includes(sample.event) ? sample.event : "expire";
  const state = ["idle", "pending", "valid", "expired", "stopped"].includes(sample.state) ? sample.state : "expired";
  const reason = sample.reason && ["error", "offline", "timeout", "ineligible"].includes(sample.reason) ? sample.reason : null;
  const record: AuthzDiagnostic = { event, state, reason, visible: sample.visible === true, online: sample.online === true,
    rttMs: number(sample.rttMs), leaseRemainingMs: number(sample.leaseRemainingMs), requestRemainingMs: number(sample.requestRemainingMs) };
  records.push(record);
  if (records.length > 80) records.shift();
  // Only real allowlisted expiry events; telemetry remains local and cannot affect authority.
  if (sample.event === "expire" || sample.event === "lapse") {
    try { console.warn("cultivo-authz-expire", JSON.stringify(record)); } catch { /* observer failure must not affect expiry */ }
  } else if (sample.event === "auth_refresh" || sample.event === "auth_reconfirmed") {
    try { console.info("cultivo-authz-renewal", JSON.stringify(record)); } catch { /* observer failure must not affect reconfirmation */ }
  } else if (sample.event === "load_restart" || sample.event === "load_timeout" || sample.event === "auto_retry") {
    // Profile/roles loader lifecycle: elapsed ms only (rttMs); no identity.
    try { console.info("cultivo-authz-load", JSON.stringify(record)); } catch { /* observer failure must not affect loading */ }
  }
}
export const readAuthzDiagnostics = (): AuthzDiagnostic[] => records.map(record => ({ ...record }));
export const clearAuthzDiagnostics = (): void => { records.length = 0; };
// Manual ring read plus sanitized expire warning; no persistence or network delivery.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "cultivoAuthzDiagnostics", { configurable: true, value: readAuthzDiagnostics });
}