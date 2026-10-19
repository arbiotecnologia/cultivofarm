// Real monitor + real internalContextProbe (single-RTT candidate) and the published
// two-wave probe (d58c1730 baseline) with fake per-call transport latency and fake
// clock. Not browser suspension, not hosted JWT/RLS, not homologation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const U = '00000000-0000-4000-8000-000000000001';
const O = '00000000-0000-4000-8000-000000000002';
const s = vi.hoisted(() => ({
  perCall: 100, roles: ['gestor', 'consultor_tecnico'] as string[], org: '00000000-0000-4000-8000-000000000002' as string | null,
  profileOrg: undefined as string | undefined, active: true as unknown, provisional: false as unknown, confirmed: true as unknown,
  uidSeen: '00000000-0000-4000-8000-000000000001' as string | null, rpcMissing: false, payload: undefined as unknown,
  calls: [] as string[],
}));
const delayed = <T,>(name: string, value: () => T) => {
  s.calls.push(name);
  const v = value(); // snapshot at request arrival, delivered after the RTT (conservative)
  return new Promise<T>(r => setTimeout(() => r(v), s.perCall));
};
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    for (const n of ['select', 'eq']) q[n] = () => q;
    const run = () => delayed(t, () => t === 'profiles'
      ? { data: { user_id: U, organization_id: s.profileOrg ?? s.org, ativo: s.active, senha_provisoria: s.provisional }, error: null }
      : { data: s.roles.map(role => ({ role })), error: null });
    q.maybeSingle = run; q.then = (f: (v: unknown) => unknown, rj?: (e: unknown) => unknown) => run().then(f, rj);
    return q;
  },
  rpc: (name: string, args?: { _role: string }) => delayed(name, () => {
    if (name === 'internal_actor_context_v1') {
      if (s.rpcMissing) return { data: null, error: { code: 'PGRST202', message: 'not found' } };
      if (s.payload !== undefined) return { data: s.payload, error: null };
      if (s.uidSeen === null) return { data: null, error: null };
      return { data: {
        v: 1, user_id: s.uidSeen, organization_id: s.active === true && s.provisional === false ? s.org : null,
        profile: { user_id: s.uidSeen, organization_id: s.profileOrg ?? s.org, ativo: s.active, senha_provisoria: s.provisional },
        roles: [...s.roles].sort(), roles_confirmed: s.roles.length > 0 && s.confirmed === true && s.active === true,
      }, error: null };
    }
    if (name === 'has_role') return { data: s.roles.includes(args!._role), error: null };
    return { data: s.org, error: null };
  }),
} }));
import { createAuthzEpochMonitor } from '@/lib/authz/authzEpochMonitor';
import { evaluateInternalActorContext, internalContextProbe, INTERNAL_ACTOR_CONTEXT_RPC, MANAGER_CONSULTANT_ROLES } from '@/lib/authz/internalContextProbe';
import { internalContextProbe as twoWaveBaseline } from '../../../scripts/monitor-single-rtt-probe/baseline/src/lib/authz/internalContextProbe';

type Probe = typeof internalContextProbe;
function run(probe: Probe, expected: Parameters<Probe>[2] = MANAGER_CONSULTANT_ROLES) {
  const onExpire = vi.fn();
  const fetcher = vi.fn(() => probe(U, O, expected));
  const monitor = createAuthzEpochMonitor({
    fetcher, now: () => Date.now(), isOnline: () => true, isVisible: () => true, pollWhenHidden: true, renewBeforeDeadline: true,
    random: () => 0, setTimeoutFn: (cb, ms) => setTimeout(cb, ms), clearTimeoutFn: h => clearTimeout(h as ReturnType<typeof setTimeout>),
    onExpire, onEpochChange: vi.fn(), onStateChange: vi.fn(),
  });
  monitor.start();
  return { monitor, onExpire, fetcher };
}
async function settle<T>(p: Promise<T>, ms = 60_000): Promise<{ v?: T; e?: unknown }> { const r = p.then(v => ({ v }), (e: unknown) => ({ e })); await vi.advanceTimersByTimeAsync(ms); return r; }
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(s, { perCall: 100, roles: ['gestor', 'consultor_tecnico'], org: O, profileOrg: undefined, active: true, provisional: false, confirmed: true, uidSeen: U, rpcMissing: false, payload: undefined, calls: [] });
});
afterEach(() => vi.useRealTimers());

