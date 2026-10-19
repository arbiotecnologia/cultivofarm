import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthzEpochMonitor } from "@/lib/authz/authzEpochMonitor";
import { clearAuthzDiagnostics, readAuthzDiagnostics, recordAuthzDiagnostic, type AuthzDiagnostic } from "@/lib/authz/localDiagnostics";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); clearAuthzDiagnostics(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); clearAuthzDiagnostics(); vi.restoreAllMocks(); });
describe("local admin monitor diagnostics — synthetic timing, not live cause attribution", () => {
  it("warns only expiry with reconstructed allowlist, never tokens or arbitrary event input", () => {
    const value = { event: "expire", state: "valid", reason: "timeout", visible: false, online: true,
      rttMs: 3000, leaseRemainingMs: -25000, requestRemainingMs: -24000,
      token: "SECRET", url: "https://private.example", fingerprint: "SECRET", user_id: "SECRET" };
    recordAuthzDiagnostic(value as AuthzDiagnostic);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("cultivo-authz-expire", {
      event: "expire", state: "valid", reason: "timeout", visible: false, online: true,
      rttMs: 3000, leaseRemainingMs: -25000, requestRemainingMs: -24000,
    });
    for (const event of ["response", "request", "environment", "stale", "attacker"]) recordAuthzDiagnostic({ ...value, event } as AuthzDiagnostic);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/SECRET|https:/);
  });
  it("console failure does not escape the diagnostic callback", () => {
    vi.mocked(console.warn).mockImplementation(() => { throw new Error("unavailable"); });
    expect(() => recordAuthzDiagnostic({ event: "expire", state: "expired", reason: "offline", visible: true, online: false,
      rttMs: null, leaseRemainingMs: 0, requestRemainingMs: null })).not.toThrow();
    expect(readAuthzDiagnostics()).toHaveLength(1);
  });
  it("RTT3s over90s preserves15s authority and emits only bounded nonidentity metrics", async () => {
    const expire = vi.fn();
    const monitor = createAuthzEpochMonitor({
      fetcher: () => new Promise(resolve => setTimeout(() => resolve({ eligible: true, fingerprint: "PRIVATE-ID-NEVER-LOG" }), 3000)),
      now: () => Date.now(), isVisible: () => false, isOnline: () => true,
      pollWhenHidden: true, renewBeforeDeadline: true, random: () => 0,
      setTimeoutFn: (cb, ms) => setTimeout(cb, ms), clearTimeoutFn: h => clearTimeout(h as ReturnType<typeof setTimeout>),
      onExpire: expire, onEpochChange: vi.fn(), onDiagnostic: recordAuthzDiagnostic,
    });
    monitor.start(); await vi.advanceTimersByTimeAsync(3000);
    for (let t = 0; t < 90000; t += 100) { await vi.advanceTimersByTimeAsync(100); expect(monitor.checkAccess()).toBe(true); }
    expect(expire).not.toHaveBeenCalled();
    const records = readAuthzDiagnostics();
    expect(records.some(r => r.event === "response" && r.rttMs === 3000)).toBe(true);
    expect(JSON.stringify(records)).not.toContain("PRIVATE-ID");
    expect(records.every(r => r.leaseRemainingMs === null || r.leaseRemainingMs <= 15000)).toBe(true);
    monitor.stop();
  });

  it("suspended tab reports negative lease delta before resume, rejects old result and requires fresh confirmation", async () => {
    let clock = 0; let answer: ((v: { eligible: boolean; fingerprint: string }) => void) | undefined;
    const fetcher = vi.fn().mockResolvedValueOnce({ eligible: true, fingerprint: "same" })
      .mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }))
      .mockResolvedValueOnce({ eligible: true, fingerprint: "same" });
    const monitor = createAuthzEpochMonitor({ fetcher, now: () => clock, isVisible: () => false, isOnline: () => true,
      setTimeoutFn: (cb, ms) => setTimeout(cb, ms), clearTimeoutFn: h => clearTimeout(h as ReturnType<typeof setTimeout>),
      onExpire: vi.fn(), onEpochChange: vi.fn(), onDiagnostic: recordAuthzDiagnostic });
    monitor.start(); await vi.advanceTimersByTimeAsync(0);
    clock = 1000; monitor.revalidateEnvironment();
    clock = 40000; expect(monitor.checkAccess()).toBe(false); monitor.revalidateEnvironment();
    const expired = readAuthzDiagnostics().find(r => r.event === "expire");
    expect(expired).toMatchObject({ reason: "timeout", visible: false, rttMs: 39000, leaseRemainingMs: -25000, requestRemainingMs: -24000 });
    answer?.({ eligible: true, fingerprint: "stale" }); await vi.advanceTimersByTimeAsync(0);
    expect(monitor.currentFingerprint()).toBe("same");
    expect(readAuthzDiagnostics().some(r => r.event === "stale")).toBe(true); monitor.stop();
  });

  it("observer exceptions cannot change expiry or extend authority", async () => {
    let clock = 0;
    const monitor = createAuthzEpochMonitor({ fetcher: async () => ({ eligible: true, fingerprint: "same" }),
      now: () => clock, isVisible: () => true, isOnline: () => true,
      setTimeoutFn: (cb, ms) => setTimeout(cb, ms), clearTimeoutFn: h => clearTimeout(h as ReturnType<typeof setTimeout>),
      onExpire: vi.fn(), onEpochChange: vi.fn(), onDiagnostic: () => { throw new Error("observer"); } });
    monitor.start(); await vi.advanceTimersByTimeAsync(0); expect(monitor.checkAccess()).toBe(true);
    clock = 15000; expect(monitor.checkAccess()).toBe(false); monitor.expireNow("offline"); expect(monitor.state()).toBe("expired");
    monitor.stop();
  });

  it("allowlist drops arbitrary strings/tokens and ring stays80 records with defensive copies", () => {
    const value = { event: "expire", state: "expired", reason: "timeout", visible: false, online: true,
      rttMs: 3000, leaseRemainingMs: -2, requestRemainingMs: 4, token: "SECRET", fingerprint: "SECRET" };
    for (let i = 0; i < 100; i++) recordAuthzDiagnostic(value as AuthzDiagnostic);
    const records = readAuthzDiagnostics(); expect(records).toHaveLength(80); expect(JSON.stringify(records)).not.toContain("SECRET");
    records[0].rttMs = 999; expect(readAuthzDiagnostics()[0].rttMs).toBe(3000);
    clearAuthzDiagnostics(); expect(readAuthzDiagnostics()).toEqual([]);
  });
});