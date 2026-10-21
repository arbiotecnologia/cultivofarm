// Lease lapse while the single renewal request is still in its own 15 s window.
// Real monitor source, fake timers/clock. Not a browser-suspension or hosted JWT/RLS proof.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthzEpochMonitor, type AuthzFingerprintResult } from '@/lib/authz/authzEpochMonitor';

type R = AuthzFingerprintResult;
function setup(o: { renew?: boolean; timerLagMs?: number } = {}) {
  let rtt = 3000; let respond: () => R = () => ({ eligible: true, fingerprint: 'fp' });
  let inFlight = 0, maxInFlight = 0; const diags: string[] = [];
  const fetcher = vi.fn(() => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    const ms = rtt;
    return new Promise<R>(res => setTimeout(() => { inFlight--; res(respond()); }, ms)); });
  const onExpire = vi.fn(), onStateChange = vi.fn(), onEpochChange = vi.fn();
  const lag = o.timerLagMs ?? 0; // emulates hidden-tab timer throttling (late callbacks)
  const m = createAuthzEpochMonitor({ fetcher, now: () => Date.now(), isOnline: () => true, isVisible: () => false,
    pollWhenHidden: true, renewBeforeDeadline: o.renew ?? true, random: () => 0,
    setTimeoutFn: (cb, ms) => setTimeout(cb, ms + lag), clearTimeoutFn: h => clearTimeout(h as ReturnType<typeof setTimeout>),
    onExpire, onStateChange, onEpochChange, onDiagnostic: d => diags.push(d.event) });
  return { m, fetcher, onExpire, onStateChange, onEpochChange, diags, maxInFlight: () => maxInFlight,
    setRtt: (v: number) => { rtt = v; }, setRespond: (f: () => R) => { respond = f; } };
}
const step = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
afterEach(() => vi.useRealTimers());

// t=0 start (3 s) → valid until 15 000; next request at 7 500 (margin 7.5 s); deadline stays 15 000.
async function toSpike(s: ReturnType<typeof setup>, rtt: number) {
  s.m.start(); await step(3000); expect(s.m.checkAccess()).toBe(true);
  s.setRtt(rtt); await step(4500); expect(s.fetcher).toHaveBeenCalledTimes(2);
}

describe('lease lapse keeps the single in-window renewal (reviewed scope)', () => {
  it('3 s RTT: no lapse, no pause, one request at a time', async () => {
    const s = setup(); s.m.start();
    for (let t = 0; t < 120_000; t += 100) { await step(100); if (t >= 3000) expect(s.m.checkAccess()).toBe(true); }
    expect(s.onExpire).not.toHaveBeenCalled(); expect(s.diags).not.toContain('lapse'); expect(s.maxInFlight()).toBe(1);
  });
  it('8 s RTT: hides at the confirmed deadline, accepts the same answer before its own 15 s, no expire/auto_retry', async () => {
    const s = setup(); await toSpike(s, 8000);
    await step(7499); expect(s.m.checkAccess()).toBe(true);           // t=14 999
    await step(1); expect(s.m.checkAccess()).toBe(false);             // t=15 000 deadline: hidden
    expect(s.m.state()).toBe('pending'); expect(s.diags).toContain('lapse');
    await step(500); expect(s.m.state()).toBe('valid');               // t=15 500 answer (request start 7 500)
    expect(s.m.checkAccess()).toBe(true);
    await step(6_999); expect(s.m.checkAccess()).toBe(true);           // lease from request start: 22 500
    expect(s.onExpire).not.toHaveBeenCalled(); expect(s.maxInFlight()).toBe(1); // next renewal may start; never overlapping
  });
  it('17 s RTT (> lease): fails closed at request start + 15 s and late answer never revives', async () => {
    const s = setup(); await toSpike(s, 17_000);
    await step(7500); expect(s.m.checkAccess()).toBe(false);
    await step(7499); expect(s.onExpire).not.toHaveBeenCalled();
    await step(1); expect(s.onExpire).toHaveBeenCalledWith('timeout'); expect(s.m.state()).toBe('expired');
    await step(3000); expect(s.m.state()).toBe('expired'); expect(s.m.checkAccess()).toBe(false);
  });
  it('partial revocation answered after lapse expires as ineligible (no grant)', async () => {
    const s = setup(); await toSpike(s, 8000);
    s.setRespond(() => ({ eligible: false, fingerprint: null }));
    await step(8000);
    expect(s.onExpire).toHaveBeenCalledWith('ineligible'); expect(s.m.checkAccess()).toBe(false);
  });
  it('fingerprint change answered after lapse notifies epoch change once', async () => {
    const s = setup(); await toSpike(s, 8000);
    s.setRespond(() => ({ eligible: true, fingerprint: 'other' }));
    await step(8000); expect(s.onEpochChange).toHaveBeenCalledTimes(1);
  });
  it('hidden/resume: environment signal after lapse coalesces into the same request', async () => {
    const s = setup(); await toSpike(s, 8000);
    await step(7600); s.m.revalidateEnvironment();
    expect(s.fetcher).toHaveBeenCalledTimes(2); expect(s.m.checkAccess()).toBe(false);
    await step(400); expect(s.m.checkAccess()).toBe(true); expect(s.onExpire).not.toHaveBeenCalled();
  });
  it('throttled hidden timers (late callbacks) never extend access past the deadline', async () => {
    const s = setup({ timerLagMs: 1000 }); s.m.start(); await step(3000); s.setRtt(8000);
    for (let t = 3000; t < 15_000; t += 100) await step(100);
    expect(s.m.checkAccess()).toBe(false); // pure clock check, independent of the late timer
  });
  it('unreviewed scope keeps published behavior: lapse expires immediately', async () => {
    const s = setup({ renew: false }); s.m.start(); await step(3000); s.setRtt(8000);
    await step(12_000); await step(8000);
    expect(s.onExpire).toHaveBeenCalledWith('timeout'); expect(s.diags).not.toContain('lapse');
  });
  it('stop during lapse discards the late answer', async () => {
    const s = setup(); await toSpike(s, 8000); await step(7600); s.m.stop();
    await step(1000); expect(s.m.state()).toBe('stopped'); expect(s.m.checkAccess()).toBe(false);
  });
});
