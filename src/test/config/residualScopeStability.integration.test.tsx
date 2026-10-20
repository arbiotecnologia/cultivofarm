// Real AuthProvider + real monitor + real internalContextProbe; fake per-call transport
// latency and fake clock (timers, Date and performance). Not hosted JWT/RLS nor browser suspension.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({
  uid: '00000000-0000-4000-8000-000000000001', org: '00000000-0000-4000-8000-000000000002',
  roles: ['gestor', 'consultor_tecnico'] as string[], perCall: 50, probes: 0,
}));
const later = <T,>(v: () => T, _tag = '') => new Promise<T>(r => setTimeout(() => r(v()), s.perCall));
vi.mock('@/lib/authz/authzEpochGate', () => ({ AUTHZ_CACHE_FOUNDATION_ENABLED: true, AUTHZ_CACHE_ROLLOUT_SCOPE: 'b2b-context', MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED: true, FINANCIAL_CONTEXT_MONITOR_ENABLED: false, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: false, PRODUCER_CONTEXT_MONITOR_ENABLED: false, CONSULTANT_CONTEXT_MONITOR_ENABLED: false, OPERATOR_CONTEXT_MONITOR_ENABLED: false }));
vi.mock('@/lib/portalBroadcast', () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: s.uid } } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {} },
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    for (const n of ['select', 'eq', 'in', 'order', 'abortSignal']) q[n] = () => q;
    const run = () => later(() => t === 'profiles'
      ? { data: { user_id: s.uid, organization_id: s.org, ativo: true, senha_provisoria: false, nome: 'B' }, error: null }
      : { data: s.roles.map(role => ({ role })), error: null }, t);
    q.maybeSingle = run; q.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => run().then(f, r);
    return q;
  },
  rpc: (name: string, args?: { _role: string }) => {
    if (name === 'h15_actor_organization') s.probes++;
    return later(() => name === 'has_role' ? { data: s.roles.includes(args!._role), error: null } : { data: s.org, error: null }, name);
  },
} }));
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { supabase as fakeSupabaseClient } from '@/integrations/supabase/client';
import { installInternalActorContextAdapter } from './helpers/internalActorContextAdapter';
installInternalActorContextAdapter(fakeSupabaseClient, () => s.uid, (_uid, role) => s.roles.includes(role)); // one fake RTT per probe
import { AuthzEpochBoundary } from '@/components/authz/AuthzEpochBoundary';
import { createAuthzEpochMonitor } from '@/lib/authz/authzEpochMonitor';
import { internalContextProbe } from '@/lib/authz/internalContextProbe';

function Probe() { const { roles, checkAuthzAccess } = useAuth(); return <span>Conteúdo sensível [{checkAuthzAccess() ? 'ok' : 'no'}] {roles.join('+')}</span>; }
// Small act() steps so React effects (monitor creation/state) flush between timer slices.
const adv = async (ms: number) => { for (let t = 0; t < ms; t += 250) await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(250, ms - t)); }); };
const pausedText = () => screen.queryByText('Sessão de acesso pausada');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  s.roles = ['gestor', 'consultor_tecnico']; s.perCall = 50; s.probes = 0;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function toResidual(remaining: 'gestor' | 'consultor_tecnico') {
  render(<QueryClientProvider client={new QueryClient()}><AuthProvider><AuthzEpochBoundary><Probe /></AuthzEpochBoundary></AuthProvider></QueryClientProvider>);
  await adv(10_000);
  expect(screen.getByText(/\[ok\] gestor\+consultor_tecnico|\[ok\] consultor_tecnico\+gestor/)).toBeTruthy();
  s.roles = [remaining];
  await adv(15_000); // next background poll observes the loss
  expect(pausedText()).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await adv(12_000); // slow: fresh read + loader + probe
  expect(screen.getByText(new RegExp(`\\[ok\\] ${remaining}$`))).toBeTruthy();
}

describe.each(['gestor', 'consultor_tecnico'] as const)('pair → %s residual stability (3 s/probe)', remaining => {
  it('fast → slow (3 s/call = 3 s single-RTT probe) stays valid for 10 min of cycles; lease 15 s untouched', async () => {
    await toResidual(remaining);
    s.perCall = 3000;
    const before = s.probes;
    for (let i = 0; i < 60; i++) { await adv(10_000); expect(pausedText()).toBeNull(); }
    expect(screen.getByText(/\[ok\]/)).toBeTruthy();
    const probes = s.probes - before;
    expect(probes).toBeGreaterThan(40);        // keeps renewing
    expect(probes).toBeLessThan(600_000 / 1000); // bounded cadence (min delay 1 s)
  });
  it('slow from the start of the residual scope stays valid', async () => {
    s.perCall = 1500;
    await toResidual(remaining);
    for (let i = 0; i < 30; i++) { await adv(10_000); expect(pausedText()).toBeNull(); }
  });
  it('negative: 8 s/call (8 s single-RTT probe) still pauses; late answers do not revive', async () => {
    await toResidual(remaining);
    s.perCall = 8000;
    await adv(60_000);
    expect(pausedText()).toBeTruthy();
    expect(screen.queryByText(/Conteúdo sensível/)).toBeNull();
  });
});

describe('control: same real probe without early renewal (published cadence) expires', () => {
  it.each(['gestor', 'consultor_tecnico'] as const)('%s, 3 s probe + 10 s poll ≥ 15 s lease', async role => {
    s.roles = [role]; s.perCall = 3000;
    const onExpire = vi.fn();
    const monitor = createAuthzEpochMonitor({
      fetcher: () => internalContextProbe(s.uid, s.org, role), now: () => performance.now(),
      setTimeoutFn: (cb, ms) => setTimeout(cb, ms), clearTimeoutFn: h => clearTimeout(h as ReturnType<typeof setTimeout>),
      isVisible: () => true, isOnline: () => true, pollWhenHidden: true, renewBeforeDeadline: false,
      onExpire, onEpochChange: vi.fn(), onStateChange: vi.fn(),
    });
    monitor.start();
    await vi.advanceTimersByTimeAsync(120_000);
    monitor.stop();
    expect(onExpire).toHaveBeenCalled();
  });
});
