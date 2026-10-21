// Early-renewal floor margin (10 s). Real monitor source, fake timers/clock.
// Not a browser-suspension or hosted JWT/RLS proof. Absolute timings on purpose:
// the same file run against the 7.5 s baseline must fail the isolated 8 s spike.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthzEpochMonitor, type AuthzFingerprintResult } from '@/lib/authz/authzEpochMonitor';

type R = AuthzFingerprintResult;
function setup(o: { lagMs?: number; visible?: () => boolean } = {}) {
  let rtt = 3000; let respond: () => R = () => ({ eligible: true, fingerprint: 'fp' });
  let inFlight = 0, maxInFlight = 0; const starts: number[] = [];
  const fetcher = vi.fn(() => { starts.push(Date.now()); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    const ms = rtt; const r = respond;
    return new Promise<R>(res => setTimeout(() => { inFlight--; res(r()); }, ms)); });
  const onExpire = vi.fn(), onEpochChange = vi.fn();
  const lag = o.lagMs ?? 0; // hidden-tab throttling: callbacks fire late
  const m = createAuthzEpochMonitor({ fetcher, now: () => Date.now(), isOnline: () => true, isVisible: o.visible ?? (() => false),
    pollWhenHidden: true, renewBeforeDeadline: true, random: () => 0,
    setTimeoutFn: (cb, ms) => setTimeout(cb, ms + lag), clearTimeoutFn: h => clearTimeout(h as ReturnType<typeof setTimeout>),
    onExpire, onEpochChange });
  return { m, fetcher, starts, onExpire, onEpochChange, maxInFlight: () => maxInFlight,
    setRtt: (v: number) => { rtt = v; }, setRespond: (f: () => R) => { respond = f; } };
}
const step = (ms: number) => vi.advanceTimersByTimeAsync(ms);
async function hold(s: ReturnType<typeof setup>, ms: number) {
  for (let t = 0; t < ms; t += 100) { await step(100); expect(s.m.checkAccess()).toBe(true); }
}
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
afterEach(() => vi.useRealTimers());

describe('renewal floor margin 10 s', () => {
  it('sustained 3 s RTT: never pauses for 10 min, ~5 s cadence, no overlap', async () => {
    const s = setup(); s.m.start(); await step(3000);
    await hold(s, 600_000);
    expect(s.onExpire).not.toHaveBeenCalled(); expect(s.maxInFlight()).toBe(1);
    const gaps = s.starts.slice(1).map((t, i) => t - s.starts[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(4000); // bounded load: ≤ ~1 request / 5 s
    expect(s.fetcher.mock.calls.length).toBeLessThanOrEqual(600_000 / 4000 + 2);
  });
  it('isolated 8 s spike after fast RTT keeps access (baseline 7.5 s expires here)', async () => {
    const s = setup(); s.m.start(); await step(3000);
    s.setRtt(8000);
    while (s.starts.length < 2) await step(100);
    s.setRtt(3000);
    await hold(s, 30_000);
    expect(s.onExpire).not.toHaveBeenCalled(); expect(s.maxInFlight()).toBe(1);
  });
  it('consecutive 8 s RTT blocks fail-closed and never reopens with late answers', async () => {
    const s = setup(); s.m.start(); await step(3000); s.setRtt(8000);
    await step(40_000);
    expect(s.onExpire).toHaveBeenCalledWith('timeout'); expect(s.m.checkAccess()).toBe(false);
    await step(30_000); expect(s.m.checkAccess()).toBe(false); expect(s.m.state()).toBe('expired');
  });
  it('17 s RTT blocks at the confirmed deadline; answer after it never revives', async () => {
    const s = setup(); s.m.start(); await step(3000); s.setRtt(17_000);
    await step(12_000); // t = 15 000 = first confirmed deadline
    expect(s.m.checkAccess()).toBe(false); expect(s.onExpire).toHaveBeenCalledWith('timeout');
    await step(20_000); expect(s.m.checkAccess()).toBe(false); expect(s.onEpochChange).not.toHaveBeenCalled();
  });
  it('late hidden-tab timers never extend access past the monotonic deadline', async () => {
    const s = setup({ lagMs: 20_000 }); s.m.start(); await step(3000);
    await step(11_999); expect(s.m.checkAccess()).toBe(true);
    await step(1); expect(s.m.checkAccess()).toBe(false); // t=15 000 although no timer fired
  });
  it('return to visibility coalesces with the in-flight renewal (no overlap)', async () => {
    let visible = false; const s = setup({ visible: () => visible }); s.m.start(); await step(3000);
    s.setRtt(6000); while (s.starts.length < 2) await step(100);
    visible = true; s.m.revalidateEnvironment(); s.m.revalidateEnvironment();
    expect(s.fetcher).toHaveBeenCalledTimes(2); expect(s.maxInFlight()).toBe(1);
    await step(6000); expect(s.m.checkAccess()).toBe(true); expect(s.onExpire).not.toHaveBeenCalled();
  });
  it('revocation during an 8 s spike blocks as ineligible and the next valid answer is not adopted silently', async () => {
    const s = setup(); s.m.start(); await step(3000); s.setRtt(8000);
    s.setRespond(() => ({ eligible: false, fingerprint: null }));
    while (s.starts.length < 2) await step(100);
    await step(8000);
    expect(s.onExpire).toHaveBeenCalledWith('ineligible'); expect(s.m.checkAccess()).toBe(false);
    s.setRespond(() => ({ eligible: true, fingerprint: 'fp' })); await step(30_000);
    expect(s.m.state()).toBe('expired'); // only an explicit canonical revalidation can reopen
  });
});
