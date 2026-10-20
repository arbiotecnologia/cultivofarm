// Real AuthProvider + real monitor + real internalContextProbe; fake transport/clock.
// Synthetic only: not hosted JWT/RLS, not browser suspension, not stability certification.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({
  uid: '00000000-0000-4000-8000-000000000001', org: '00000000-0000-4000-8000-000000000002', profileOrg: '00000000-0000-4000-8000-000000000002',
  roles: ['gestor', 'consultor_tecnico'] as string[], perCall: 50, reads: 0, readError: null as null | { status: number; message: string }, signOuts: 0, signedOut: false, probeDeny: false, cb: null as null | ((e: string, sess: unknown) => void),
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
      ? { data: { user_id: s.uid, organization_id: s.profileOrg, ativo: true, senha_provisoria: false, nome: 'B' }, error: null }
      : { data: s.roles.map(role => ({ role })), error: null }); };
    q.maybeSingle = run; q.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => run().then(f, r);
    return q;
  },
  rpc: (name: string, args?: { _role: string }) => later(() => name === 'has_role' ? { data: !s.probeDeny && s.roles.includes(args!._role), error: null } : { data: s.org, error: null }),
} }));
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { supabase as fake } from '@/integrations/supabase/client';
import { installInternalActorContextAdapter } from '@/test/config/helpers/internalActorContextAdapter';
installInternalActorContextAdapter(fake, () => s.uid, (_uid, role) => !s.probeDeny && s.roles.includes(role));
import { AuthzEpochBoundary } from '@/components/authz/AuthzEpochBoundary';

const BASELINE = process.env.MONITOR_TARGET === 'baseline';
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
  s.roles = ['gestor', 'consultor_tecnico']; s.perCall = 50; s.reads = 0; s.readError = null; s.signOuts = 0; s.signedOut = false; s.probeDeny = false; s.profileOrg = s.org;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe.each(['gestor', 'consultor_tecnico'] as const)('remoção isolada → residual %s', remaining => {
  it(BASELINE ? 'baseline reproduz: fica pausado até Tentar novamente manual' : 'candidato: uma releitura canônica e nova confirmação, sem clique', async () => {
    await mount();
    s.roles = [remaining];
    await adv(15_000);
    await adv(5_000);
    if (BASELINE) {
      expect(paused()).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      await adv(5_000);
    }
    expect(screen.getByText(new RegExp(`\\[ok\\] ${remaining}$`))).toBeTruthy();
    expect(s.signOuts).toBe(0);
  });
  it('papel removido nunca é restaurado; conteúdo nunca exibe o par durante a releitura', async () => {
    await mount();
    s.roles = [remaining]; s.perCall = 1500;
    let seenPause = false;
    for (let i = 0; i < 160; i++) {
      await adv(250);
      if (paused()) seenPause = true;
      // Before the next poll the previously confirmed lease legitimately holds; after the pause the pair never returns.
      if (seenPause) expect(screen.queryByText(/\[ok\] (gestor\+consultor_tecnico|consultor_tecnico\+gestor)/)).toBeNull();
    }
    expect(seenPause).toBe(true);
    if (BASELINE) return;
    expect(screen.queryByText(/gestor\+|\+gestor|consultor_tecnico\+|\+consultor_tecnico/)).toBeNull();
  });
});

describe('negativos', () => {
  it('revogação total: permanece pausado, sem loop (leituras limitadas), sem signOut', async () => {
    await mount(); s.roles = [];
    await adv(15_000); const r0 = s.reads; await adv(120_000);
    expect(paused()).toBeTruthy(); expect(screen.queryByText(/Conteúdo sensível/)).toBeNull();
    expect(s.reads - r0).toBeLessThanOrEqual(2); expect(s.signOuts).toBe(0);
  });
  it('papel remanescente negado pelo probe (inativo): pausado, uma única releitura, sem loop', async () => {
    await mount(); s.roles = ['gestor']; s.probeDeny = true;
    await adv(15_000); const r0 = s.reads; await adv(120_000);
    expect(paused()).toBeTruthy(); expect(screen.queryByText(/Conteúdo sensível/)).toBeNull();
    expect(s.reads - r0).toBeLessThanOrEqual(4); expect(s.signOuts).toBe(0);
  });
  it('corrida: papel remanescente removido durante a releitura automática permanece pausado', async () => {
    await mount(); s.roles = ['gestor']; s.perCall = 3000;
    for (let i = 0; i < 120 && !paused(); i++) await adv(250);
    s.roles = []; await adv(120_000);
    expect(paused()).toBeTruthy(); expect(screen.queryByText(/Conteúdo sensível/)).toBeNull();
  });
  it('troca de tenant não é adotada: permanece pausado', async () => {
    await mount(); s.roles = ['gestor']; s.profileOrg = '00000000-0000-4000-8000-0000000000ff';
    await adv(60_000);
    expect(paused()).toBeTruthy(); expect(screen.queryByText(/Conteúdo sensível/)).toBeNull();
  });
  it.each([401, 403])('leitura %s: permanece pausado, sem loop e sem signOut', async status => {
    await mount(); s.roles = ['gestor']; s.readError = { status, message: 'denied' };
    await adv(15_000); const r0 = s.reads; await adv(120_000);
    expect(paused()).toBeTruthy(); expect(s.reads - r0).toBeLessThanOrEqual(2); expect(s.signOuts).toBe(0);
  });
  it('offline na expiração: nenhuma releitura automática', async () => {
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    s.roles = ['gestor']; const r0 = s.reads;
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    await adv(60_000);
    expect(paused()).toBeTruthy(); expect(s.reads).toBe(r0);
  });
  it('logout (signOut canônico + SIGNED_OUT) durante releitura lenta: resposta antiga não reabre', async () => {
    await mount(); s.roles = ['gestor']; s.perCall = 3000;
    for (let i = 0; i < 120 && !paused(); i++) await adv(250);
    expect(paused()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'sair-externo' }));
    await adv(60_000);
    expect(screen.queryByText(/\[ok\]/)).toBeNull(); expect(s.signOuts).toBe(1);
  });
  it('desmontagem com releitura lenta em voo: resposta antiga não reabre nem agenda nova', async () => {
    const view = { u: () => {} };
    await mount(); s.roles = ['gestor']; s.perCall = 3000;
    await adv(16_000);
    cleanup(); const r0 = s.reads; await adv(60_000);
    expect(screen.queryByText(/Conteúdo sensível/)).toBeNull(); expect(s.reads).toBe(r0); void view;
  });
  it('RTT 8 s sustentado no residual continua pausando (lease 15 s, sem resposta tardia)', async () => {
    await mount(); s.roles = ['gestor']; await adv(25_000);
    if (!BASELINE) expect(screen.getByText(/\[ok\] gestor$/)).toBeTruthy();
    s.perCall = 8000; await adv(60_000);
    expect(paused()).toBeTruthy(); expect(screen.queryByText(/Conteúdo sensível/)).toBeNull();
  });
});
