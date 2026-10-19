// Paired-scope early renewal: real monitor source with fake timers/clock.
// Not a browser-suspension or hosted JWT/RLS proof.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAuthzEpochMonitor,
  EARLY_RENEWAL_FLOOR_MARGIN_MS,
  EARLY_RENEWAL_MIN_DELAY_MS,
  type AuthzFingerprintResult,
} from '@/lib/authz/authzEpochMonitor';

const valid = (fingerprint = 'same', server_remaining_ms?: number): AuthzFingerprintResult =>
  server_remaining_ms === undefined ? { eligible: true, fingerprint } : { eligible: true, fingerprint, server_remaining_ms };

type Respond = () => AuthzFingerprintResult | Promise<AuthzFingerprintResult>;

function setup(opts: { renew?: boolean; rtt?: () => number; respond?: Respond; random?: () => number } = {}) {
  let online = true;
  const starts: number[] = [];
  let respond: Respond = opts.respond ?? (() => valid());
  let rtt = opts.rtt ?? (() => 3000);
  let inFlight = 0;
  let maxInFlight = 0;
  const fetcher = vi.fn(() => {
    starts.push(Date.now());
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise<AuthzFingerprintResult>((resolve, reject) => {
      setTimeout(() => {
        inFlight--;
        Promise.resolve().then(respond).then(resolve, reject);
      }, rtt());
    });
  });
  const onExpire = vi.fn(), onEpochChange = vi.fn(), onStateChange = vi.fn();
  const monitor = createAuthzEpochMonitor({
    fetcher, now: () => Date.now(), isOnline: () => online, isVisible: () => false, pollWhenHidden: true,
    renewBeforeDeadline: opts.renew ?? true, random: opts.random ?? (() => 0),
    setTimeoutFn: (cb, ms) => setTimeout(cb, ms), clearTimeoutFn: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    onExpire, onEpochChange, onStateChange,
  });
  return {
    monitor, fetcher, starts, onExpire, onEpochChange, onStateChange,
    maxInFlight: () => maxInFlight,
    setRespond: (r: Respond) => { respond = r; },
    setRtt: (r: () => number) => { rtt = r; },
    offline: () => { online = false; },
    states: () => onStateChange.mock.calls.map((c) => c[0]),
  };
}

/** Advance in 100 ms steps and assert access stays open at every sample. */
async function holdsAccessFor(s: ReturnType<typeof setup>, ms: number) {
  for (let t = 0; t < ms; t += 100) {
    await vi.advanceTimersByTimeAsync(100);
    expect(s.monitor.checkAccess()).toBe(true);
  }
}

function seeded(seed: number) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());