describe('single round trip', () => {
  it('one RPC per probe; no direct table reads, h15 or has_role from the client', async () => {
    const r = await settle(internalContextProbe(U, O, MANAGER_CONSULTANT_ROLES));
    expect(r).toEqual({ v: { eligible: true, fingerprint: JSON.stringify([U, O, ['consultor_tecnico', 'gestor']]) } });
    expect(s.calls).toEqual([INTERNAL_ACTOR_CONTEXT_RPC]);
  });
  it('observed 7.74–7.87 s two-wave probes (≈3.9 s/call) become one 3.9 s RTT', async () => {
    s.perCall = 3900;
    const t0 = Date.now(); let t1 = 0;
    await settle(internalContextProbe(U, O, MANAGER_CONSULTANT_ROLES).then(v => { t1 = Date.now(); return v; }));
    expect(t1 - t0).toBe(3900);
    const b0 = Date.now(); let b1 = 0;
    await settle(twoWaveBaseline(U, O, MANAGER_CONSULTANT_ROLES).then(v => { b1 = Date.now(); return v; }));
    expect(b1 - b0).toBe(7800);
  });
  it('RPC not installed (PGRST202) fails closed as unavailable, with NO fallback to the old reads', async () => {
    s.rpcMissing = true;
    const r = await settle(internalContextProbe(U, O, MANAGER_CONSULTANT_ROLES));
    expect(String(r.e)).toContain('internal_probe_unavailable');
    expect(s.calls).toEqual([INTERNAL_ACTOR_CONTEXT_RPC]);
  });
  it('RPC not installed: monitor expires with error and never renews', async () => {
    s.rpcMissing = true;
    const { monitor, onExpire } = run(internalContextProbe);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onExpire).toHaveBeenCalledWith('error');
    expect(monitor.checkAccess()).toBe(false);
    expect(s.calls.every(c => c === INTERNAL_ACTOR_CONTEXT_RPC)).toBe(true);
  });
  it.each([[null, O], ['', O], [U, 'org-invalida'], ['not-a-uuid', O]])('invalid identity/tenant %j/%j denies without any RPC', async (uid, org) => {
    expect(await internalContextProbe(uid as string, org, 'financeiro')).toEqual({ eligible: false, fingerprint: null });
    expect(s.calls).toEqual([]);
  });
});

describe('server answer decision (exact set, own identity, tenant, readiness)', () => {
  const pair = MANAGER_CONSULTANT_ROLES;
  it.each([
    ['pair expected, gestor removed', pair, ['consultor_tecnico']],
    ['pair expected, consultor removed', pair, ['gestor']],
    ['pair expected, superset', pair, ['administrador', 'consultor_tecnico', 'gestor']],
    ['pair expected, zero roles', pair, []],
    ['residual gestor expected, pair restored', 'gestor', ['consultor_tecnico', 'gestor']],
    ['residual consultor expected, other single role', 'consultor_tecnico', ['gestor']],
  ] as const)('%s denies', async (_n, expected, roles) => {
    s.roles = [...roles];
    expect((await settle(internalContextProbe(U, O, expected as never))).v).toEqual({ eligible: false, fingerprint: null });
  });
  it.each(['gestor', 'consultor_tecnico'] as const)('residual %s alone is eligible with a distinct fingerprint', async role => {
    s.roles = [role];
    expect((await settle(internalContextProbe(U, O, role))).v).toEqual({ eligible: true, fingerprint: JSON.stringify([U, O, [role]]) });
  });
  it.each([
    ['tenant changed (h15 reports other org)', () => { s.org = U; }],
    ['profile tenant differs', () => { s.profileOrg = U; }],
    ['inactive profile', () => { s.active = false; }],
    ['provisional password', () => { s.provisional = true; }],
    ['has_role not confirmed (stale JWT/readiness)', () => { s.confirmed = false; }],
    ['logout / no auth.uid() (NULL payload)', () => { s.uidSeen = null; }],
    ['other identity behind the token', () => { s.uidSeen = O; }],
    ['unknown version', () => { s.payload = { v: 2 }; }],
    ['array payload', () => { s.payload = []; }],
    ['roles not strings', () => { s.payload = { v: 1, user_id: U, organization_id: O, profile: { user_id: U, organization_id: O, ativo: true, senha_provisoria: false }, roles: [1, 2], roles_confirmed: true }; }],
    ['duplicated roles', () => { s.payload = { v: 1, user_id: U, organization_id: O, profile: { user_id: U, organization_id: O, ativo: true, senha_provisoria: false }, roles: ['gestor', 'gestor'], roles_confirmed: true }; }],
    ['"true" string flags', () => { s.payload = { v: 1, user_id: U, organization_id: O, profile: { user_id: U, organization_id: O, ativo: 'true', senha_provisoria: false }, roles: ['consultor_tecnico', 'gestor'], roles_confirmed: 'true' }; }],
  ])('%s denies', async (_n, arrange) => {
    arrange();
    expect((await settle(internalContextProbe(U, O, MANAGER_CONSULTANT_ROLES))).v).toEqual({ eligible: false, fingerprint: null });
  });
  it('caller mutation of the expected array after the call cannot change the decided authority', async () => {
    const expected = ['gestor', 'consultor_tecnico'];
    const p = internalContextProbe(U, O, expected as never);
    expected.push('administrador');
    expect((await settle(p)).v).toEqual({ eligible: true, fingerprint: JSON.stringify([U, O, ['consultor_tecnico', 'gestor']]) });
  });
  it('pure evaluator requires every field', () => {
    expect(evaluateInternalActorContext(null, U, O, ['financeiro'])).toBe(false);
    expect(evaluateInternalActorContext({ v: 1, user_id: U, organization_id: O, profile: null, roles: ['financeiro'], roles_confirmed: true }, U, O, ['financeiro'])).toBe(false);
  });
});

