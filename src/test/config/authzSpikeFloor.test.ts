// Reproduces the real 2026-10-21 15:20:25Z adminB expiry (rtt 10430, leaseRemaining -3)
// with the real monitor, fake timers/clock. Not browser/JWT proof. Against the
// 10 s floor baseline the 10.43/10.5/11.5 s spike cases MUST fail.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthzEpochMonitor, EARLY_RENEWAL_FLOOR_MARGIN_MS, type AuthzFingerprintResult } from '@/lib/authz/authzEpochMonitor';

type R = AuthzFingerprintResult;
function setup(o: { lagMs?: number; random?: number } = {}) {
  let rtt = 1500; let respond: () => R = () => ({ eligible: true, fingerprint: 'fp' });
  let inFlight = 0, maxInFlight = 0; const starts: number[] = [];
  const fetcher = vi.fn(() => { starts.push(Date.now()); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    const ms = rtt; const r = respond;
    return new Promise<R>(res => setTimeout(() => { inFlight--; res(r()); }, ms)); });
  const onExpire = vi.fn(), onEpochChange = vi.fn();
  const lag = o.lagMs ?? 0;
  const m = createAuthzEpochMonitor({ fetcher, now: () => Date.now(), isOnline: () => true, isVisible: () => true,
    pollWhenHidden: true, renewBeforeDeadline: true, random: () => o.random ?? 0,
    setTimeoutFn: (cb, ms) => setTimeout(cb, ms + lag), clearTimeoutFn: h => clearTimeout(h as ReturnType<typeof setTimeout>),
    onExpire, onEpochChange });
  return { m, fetcher, starts, onExpire, onEpochChange, maxInFlight: () => maxInFlight,
    setRtt: (v: number) => { rtt = v; }, setRespond: (f: () => R) => { respond = f; } };
}
const step = (ms: number) => vi.advanceTimersByTimeAsync(ms);
async function spike(prevRtt: number, peak: number, random = 0) {
  const s = setup({ random }); s.setRtt(prevRtt); s.m.start(); await step(prevRtt);
  for (let i = 0; i < 3; i++) { const n = s.starts.length; while (s.starts.length === n) await step(50); await step(prevRtt); }
  s.setRtt(peak); const n = s.starts.length; while (s.starts.length === n) await step(50);
  s.setRtt(prevRtt);
  for (let t = 0; t < 30_000; t += 100) { await step(100); if (!s.m.checkAccess()) break; }
  return s;
}
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
afterEach(() => vi.useRealTimers());

describe('spike floor 12 s (real 10.43 s expiry)', () => {
  it('floor is 12 s', () => expect(EARLY_RENEWAL_FLOOR_MARGIN_MS).toBe(12_000));
  it.each([10_430, 10_500, 11_500, 11_900])('fast samples (1.5 s) -> isolated %i ms spike keeps access', async peak => {
    const s = await spike(1500, peak);
    expect(s.onExpire).not.toHaveBeenCalled(); expect(s.m.checkAccess()).toBe(true); expect(s.maxInFlight()).toBe(1);
  });
  it('3 s samples -> 10.5 s spike keeps access', async () => {
    const s = await spike(3000, 10_500); expect(s.onExpire).not.toHaveBeenCalled();
  });
  it('explicit limit: 3 s samples -> 11.5 s spike pauses fail-closed (headroom 15-3-1 = 11 s)', async () => {
    const s = await spike(3000, 11_500); expect(s.onExpire).toHaveBeenCalledWith('timeout'); expect(s.m.checkAccess()).toBe(false);
  });
  it('explicit limit: 12 s spike always pauses and late answer never revives', async () => {
    const s = await spike(1000, 12_500); expect(s.onExpire).toHaveBeenCalledWith('timeout');
    await step(20_000); expect(s.m.state()).toBe('expired'); expect(s.m.checkAccess()).toBe(false);
  });
  it('sustained 10.5 s RTT pauses fail-closed (no lease growth)', async () => {
    const s = setup(); s.m.start(); await step(1500); s.setRtt(10_500); await step(60_000);
    expect(s.onExpire).toHaveBeenCalledWith('timeout'); expect(s.m.checkAccess()).toBe(false);
  });
  it('every grant stays <= 15 s from its own request start and no overlap', async () => {
    const s = setup(); s.m.start(); await step(1500);
    for (let t = 0; t < 120_000; t += 100) { await step(100); expect(s.m.checkAccess()).toBe(true); }
    expect(s.maxInFlight()).toBe(1);
    const last = s.starts[s.starts.length - 1];
    vi.setSystemTime(last + 15_000); expect(s.m.checkAccess()).toBe(false);
  });
  it('load bound: 1.5 s RTT -> >= 3 s between requests (<= 5 / 15 s per tab)', async () => {
    const s = setup(); s.m.start(); await step(1500); await step(300_000);
    const gaps = s.starts.slice(1).map((t, i) => t - s.starts[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(2999);
  });
  it('suspended timers (20 s lag) never extend access past monotonic deadline', async () => {
    const s = setup({ lagMs: 20_000 }); s.m.start(); await step(1500);
    await step(13_499); expect(s.m.checkAccess()).toBe(true);
    await step(1); expect(s.m.checkAccess()).toBe(false);
  });
  it('revocation during a spike expires as ineligible and stays closed', async () => {
    const s = setup(); s.m.start(); await step(1500); s.setRtt(10_500);
    s.setRespond(() => ({ eligible: false, fingerprint: null }));
    const n = s.starts.length; while (s.starts.length === n) await step(50); await step(10_500);
    expect(s.onExpire).toHaveBeenCalledWith('ineligible');
    s.setRespond(() => ({ eligible: true, fingerprint: 'fp' })); await step(30_000); expect(s.m.state()).toBe('expired');
  });
  it('server boundary still caps the grant below the local lease', async () => {
    const s = setup(); s.setRespond(() => ({ eligible: true, fingerprint: 'fp', server_remaining_ms: 4000 }));
    s.m.start(); await step(1500); expect(s.m.checkAccess()).toBe(true);
    vi.setSystemTime(4000); expect(s.m.checkAccess()).toBe(false);
  });
});