describe('paired early renewal before confirmed deadline', () => {
  it('reproduces the reviewed failure without early renewal: RTT 3s request at t13 answers t16 > deadline t15', async () => {
    const s = setup({ renew: false });
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(s.monitor.checkAccess()).toBe(true);
    await vi.advanceTimersByTimeAsync(12000);
    expect(s.starts).toEqual([0, 13000]);
    expect(s.monitor.state()).toBe('expired');
    expect(s.onExpire).toHaveBeenCalledWith('timeout');
  });

  it('constant RTT 3s for 120s: no pending/expired after first confirmation, no epoch, bounded cadence, one request at a time', async () => {
    const s = setup();
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(3000);
    await holdsAccessFor(s, 120000);
    expect(s.states()).toEqual(['pending', 'valid']);
    expect(s.onEpochChange).not.toHaveBeenCalled();
    expect(s.onExpire).not.toHaveBeenCalled();
    expect(s.maxInFlight()).toBe(1);
    // response t3 => deadline t15; next request t7.5 (floor margin 7.5s > 2*RTT=6s), steady 7.5s cadence.
    expect(s.starts.slice(0, 4)).toEqual([0, 7500, 15000, 22500]);
    for (let i = 1; i < s.starts.length; i++) expect(s.starts[i] - s.starts[i - 1]).toBeGreaterThanOrEqual(EARLY_RENEWAL_MIN_DELAY_MS + 3000);
    expect(s.fetcher.mock.calls.length).toBeLessThanOrEqual(18);
  });

  it('variable RTT 0.1–4.5s with jitter for 120s keeps access, single flight and gap >= MIN_DELAY after each answer', async () => {
    const rnd = seeded(42);
    const s = setup({ rtt: () => 100 + Math.floor(rnd() * 4400), random: seeded(7) });
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(4500);
    expect(s.monitor.state()).toBe('valid');
    await holdsAccessFor(s, 120000);
    expect(s.states()).toEqual(['pending', 'valid']);
    expect(s.maxInFlight()).toBe(1);
    for (let i = 1; i < s.starts.length; i++) expect(s.starts[i] - s.starts[i - 1]).toBeGreaterThan(EARLY_RENEWAL_MIN_DELAY_MS);
  });

  it('lease never exceeds 15s from the last confirmed request start; hung request closes exactly there', async () => {
    const s = setup();
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(3000);
    await holdsAccessFor(s, 30000);
    const confirmedStart = s.starts[s.starts.length - 1];
    s.setRtt(() => 60_000);
    // wait for the next (hung) request to start
    while (s.starts[s.starts.length - 1] === confirmedStart) await vi.advanceTimersByTimeAsync(100);
    const deadline = confirmedStart + 15000;
    await vi.advanceTimersByTimeAsync(deadline - 1 - Date.now());
    expect(s.monitor.checkAccess()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.monitor.checkAccess()).toBe(false);
    expect(s.onExpire).toHaveBeenCalledWith('timeout');
    await vi.advanceTimersByTimeAsync(60000);
    expect(s.monitor.checkAccess()).toBe(false);
  });

  it('response landing exactly at the confirmed deadline is rejected and cannot reopen', async () => {
    const s = setup();
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(3000); // deadline 15000, next request at 7500
    s.setRtt(() => 7500); s.setRespond(() => valid('late'));
    await vi.advanceTimersByTimeAsync(12000);
    expect(s.starts).toEqual([0, 7500]);
    expect(s.monitor.state()).toBe('expired');
    expect(s.monitor.currentFingerprint()).toBe('same');
    expect(s.onEpochChange).not.toHaveBeenCalled();
  });

  it('RTT too high for the lease (8s) fails closed instead of extending authority', async () => {
    const s = setup({ rtt: () => 8000 });
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(8000);
    expect(s.monitor.checkAccess()).toBe(true); // deadline 15000
    await vi.advanceTimersByTimeAsync(7000);
    expect(s.monitor.state()).toBe('expired');
    await vi.advanceTimersByTimeAsync(30000);
    expect(s.monitor.checkAccess()).toBe(false);
    expect(s.fetcher).toHaveBeenCalledTimes(2);
  });

  it('short server_remaining_ms never extends past the server boundary and never polls faster than MIN_DELAY', async () => {
    const s = setup({ rtt: () => 200, respond: () => valid('same', 2500) });
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(s.monitor.checkAccess()).toBe(true);
    await holdsAccessFor(s, 20000);
    for (let i = 1; i < s.starts.length; i++) expect(s.starts[i] - s.starts[i - 1]).toBeGreaterThanOrEqual(EARLY_RENEWAL_MIN_DELAY_MS + 200);
    expect(s.fetcher.mock.calls.length).toBeLessThanOrEqual(18);
    // stop answering: access closes at last start + (2500 - RTT) = start + 2300 at the latest
    const last = s.starts[s.starts.length - 1];
    s.setRtt(() => 60000);
    while (s.starts[s.starts.length - 1] === last) await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(Math.max(0, last + 2300 - Date.now()));
    expect(s.monitor.checkAccess()).toBe(false);
  });

  it.each(['error', 'ineligible', 'offline'])('%s during continuous RTT 3s expires immediately and late answers stay fenced', async (reason) => {
    const s = setup();
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(3000);
    await holdsAccessFor(s, 20000);
    if (reason === 'error') s.setRespond(() => { throw new Error('transport'); });
    if (reason === 'ineligible') s.setRespond(() => ({ eligible: false, fingerprint: null }));
    if (reason === 'offline') { s.offline(); s.monitor.expireNow('offline'); }
    await vi.advanceTimersByTimeAsync(12000);
    expect(s.monitor.state()).toBe('expired');
    expect(s.monitor.checkAccess()).toBe(false);
    s.setRespond(() => valid());
    await vi.advanceTimersByTimeAsync(30000);
    expect(s.monitor.checkAccess()).toBe(false);
  });

  it('role/fingerprint change during continuous RTT 3s notifies exactly one epoch', async () => {
    const s = setup();
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(3000);
    await holdsAccessFor(s, 20000);
    s.setRespond(() => valid('changed'));
    await vi.advanceTimersByTimeAsync(12000);
    expect(s.onEpochChange).toHaveBeenCalledTimes(1);
  });

  it('suspended clock: jump past deadline without timers expires on resume and stale answer cannot reopen', async () => {
    const s = setup();
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(3000);
    vi.setSystemTime(40000); // timers did not run (suspended)
    expect(s.monitor.checkAccess()).toBe(false);
    s.monitor.revalidateEnvironment();
    expect(s.onExpire).toHaveBeenCalledWith('timeout');
    expect(s.monitor.state()).toBe('pending');
    await vi.advanceTimersByTimeAsync(3000);
    expect(s.monitor.checkAccess()).toBe(true); // fresh confirmation only
    expect(s.monitor.currentFingerprint()).toBe('same');
  });

  it('focus/visibility during a scheduled renewal coalesce: no extra request, no pending, single flight', async () => {
    const s = setup();
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(4500); // request #2 starts at t7.5
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    s.monitor.revalidateEnvironment(); s.monitor.revalidateEnvironment(); s.monitor.revalidateEnvironment();
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    await holdsAccessFor(s, 3000);
    expect(s.states()).toEqual(['pending', 'valid']);
    // focus right after a confirmation starts one request; the old poll timer is replaced, not doubled
    s.monitor.revalidateEnvironment();
    expect(s.fetcher).toHaveBeenCalledTimes(3);
    await holdsAccessFor(s, 30000);
    expect(s.maxInFlight()).toBe(1);
    expect(s.states()).toEqual(['pending', 'valid']);
  });
});

