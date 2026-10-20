// Real AuthProvider + real monitor + real internalContextProbe; fake transport/clock.
// Synthetic only: not hosted JWT/RLS, not browser suspension, not stability certification.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({
  uid: '00000000-0000-4000-8000-000000000001', org: '00000000-0000-4000-8000-000000000002', profileOrg: '00000000-0000-4000-8000-000000000002',
  roles: ['gestor', 'consultor_tecnico'] as string[], perCall: 50, reads: 0, readError: null as null | { status: number; message: string }, signOuts: 0, signedOut: false, probeDeny: false, probes: 0, profileMode: 'ok' as 'ok' | 'inactive' | 'absent', cb: null as null | ((e: string, sess: unknown) => void),
}));
const later = <T,>(v: () => T) => new Promise<T>(r => setTimeout(() => r(v()), s.perCall));
vi.mock('@/lib/authz/authzEpochGate', () => ({ AUTHZ_CACHE_FOUNDATION_ENABLED: true, AUTHZ_CACHE_ROLLOUT_SCOPE: 'b2b-context', MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED: true, FINANCIAL_CONTEXT_MONITOR_ENABLED: false, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: false, PRODUCER_CONTEXT_MONITOR_ENABLED: false, CONSULTANT_CONTEXT_MONITOR_ENABLED: false, OPERATOR_CONTEXT_MONITOR_ENABLED: false }));
vi.mock('@/lib/portalBroadcast', () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: s.signedOut ? null : { user: { id: s.uid } } }, error: null }), onAuthStateChange: (cb: (e: string, sess: unknown) => void) => { s.cb = cb; return { data: { subscription: { unsubscribe() { s.cb = null; } } } }; }, signOut: async () => { s.signOuts++; s.signedOut = true; s.cb?.('SIGNED_OUT', null); } },
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    for (const n of ['select', 'eq', 'in', 'order', 'abortSignal']) q[n] = () => q;
    const run = () => { s.reads++; return later(() => s.readError ? { data: null, error: s.readError } : t === 'profiles'
      ? { data: s.profileMode === 'absent' ? null : { user_id: s.uid, organization_id: s.profileOrg, ativo: s.profileMode === 'ok', senha_provisoria: false, nome: 'B' }, error: null }
      : { data: s.roles.map(role => ({ role })), error: null }); };
    q.maybeSingle = run; q.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => run().then(f, r);
    return q;
  },
  rpc: (name: string, args?: { _role: string }) => { s.probes++; return later(() => name === 'has_role' ? { data: !s.probeDeny && s.roles.includes(args!._role), error: null } : { data: s.org, error: null }); },
} }));
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { supabase as fake } from '@/integrations/supabase/client';
import { installInternalActorContextAdapter } from '@/test/config/helpers/internalActorContextAdapter';
installInternalActorContextAdapter(fake, () => s.uid, (_uid, role) => { s.probes++; return !s.probeDeny && s.roles.includes(role); });
import { AuthzEpochBoundary } from '@/components/authz/AuthzEpochBoundary';

function Probe() { const { roles, checkAuthzAccess, signOut } = useAuth(); return <span>Conteúdo sensível [{checkAuthzAccess() ? 'ok' : 'no'}] {roles.join('+')}<button onClick={() => void signOut()}>sair</button></span>; }
function Outside() { const { signOut } = useAuth(); return <button onClick={() => void signOut()}>sair-externo</button>; }
const adv = async (ms: number) => { for (let t = 0; t < ms; t += 250) await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(250, ms - t)); }); };
const paused = () => screen.queryByText('Sessão de acesso pausada');
const mount = async () => {
  render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Outside /><AuthzEpochBoundary><Probe /></AuthzEpochBoundary></AuthProvider></QueryClientProvider>);
  await adv(10_000);
  expect(screen.getByText(/\[ok\] (gestor\+consultor_tecnico|consultor_tecnico\+gestor)/)).toBeTruthy();
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  s.roles = ['gestor', 'consultor_tecnico']; s.perCall = 50; s.reads = 0; s.readError = null; s.signOuts = 0; s.signedOut = false; s.probeDeny = false; s.probes = 0; s.profileMode = 'ok'; s.profileOrg = s.org;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });


const pairText = /\[ok\] (gestor\+consultor_tecnico|consultor_tecnico\+gestor)/;
const sensitive = () => screen.queryByText(/Conteúdo sensível/);
/** Steps until the poll observes the loss; returns once the pause is on screen. */
async function untilPaused() { for (let i = 0; i < 400 && !paused(); i++) await adv(50); expect(paused()).toBeTruthy(); }
/** Watches every 50 ms after the pause: nothing sensitive may render before a fresh read+probe. */
async function watchUntilContent(ms: number) {
  const r0 = s.reads, p0 = s.probes; let shownAt: { reads: number; probes: number } | null = null;
  for (let t = 0; t < ms && !shownAt; t += 50) {
    await adv(50);
    if (sensitive()) shownAt = { reads: s.reads - r0, probes: s.probes - p0 };
  }
  return shownAt;
}

