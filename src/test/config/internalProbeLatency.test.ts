// Real monitor + real internalContextProbe (current and d767eb23 baseline) with fake
// per-call transport latency and fake clock. Not browser-suspension nor JWT/RLS proof.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({
  perCall: 100, roles: ['gestor', 'consultor_tecnico'] as string[], org: '00000000-0000-4000-8000-000000000002',
  hasRole: true, fail: '' as string, calls: [] as string[], depth: 0, maxDepth: 0, rolesAfterFirstRead: undefined as string[] | undefined, roleReads: 0,
}));
const delayed = <T,>(name: string, value: () => T) => {
  s.calls.push(name); s.depth++; s.maxDepth = Math.max(s.maxDepth, s.depth);
  return new Promise<T>(r => setTimeout(() => { s.depth--; r(value()); }, s.perCall));
};
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    for (const n of ['select', 'eq']) q[n] = () => q;
    const run = () => delayed(t, () => {
      if (t === 'profiles') return { data: { user_id: U, organization_id: s.org, ativo: true, senha_provisoria: false }, error: s.fail === 'profiles' ? {} : null };
      s.roleReads++;
      const roles = s.roleReads > 1 && s.rolesAfterFirstRead ? s.rolesAfterFirstRead : s.roles;
      return { data: roles.map(role => ({ role })), error: s.fail === 'roles' ? {} : null };
    });
    q.maybeSingle = run; q.then = (f: (v: unknown) => unknown, rj?: (e: unknown) => unknown) => run().then(f, rj);
    return q;
  },
  rpc: (name: string) => delayed(name, () => name === 'has_role'
    ? { data: s.hasRole, error: s.fail === 'has_role' ? {} : null }
    : { data: s.org, error: s.fail === 'h15' ? {} : null }),
} }));
const U = '00000000-0000-4000-8000-000000000001';
import { createAuthzEpochMonitor } from '@/lib/authz/authzEpochMonitor';
import { internalContextProbe, MANAGER_CONSULTANT_ROLES } from '@/lib/authz/internalContextProbe';
import { internalContextProbe as baselineProbe } from '../../../scripts/monitor-retry-reresolve/baseline/src/lib/authz/internalContextProbe';

function run(probe: typeof internalContextProbe) {
  const onExpire = vi.fn();
  const fetcher = vi.fn(() => probe(U, s.org, MANAGER_CONSULTANT_ROLES));
  const monitor = createAuthzEpochMonitor({
    fetcher, now: () => Date.now(), isOnline: () => true, isVisible: () => true, pollWhenHidden: true, renewBeforeDeadline: true,
    random: () => 0, setTimeoutFn: (cb, ms) => setTimeout(cb, ms), clearTimeoutFn: h => clearTimeout(h as ReturnType<typeof setTimeout>),
    onExpire, onEpochChange: vi.fn(), onStateChange: vi.fn(),
  });
  monitor.start();
  return { monitor, onExpire, fetcher };
}
beforeEach(() => { vi.useFakeTimers(); s.perCall = 100; s.roles = ['gestor', 'consultor_tecnico']; s.hasRole = true; s.fail = ''; s.calls = []; s.depth = 0; s.maxDepth = 0; s.rolesAfterFirstRead = undefined; s.roleReads = 0; });
afterEach(() => vi.useRealTimers());

describe('probe round trips', () => {
  it('pair costs 2 sequential RTTs (baseline 6): 1290 ms/call ≈ 2.6 s instead of the observed 7.74 s', async () => {
    s.perCall = 1290;
    const t0 = Date.now(); let t1 = 0;
    const p = internalContextProbe(U, s.org, MANAGER_CONSULTANT_ROLES).then(v => { t1 = Date.now(); return v; });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toMatchObject({ eligible: true });
    expect(t1 - t0).toBe(2580);
    const b0 = Date.now(); let b1 = 0;
    const b = baselineProbe(U, s.org, MANAGER_CONSULTANT_ROLES).then(v => { b1 = Date.now(); return v; });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(b).resolves.toMatchObject({ eligible: true });
    expect(b1 - b0).toBe(7740);
  });
  it('has_role never runs before the exact set matched', async () => {
    s.roles = ['gestor'];
    const p = internalContextProbe(U, s.org, MANAGER_CONSULTANT_ROLES); await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toEqual({ eligible: false, fingerprint: null });
    expect(s.calls).not.toContain('has_role');
  });
  it.each([
    ['role removed while wave 1 was in flight', () => { s.rolesAfterFirstRead = ['gestor']; }],
    ['role gained while wave 1 was in flight', () => { s.rolesAfterFirstRead = ['gestor', 'consultor_tecnico', 'administrador']; }],
    ['has_role denies', () => { s.hasRole = false; }],
  ])('%s denies', async (_n, arrange) => {
    arrange();
    const p = internalContextProbe(U, s.org, MANAGER_CONSULTANT_ROLES); await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toEqual({ eligible: false, fingerprint: null });
  });
  it.each(['profiles', 'roles', 'has_role', 'h15'])('transport error %s fails closed', async fail => {
    s.fail = fail;
    const p = internalContextProbe(U, s.org, MANAGER_CONSULTANT_ROLES);
    const settled = p.catch(e => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(String(await settled)).toContain('internal_probe_unavailable');
  });
});

describe('monitor stability with the real probe', () => {
  it('reproduces the real failure on the baseline: low RTT then 1290 ms/call (7.74 s) expires', async () => {
    const { onExpire } = run(baselineProbe);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onExpire).not.toHaveBeenCalled();
    s.perCall = 1290;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onExpire).toHaveBeenCalled();
  });
  it('current probe: same transition stays valid over 10 min of prolonged cycles, lease unchanged', async () => {
    const { monitor, onExpire, fetcher } = run(internalContextProbe);
    await vi.advanceTimersByTimeAsync(60_000);
    s.perCall = 1290;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(monitor.checkAccess()).toBe(true);
    expect(fetcher.mock.calls.length).toBeLessThan(600_000 / 1000); // bounded cadence
  });
  it('negative: 4 s per call (8 s probe) still expires; late answer never revives', async () => {
    const { monitor, onExpire } = run(internalContextProbe);
    await vi.advanceTimersByTimeAsync(30_000);
    s.perCall = 4000;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onExpire).toHaveBeenCalled();
    expect(monitor.checkAccess()).toBe(false);
  });
});