describe('real homologation variation: fast RTT followed by a single 5.1–6s spike', () => {
  it('reserves at least the 7.5s floor before the confirmed deadline at every request', () => {
    expect(EARLY_RENEWAL_FLOOR_MARGIN_MS).toBe(7500);
  });

  it('old 5s floor reproduction (arithmetic of the real expire): 5094ms spike started 5087ms before deadline lands 7ms late', () => {
    // Observed: leaseRemainingMs -7 with rttMs 5094 => request started 5087ms before deadline.
    const headroomOld = 5000 + 87; // floor + jitter consumed earlier
    expect(5094 - headroomOld).toBe(7);
    expect(headroomOld).toBeLessThan(5094);
    expect(EARLY_RENEWAL_FLOOR_MARGIN_MS).toBeGreaterThan(5094);
  });

  it.each([5100, 5500, 6000, 7000])('fast 200ms samples then one %ims spike keeps access with single flight and no pending', async (spike) => {
    let n = 0;
    const s = setup({ rtt: () => (++n === 6 ? spike : 200), random: () => 0.999 });
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(200);
    await holdsAccessFor(s, 90000);
    expect(s.states()).toEqual(['pending', 'valid']);
    expect(s.onExpire).not.toHaveBeenCalled();
    expect(s.onEpochChange).not.toHaveBeenCalled();
    expect(s.maxInFlight()).toBe(1);
    // bounded cadence: never more than one request per MIN_DELAY + RTT, and far below 1/s
    for (let i = 1; i < s.starts.length; i++) expect(s.starts[i] - s.starts[i - 1]).toBeGreaterThanOrEqual(EARLY_RENEWAL_MIN_DELAY_MS + 200);
    expect(s.fetcher.mock.calls.length).toBeLessThanOrEqual(14);
  });

  it('every scheduled request starts with >= floor - jitter headroom before the confirmed deadline', async () => {
    const s = setup({ rtt: () => 200, random: () => 0.999 });
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(60000);
    for (let i = 1; i < s.starts.length; i++) {
      const deadline = s.starts[i - 1] + 15000;
      expect(deadline - s.starts[i]).toBeGreaterThanOrEqual(EARLY_RENEWAL_FLOOR_MARGIN_MS);
    }
  });

  it('spike above the floor (8s) after fast samples still fails closed at the 15s deadline and late answer cannot reopen', async () => {
    let n = 0;
    const s = setup({ rtt: () => (++n === 3 ? 8000 : 200) });
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(200);
    while (s.fetcher.mock.calls.length < 3) await vi.advanceTimersByTimeAsync(100);
    const confirmedStart = s.starts[1];
    await vi.advanceTimersByTimeAsync(confirmedStart + 15000 - 1 - Date.now());
    expect(s.monitor.checkAccess()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.monitor.checkAccess()).toBe(false);
    expect(s.onExpire).toHaveBeenCalledWith('timeout');
    await vi.advanceTimersByTimeAsync(10000);
    expect(s.monitor.checkAccess()).toBe(false);
    expect(s.monitor.state()).toBe('expired');
  });

  it('revocation (ineligible) during the 6s spike expires and does not reopen', async () => {
    let n = 0;
    const s = setup({ rtt: () => (++n === 3 ? 6000 : 200) });
    s.monitor.start();
    await vi.advanceTimersByTimeAsync(200);
    while (s.fetcher.mock.calls.length < 3) await vi.advanceTimersByTimeAsync(100);
    s.setRespond(() => ({ eligible: false, fingerprint: null }));
    await vi.advanceTimersByTimeAsync(6100);
    expect(s.onExpire).toHaveBeenCalledWith('ineligible');
    s.setRespond(() => valid());
    await vi.advanceTimersByTimeAsync(30000);
    expect(s.monitor.checkAccess()).toBe(false);
  });
});