// Decisive integration: real AuthProvider/monitor/probe/boundary; FAILS on baseline 0feac450 (manual Retry needed).
describe.each([['gestor', 'consultor_tecnico'], ['consultor_tecnico', 'gestor']] as const)('retirada %s → residual %s', (removed, remaining) => {
  it('bloqueia imediatamente e só reabre após leitura fresca perfil+roles e probe válido, sem clique', async () => {
    await mount();
    s.roles = [remaining]; s.perCall = 300;
    await untilPaused();
    expect(sensitive()).toBeNull();
    const shown = await watchUntilContent(20_000);
    expect(shown).not.toBeNull();                       // baseline: stays paused → fails here
    expect(shown!.reads).toBeGreaterThanOrEqual(2);      // fresh profiles + user_roles
    expect(shown!.probes).toBeGreaterThanOrEqual(1);     // residual probe confirmed
    expect(screen.getByText(new RegExp(`\\[ok\\] ${remaining}$`))).toBeTruthy();
    expect(screen.queryByText(new RegExp(removed))).toBeNull(); // removed role never restored
    expect(screen.queryByText(pairText)).toBeNull();
    expect(s.signOuts).toBe(0);
  });
});

describe('negativos (candidato e baseline devem permanecer pausados)', () => {
  const stays = async (ms = 120_000) => { await adv(ms); expect(paused()).toBeTruthy(); expect(sensitive()).toBeNull(); };
  it.each([401, 403, 500])('leitura %s: pausado, ≤1 tentativa automática, sem signOut', async status => {
    await mount(); s.roles = ['gestor']; s.readError = { status, message: 'x' };
    await untilPaused(); const r0 = s.reads; await stays();
    expect(s.reads - r0).toBeLessThanOrEqual(2); expect(s.signOuts).toBe(0);
  });
  it.each(['inactive', 'absent'] as const)('perfil %s: pausado, sem nova saída automática', async mode => {
    await mount(); s.roles = ['gestor']; s.profileMode = mode;
    await untilPaused(); const r0 = s.reads; await stays();
    expect(s.reads - r0).toBeLessThanOrEqual(2); expect(s.signOuts).toBe(0);
  });
  it('tenant mudado: não adotado', async () => {
    await mount(); s.roles = ['gestor']; s.profileOrg = '00000000-0000-4000-8000-0000000000ff';
    await untilPaused(); await stays();
  });
  it('offline na expiração: nenhuma leitura automática', async () => {
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    const r0 = s.reads;
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    await stays(60_000); expect(s.reads).toBe(r0);
  });
  it('logout (SIGNED_OUT) com releitura em voo: resposta antiga não reabre', async () => {
    await mount(); s.roles = ['gestor']; s.perCall = 3000;
    await untilPaused();
    fireEvent.click(screen.getByRole('button', { name: 'sair-externo' }));
    await adv(60_000); expect(screen.queryByText(/\[ok\]/)).toBeNull(); expect(s.signOuts).toBe(1);
  });
  it('desmontagem com releitura em voo: nada reabre e nenhuma leitura nova', async () => {
    await mount(); s.roles = ['gestor']; s.perCall = 3000;
    await untilPaused(); await adv(500);
    cleanup(); const r0 = s.reads; await adv(60_000);
    expect(sensitive()).toBeNull(); expect(s.reads - r0).toBeLessThanOrEqual(2);
  });
  it('papel remanescente removido durante a releitura: pausado', async () => {
    await mount(); s.roles = ['gestor']; s.perCall = 3000;
    await untilPaused(); s.roles = []; await stays();
  });
  it('RTT 8 s sustentado no residual: conteúdo some (lease 15 s, sem resposta tardia)', async () => {
    await mount(); s.roles = ['gestor']; await untilPaused(); await adv(5_000);
    s.perCall = 8000; await adv(60_000);
    expect(sensitive()).toBeNull();
  });
});

describe('orçamento', () => {
  it('ineligible persistente: exatamente uma tentativa automática; valid posterior rearma uma nova', async () => {
    await mount(); s.roles = ['gestor'];
    await untilPaused(); await adv(5_000);
    expect(screen.getByText(/\[ok\] gestor$/)).toBeTruthy(); // first attempt used + valid rearms
    s.probeDeny = true;
    await untilPaused();
    const r0 = s.reads; await adv(120_000);
    expect(paused()).toBeTruthy(); expect(s.reads - r0).toBe(2);   // one fresh read, no loop
    s.probeDeny = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await adv(5_000); expect(screen.getByText(/\[ok\] gestor$/)).toBeTruthy(); // valid → rearmed
    s.probeDeny = true; await untilPaused();
    const r1 = s.reads; await adv(120_000);
    expect(s.reads - r1).toBe(2);                                  // exactly one new attempt
  });
});