describe('monitor stability with the single-RTT probe (lease 15 s unchanged)', () => {
  it('control: published two-wave probe at 3.9 s/call (≈7.8 s, like the real 7.74–7.87 s pauses) expires', async () => {
    const { onExpire } = run(twoWaveBaseline);
    await vi.advanceTimersByTimeAsync(20_000);
    s.perCall = 3900;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(onExpire).toHaveBeenCalled();
  });
  it('candidate at the same 3.9 s/call stays valid for 10 min', async () => {
    const { monitor, onExpire } = run(internalContextProbe);
    await vi.advanceTimersByTimeAsync(20_000);
    s.perCall = 3900;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(monitor.checkAccess()).toBe(true);
  });
  it.each(['pair', 'gestor', 'consultor_tecnico'] as const)('3 s RTT for 10 min stays valid (%s), cadence bounded', async scope => {
    if (scope !== 'pair') s.roles = [scope];
    const { monitor, onExpire, fetcher } = run(internalContextProbe, scope === 'pair' ? MANAGER_CONSULTANT_ROLES : scope);
    s.perCall = 3000;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(monitor.checkAccess()).toBe(true);
    expect(fetcher.mock.calls.length).toBeLessThan(600_000 / 1000);
  });
  it('partial revocation during 3 s RTT is observed by the next confirmation and pauses', async () => {
    const { monitor, onExpire } = run(internalContextProbe);
    s.perCall = 3000;
    await vi.advanceTimersByTimeAsync(30_000);
    s.roles = ['consultor_tecnico'];
    await vi.advanceTimersByTimeAsync(16_000);
    expect(onExpire).toHaveBeenCalledWith('ineligible');
    expect(monitor.checkAccess()).toBe(false);
  });
  it('8 s RTT still pauses (sustained RTT ≥ ~7 s cannot renew within a 15 s lease); late answers never revive', async () => {
    const { monitor, onExpire } = run(internalContextProbe);
    await vi.advanceTimersByTimeAsync(30_000);
    s.perCall = 8000;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onExpire).toHaveBeenCalled();
    expect(monitor.checkAccess()).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(monitor.checkAccess()).toBe(false);
  });
  it.each([15_000, 15_008, 20_000])('%i ms RTT (≥ lease) times out and stays paused; answer after the deadline is ignored', async rtt => {
    const { monitor, onExpire } = run(internalContextProbe);
    await vi.advanceTimersByTimeAsync(30_000);
    s.perCall = rtt;
    await vi.advanceTimersByTimeAsync(rtt + 30_000);
    expect(onExpire).toHaveBeenCalledWith('timeout');
    expect(monitor.checkAccess()).toBe(false);
    await vi.advanceTimersByTimeAsync(rtt * 2);
    expect(monitor.checkAccess()).toBe(false);
  });
});
