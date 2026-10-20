// Real AuthProvider + monitor + AuthzEpochBoundary; only Supabase transport is fake (not JWT/RLS).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({
  uid: '00000000-0000-4000-8000-000000000001',
  org: '00000000-0000-4000-8000-000000000002' as string | null,
  h15Org: undefined as string | undefined,
  roles: ['gestor', 'consultor_tecnico'] as string[],
  offline: false, rtt: 0, roleReads: 0, profileReads: 0,
  hold: undefined as undefined | Promise<void>, active: true, hasRoleCalls: [] as string[],
}));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
function chain(table: string) {
  const run = async () => {
    if (table === 'profiles') s.profileReads++;
    if (s.rtt && table === 'user_roles') await wait(s.rtt);
    if (s.hold && table === 'user_roles') await s.hold;
    if (s.offline) return { data: null, error: { message: 'offline' } };
    if (table === 'profiles') return { data: { user_id: s.uid, organization_id: s.org, ativo: s.active, senha_provisoria: false, nome: 'B' }, error: null };
    if (table === 'user_roles') { s.roleReads++; return { data: s.roles.map(role => ({ role })), error: null }; }
    return { data: [], error: null };
  };
  const q: Record<string, unknown> = {};
  for (const n of ['select', 'eq', 'in', 'order']) q[n] = () => q;
  q.maybeSingle = run; q.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => run().then(f, r);
  return q;
}
vi.mock('@/lib/authz/authzEpochGate', () => ({ AUTHZ_CACHE_FOUNDATION_ENABLED: true, AUTHZ_CACHE_ROLLOUT_SCOPE: 'b2b-context', MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED: true, FINANCIAL_CONTEXT_MONITOR_ENABLED: false, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: false, PRODUCER_CONTEXT_MONITOR_ENABLED: false, CONSULTANT_CONTEXT_MONITOR_ENABLED: false, OPERATOR_CONTEXT_MONITOR_ENABLED: false }));
vi.mock('@/lib/portalBroadcast', () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: s.uid } } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {} },
  from: (t: string) => chain(t),
  rpc: async (name: string, args?: { _role: string }) => {
    if (s.offline) return { data: null, error: { message: 'offline' } };
    if (name === 'h15_actor_organization') return { data: s.h15Org ?? s.org, error: null };
    if (name === 'has_role') { s.hasRoleCalls.push(args!._role); return { data: s.active && s.roles.includes(args!._role), error: null }; }
    throw new Error('unexpected ' + name);
  },
} }));
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { supabase as fakeSupabaseClient } from '@/integrations/supabase/client';
import { installInternalActorContextAdapter } from './helpers/internalActorContextAdapter';
installInternalActorContextAdapter(fakeSupabaseClient, () => s.uid);
import { AuthzEpochBoundary } from '@/components/authz/AuthzEpochBoundary';
import { resolveEffectiveRouteRole } from '@/lib/navigation/portalRoleContext';
const PATHS = ['/dashboard/geral', '/financeiro/receber', '/app/registrar'];
function Probe() {
  const { authzEpoch, roles, primaryRole, checkAuthzAccess } = useAuth();
  const allowed = PATHS.filter(path => resolveEffectiveRouteRole({ roles, primaryRole, path, activeContext: null } as never).allowed);
  return <span>Conteúdo sensível {authzEpoch} [{checkAuthzAccess() ? 'ok' : 'no'}] {allowed.join(',')}</span>;
}
const flush = async (ms = 20) => { await act(async () => { await wait(ms); }); };
async function mount() {
  const qc = new QueryClient();
  qc.setQueryData(['cache-sensivel'], 'x');
  render(<QueryClientProvider client={qc}><AuthProvider><AuthzEpochBoundary><Probe /></AuthzEpochBoundary></AuthProvider></QueryClientProvider>);
  await flush(60);
  return qc;
}
// Simulates the real removal: next monitor poll observes the new set and pauses.
async function changeRolesAndPoll(next: string[]) {
  s.roles = next;
  await act(async () => { window.dispatchEvent(new Event('focus')); await wait(40); });
}
const retry = async (ms = 60) => { fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })); await flush(ms); };
const paused = () => expect(screen.queryByText(/Conteúdo sensível/)).toBeNull();

beforeEach(() => { s.active = true; s.hasRoleCalls = []; s.roles = ['gestor', 'consultor_tecnico']; s.org = '00000000-0000-4000-8000-000000000002'; s.h15Org = undefined; s.offline = false; s.rtt = 0; s.roleReads = 0; s.hold = undefined; });
afterEach(() => cleanup());

describe('Retry re-resolves identity (gestor+consultor)', () => {
  it('pair → gestor: Retry re-reads roles, residual gestor probe validates, only gestor routes', async () => {
    const qc = await mount();
    await changeRolesAndPoll(['gestor']);
    paused();
    expect(qc.getQueryData(['cache-sensivel'])).toBeUndefined();
    const before = s.roleReads; s.hasRoleCalls = [];
    await retry(120);
    expect(s.roleReads).toBeGreaterThan(before);
    expect(s.hasRoleCalls).toEqual(['gestor']); // live role check of the remaining role
    const txt = screen.getByText(/Conteúdo sensível/).textContent!;
    expect(txt).toContain('[ok]');
    expect(txt).toContain('/dashboard/geral,/financeiro/receber');
    expect(txt).not.toContain('/app/registrar');
  });
  it('pair → consultor: only consultor routes after validated re-resolution', async () => {
    await mount();
    await changeRolesAndPoll(['consultor_tecnico']);
    paused();
    await retry(120);
    const txt = screen.getByText(/Conteúdo sensível/).textContent!;
    expect(txt).toContain('/app/registrar');
    expect(txt).not.toContain('/dashboard/geral');
    expect(txt).not.toContain('/financeiro/receber');
  });
  it('residual gestor later losing gestor pauses again (probe keeps watching)', async () => {
    await mount();
    await changeRolesAndPoll(['gestor']);
    await retry(120);
    expect(screen.getByText(/Conteúdo sensível/)).toBeTruthy();
    await changeRolesAndPoll([]);
    paused();
    await retry();
    paused();
  });
  it('residual is denied while the remaining role is inactive', async () => {
    await mount();
    await changeRolesAndPoll(['gestor']);
    s.active = false;
    await retry(120);
    paused();
  });
  it.each([[['gestor', 'consultor_tecnico', 'financeiro']], [[]], [['papel_desconhecido']], [['financeiro']]])('roles %j remain paused', async (next) => {
    await mount();
    await changeRolesAndPoll(next);
    await retry();
    paused();
  });
  it('Retry closes readiness synchronously before any await', async () => {
    await mount();
    await changeRolesAndPoll(['gestor']);
    s.roles = ['gestor', 'consultor_tecnico'];
    let release!: () => void; s.hold = new Promise<void>(r => { release = r; });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    paused();
    expect(screen.queryByText('[ok]')).toBeNull();
    s.hold = undefined; release(); await flush(120);
    expect(screen.getByText(/\[ok\]/)).toBeTruthy();
  });
  it('restore of the exact set recovers via Retry with a new epoch', async () => {
    await mount();
    const epoch0 = screen.getByText(/Conteúdo sensível/).textContent;
    await changeRolesAndPoll(['gestor']);
    await retry(120);
    expect(screen.getByText(/Conteúdo sensível/).textContent).not.toContain('/app/registrar');
    await changeRolesAndPoll(['gestor', 'consultor_tecnico']); // residual probe rejects superset of gestor
    paused();
    await retry(120);
    expect(screen.getByText(/Conteúdo sensível/).textContent).toContain('/app/registrar');
    const txt = screen.getByText(/Conteúdo sensível/).textContent;
    expect(txt).not.toBe(epoch0);
  });
  it('offline during Retry stays paused; later Retry recovers', async () => {
    await mount();
    await changeRolesAndPoll(['gestor']);
    s.roles = ['gestor', 'consultor_tecnico']; s.offline = true;
    await retry(); paused();
    s.offline = false;
    await retry(80);
    expect(screen.getByText(/Conteúdo sensível/)).toBeTruthy();
  });
  it('3s latency: content hidden until reconfirmed; double click is single-flight', async () => {
    await mount();
    await changeRolesAndPoll(['gestor']);
    s.roles = ['gestor', 'consultor_tecnico']; s.rtt = 3000;
    const before = s.profileReads;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const button = screen.getByRole('button', { name: 'Tentar novamente' });
      fireEvent.click(button); fireEvent.click(button);
      paused();
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(s.profileReads - before).toBe(1); // single-flight loader
      paused();
      await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    } finally { vi.useRealTimers(); }
    expect(screen.getByText(/Conteúdo sensível/)).toBeTruthy();
  });
  it('race: role removed again while Retry is in flight stays paused', async () => {
    await mount();
    await changeRolesAndPoll(['gestor']);
    s.roles = ['gestor', 'consultor_tecnico'];
    let release!: () => void; s.hold = new Promise<void>(r => { release = r; });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await flush();
    s.roles = []; s.hold = undefined; release();
    await flush(80);
    paused();
  });
  it('cross-tenant: old cache never survives; new tenant only after its own probe, gestor-only there stays paused', async () => {
    const qc = await mount();
    s.org = '00000000-0000-4000-8000-0000000000bb';
    await changeRolesAndPoll(['gestor', 'consultor_tecnico']);
    paused();
    expect(qc.getQueryData(['cache-sensivel'])).toBeUndefined();
    s.h15Org = '00000000-0000-4000-8000-000000000002'; // server still says A
    await retry(80);
    paused();
    s.roles = ['gestor']; s.h15Org = undefined;
    await retry(80);
    paused(); // tenant divergence is never adopted by Retry
  });
});
