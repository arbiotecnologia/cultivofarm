// Real AuthProvider/monitor/probe/ProtectedRoutes/RoleGuard/AppPortalGuard/AppLayout/MobileLayout.
// Only Supabase transport (per-call latency), session events and shell widgets are fake: not JWT/RLS.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({
  uid: '00000000-0000-4000-8000-000000000001', org: '00000000-0000-4000-8000-000000000002',
  roles: ['gestor', 'consultor_tecnico'] as string[], lat: 0, authListener: undefined as undefined | ((e: string, x: { user: { id: string } } | null) => void),
  hangNext: '' as string, h15: 0, holdNext: '' as string, hangSkip: 0, hangStar: false, auth: undefined as undefined | { authzReady: boolean; revalidateAuthz: () => void }, release: undefined as undefined | (() => void),
}));
const later = <T,>(v: () => T, tag: string) => {
  if (s.hangNext === tag) { if (s.hangSkip > 0) s.hangSkip--; else { s.hangNext = ''; return new Promise<T>(() => {}); } }
  if (s.holdNext === tag) { s.holdNext = ''; return new Promise<T>(r => { s.release = () => r(v()); }); }
  return s.lat ? new Promise<T>(r => setTimeout(() => r(v()), s.lat)) : Promise.resolve(v());
};
function chain(t: string) {
  const q: Record<string, unknown> = {};
  let cols = '';
  for (const n of ['eq', 'is', 'filter', 'in', 'not', 'neq', 'order', 'abortSignal']) q[n] = () => q;
  q.select = (c: string) => { cols = c; return q; };
  const run = () => (t === 'profiles' && cols === '*' && s.hangStar ? (s.hangStar = false, new Promise<never>(() => {})) : null) ?? later(() => t === 'profiles'
    ? { data: { user_id: s.uid, organization_id: s.org, ativo: true, senha_provisoria: false, nome: 'B' }, error: null }
    : t === 'user_roles' ? { data: s.roles.map(role => ({ role })), error: null } : { data: [], error: null }, t);
  q.maybeSingle = run; q.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => run().then(f, r);
  return q;
}
vi.mock('@/lib/authz/authzEpochGate', () => ({ AUTHZ_CACHE_FOUNDATION_ENABLED: true, AUTHZ_CACHE_ROLLOUT_SCOPE: 'b2b-context', MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED: true, FINANCIAL_CONTEXT_MONITOR_ENABLED: true, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: true, PRODUCER_CONTEXT_MONITOR_ENABLED: true, CONSULTANT_CONTEXT_MONITOR_ENABLED: true, OPERATOR_CONTEXT_MONITOR_ENABLED: true }));
vi.mock('@/lib/portalBroadcast', () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
vi.mock('@/hooks/useSystemConfig', () => ({ useSystemConfig: () => ({ defaults: { nome_empresa: 'Cultivo Farm' } }) }));
vi.mock('@/hooks/useOrgOnboarding', () => ({ useOnboardingState: () => ({ data: { required: false } }) }));
vi.mock('@/components/AppSidebar', () => ({ AppSidebar: () => <nav>Menu desktop</nav> }));
vi.mock('@/components/portal/PortalTopBar', () => ({ PortalTopBar: ({ brandTitle }: { brandTitle: string }) => <header>{brandTitle}</header> }));
vi.mock('@/lib/accessAuditLog', () => ({ logAccessDeniedOnce: () => {}, routeGroupFromPath: () => 'technical' }));
vi.mock('@/hooks/useOfflineSync', () => ({ useOfflineSync: () => ({ isOnline: true, pendingCount: 0, syncing: false, syncAll: () => {} }) }));
vi.mock('@/hooks/useEntitlements', () => ({ useEntitlements: () => ({ status: 'ready', features: new Set(['ordens_producao', 'estoque_embalagens', 'contas_receber']) }) }));
vi.mock('@/components/app/OfflineIndicator', () => ({ OfflineIndicator: () => null }));
vi.mock('@/components/app/PendingMediaRecovery', () => ({ PendingMediaRecovery: () => null }));
vi.mock('@/components/ui/sidebar', () => ({ SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, SidebarTrigger: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: s.uid } } }, error: null }),
    onAuthStateChange: (l: typeof s.authListener) => { s.authListener = l; return { data: { subscription: { unsubscribe() { s.authListener = undefined; } } } }; }, signOut: async () => {} },
  from: (t: string) => chain(t),
  rpc: (name: string, args?: { _role: string }) => {
    const p = later(() => {
      if (name === 'get_my_available_portal_contexts') {
        const tech = s.roles.includes('consultor_tecnico'); const adm = s.roles.some(r => ['gestor', 'administrador'].includes(r));
        return { data: { available_contexts: [...(adm ? ['admin'] : []), ...(tech ? ['technical'] : [])], has_technical_access: adm || tech, is_admin: adm, has_b2b_access: adm, must_select_context: adm && tech }, error: null };
      }
      if (name === 'has_role') return { data: s.roles.includes(args!._role), error: null };
      if (name === 'h15_actor_organization') { s.h15++; return { data: s.org, error: null }; }
      return { data: null, error: null };
    }, name);
    return Object.assign(p, { abortSignal: () => p });
  },
} }));
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { supabase as fakeSupabaseClient } from '@/integrations/supabase/client';
import { installInternalActorContextAdapter } from './helpers/internalActorContextAdapter';
installInternalActorContextAdapter(fakeSupabaseClient, () => s.uid, (_uid, role) => s.roles.includes(role)); // one fake RTT per probe
function AuthSpy() { s.auth = useAuth(); return null; }
import { ProtectedRoutes, RoleGuard } from '@/App';
import MobileLayout from '@/pages/app/MobileLayout';
import { AppPortalGuard } from '@/components/guards/AppPortalGuard';
import { readAuthzDiagnostics, clearAuthzDiagnostics } from '@/lib/authz/localDiagnostics';

function Url() { return <output data-testid="url">{useLocation().pathname}</output>; }
function setup(path = '/financeiro/receber') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><AuthProvider><AuthSpy /><MemoryRouter initialEntries={[path]}><Url /><Routes>
    <Route element={<ProtectedRoutes />}>
      <Route path="/financeiro/receber" element={<RoleGuard><span>Contas a receber</span></RoleGuard>} />
    </Route>
    <Route element={<AppPortalGuard />}><Route element={<MobileLayout />}><Route path="/app" element={<span>Técnico campo</span>} /></Route></Route>
    <Route path="/sem-permissao" element={<Link to="/app">Ir ao técnico</Link>} />
  </Routes></MemoryRouter></AuthProvider></QueryClientProvider>);
  return qc;
}
const tick = async (ms = 0) => { for (let t = 0; t < ms; t += 100) await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(100, ms - t)); }); for (let i = 0; i < 10; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
const retry = () => fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
const loadingText = () => screen.queryByText(/^Carregando/);
const focus = () => act(() => { window.dispatchEvent(new Event('focus')); });
const tokenRefreshed = () => act(() => { s.authListener?.('TOKEN_REFRESHED', { user: { id: s.uid } }); });

async function pairThenLoseGestor() {
  setup(); await tick(3000);
  expect(screen.getByText('Contas a receber')).toBeTruthy();
  s.roles = ['consultor_tecnico']; focus(); await tick(3000);
  expect(screen.getByText('Sessão de acesso pausada')).toBeTruthy();
}
/** Terminal, observable states only: never an endless spinner. */
async function expectConsultorRecovered() {
  expect(loadingText()).toBeNull();
  expect(screen.queryByText('Contas a receber')).toBeNull(); // financial denied for the remaining role
  expect(screen.getByTestId('url').textContent).toBe('/sem-permissao');
  fireEvent.click(screen.getByRole('link', { name: 'Ir ao técnico' })); await tick(4000);
  expect(screen.getByText('Técnico campo')).toBeTruthy();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  s.roles = ['gestor', 'consultor_tecnico']; s.lat = 500; s.hangNext = ''; s.hangSkip = 0; s.hangStar = false; s.holdNext = ''; s.release = undefined; s.org = '00000000-0000-4000-8000-000000000002'; s.h15 = 0; s.authListener = undefined; localStorage.clear(); clearAuthzDiagnostics();
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Retry / renewal generation conflicts never leave an endless loading (500 ms per call)', () => {
  it('control: pair → gestor removed → Retry → consultor recovers, financial denied', async () => {
    await pairThenLoseGestor();
    retry(); await tick(8000);
    await expectConsultorRecovered();
  });
  it('environmental poll of the old monitor expiring during the Retry fresh read does not cancel Retry', async () => {
    await pairThenLoseGestor();
    retry(); focus(); // click focus: expired pair monitor polls again and expires mid-Retry
    await tick(8000);
    await expectConsultorRecovered();
  });
  it('old monitor expiring while the Retry loader is in flight cannot strand loading', async () => {
    await pairThenLoseGestor();
    retry(); await tick(1050); // fresh read done (2 × 500 ms), loader in flight
    focus(); await tick(8000);
    await expectConsultorRecovered();
  });
  it('TOKEN_REFRESHED while the Retry loader is in flight + monitor expiry: loading ends', async () => {
    await pairThenLoseGestor();
    retry(); await tick(1050);
    focus(); tokenRefreshed(); await tick(10000);
    await expectConsultorRecovered();
  });
  it('TOKEN_REFRESHED during the Retry fresh read yields to the renewal loader', async () => {
    await pairThenLoseGestor();
    retry(); await tick(200); tokenRefreshed(); await tick(10000);
    await expectConsultorRecovered();
  });
  it('natural renewal after residual consultor (at /app) re-resolves; no stuck spinner', async () => {
    await pairThenLoseGestor();
    retry(); await tick(8000); await expectConsultorRecovered();
    tokenRefreshed(); focus(); await tick(10000);
    expect(loadingText()).toBeNull();
    expect(screen.getByText('Técnico campo')).toBeTruthy();
    expect(readAuthzDiagnostics().some(d => d.event === 'auth_refresh')).toBe(true);
  });
  it('a hung profile read ends in an explicit recoverable error, never infinite loading; late answer not adopted', async () => {
    setup(); await tick(3000);
    s.hangNext = 'profiles'; tokenRefreshed(); await tick(25000);
    expect(loadingText()).toBeNull();
    expect(screen.queryByText('Contas a receber')).toBeNull();
    expect(screen.getByText(/Falha ao carregar dados do usuário/)).toBeTruthy();
    expect(JSON.stringify(readAuthzDiagnostics())).not.toMatch(/0000-4000/);
  });
  it('restoring gestor afterwards: pause → Retry recovers the pair and financial again', async () => {
    await pairThenLoseGestor();
    retry(); await tick(8000); await expectConsultorRecovered();
    s.roles = ['gestor', 'consultor_tecnico']; focus(); await tick(4000);
    expect(screen.getByText('Sessão de acesso pausada')).toBeTruthy();
    retry(); await tick(8000);
    expect(loadingText()).toBeNull();
    expect(screen.getByText('Técnico campo')).toBeTruthy();
  });
  it('late profile answer after the loader deadline is never adopted', async () => {
    setup(); await tick(3000);
    s.holdNext = 'profiles'; tokenRefreshed(); await tick(21000);
    expect(screen.getByText(/Falha ao carregar dados do usuário/)).toBeTruthy();
    s.release?.(); await tick(2000);
    expect(screen.getByText(/Falha ao carregar dados do usuário/)).toBeTruthy();
    expect(screen.queryByText('Contas a receber')).toBeNull();
    expect(readAuthzDiagnostics().some(d => d.event === 'load_timeout' && (d.rttMs ?? 0) >= 20000)).toBe(true);
  });
  it('cross-tenant change during Retry is not adopted: stays paused, no spinner', async () => {
    await pairThenLoseGestor();
    s.org = '00000000-0000-4000-8000-000000000009';
    retry(); await tick(8000);
    expect(loadingText()).toBeNull();
    expect(screen.getByText('Sessão de acesso pausada')).toBeTruthy();
    expect(screen.queryByText('Contas a receber')).toBeNull();
  });
  it('zero roles during Retry stays paused (no spinner, no financial)', async () => {
    await pairThenLoseGestor();
    s.roles = [];
    retry(); await tick(8000);
    expect(loadingText()).toBeNull();
    expect(screen.getByText('Sessão de acesso pausada')).toBeTruthy();
  });
});

describe('never-resolving transport (independent evidence 18:14): deadlines and single-flight release', () => {
  it('TOKEN_REFRESHED with profiles never resolving: after 60 s no spinner, readiness closed, recoverable', async () => {
    setup(); await tick(3000);
    s.hangNext = 'profiles'; tokenRefreshed(); await tick(60000);
    expect(loadingText()).toBeNull();
    expect(screen.queryByText('Contas a receber')).toBeNull();
    expect(screen.getByText(/Falha ao carregar dados do usuário/)).toBeTruthy();
  });
  it('Retry fresh read never resolving: after 60 s transport returns and a new Retry recovers', async () => {
    await pairThenLoseGestor();
    s.hangNext = 'profiles'; retry(); await tick(60000);
    expect(loadingText()).toBeNull();
    expect(screen.queryByText('Contas a receber')).toBeNull();
    expect(screen.getByText('Sessão de acesso pausada')).toBeTruthy();
    retry(); await tick(8000);
    await expectConsultorRecovered();
  });
  it('Retry loader never resolving: deadline ends loading with explicit error, no old authority', async () => {
    await pairThenLoseGestor();
    s.hangNext = 'profiles'; s.hangSkip = 1; // Retry fresh read passes, its loader's profile read hangs
    retry(); await tick(60000);
    expect(s.hangNext).toBe('');
    expect(loadingText()).toBeNull();
    expect(screen.queryByText('Contas a receber')).toBeNull();
    expect(screen.getByText(/Falha ao carregar dados do usuário/)).toBeTruthy();
  });
});

describe('independent review 1875eb: Retry loader select(*) never resolves', () => {
  it.each([0, 500])('pair → gestor (%i ms/call); fresh read answers, loader select(*) hangs; after 60 s new Retry → ready', async (lat) => {
    s.lat = lat;
    setup(); await tick(3000);
    s.roles = ['gestor']; focus(); await tick(3000);
    expect(screen.getByText('Sessão de acesso pausada')).toBeTruthy();
    s.hangStar = true; // fresh select(user_id,organization_id,ativo) answers; only loader select('*') never resolves
    retry(); await tick(60000);
    expect(s.hangStar).toBe(false);
    expect(loadingText()).toBeNull();
    expect(screen.queryByText('Contas a receber')).toBeNull();
    // Transport is back: revalidateAuthz (Retry) is not swallowed by a stuck single-flight.
    act(() => s.auth!.revalidateAuthz()); await tick(4000);
    expect(s.auth!.authzReady).toBe(true);
    expect(loadingText()).toBeNull();
    expect(screen.getByText('Contas a receber')).toBeTruthy();
  });
});

describe('company admin latency: 3 s probes stay valid; 8 s probe is the expected fail-closed pause', () => {
  it('admin at /financeiro/receber: 3 s single-RTT probe for 3 min no pause; 8 s pauses with numeric diag; Retry recovers', async () => {
    s.roles = ['administrador']; s.lat = 1500;
    setup(); await tick(6000);
    s.lat = 3000; // the probe is now one RTT: 3 s/call = 3 s probe
    expect(screen.getByText('Contas a receber')).toBeTruthy();
    for (let i = 0; i < 18; i++) { await tick(10000); expect(screen.queryByText('Sessão de acesso pausada')).toBeNull(); }
    expect(screen.getByText('Contas a receber')).toBeTruthy();
    expect(readAuthzDiagnostics().some(d => d.event === 'expire')).toBe(false); // ~3 s probes: no undue pause
    clearAuthzDiagnostics();
    s.lat = 8000; await tick(40000);
    expect(screen.getByText('Sessão de acesso pausada')).toBeTruthy();
    const exp = readAuthzDiagnostics().filter(d => d.event === 'expire').at(-1)!;
    expect(exp.reason).toBe('timeout');
    // Expected safe failure: a probe round-trip >= lease/2 (7.5 s) was observed, so no
    // renewal can be answered inside a 15 s lease measured from request start.
    expect(readAuthzDiagnostics().some(d => (d.event === 'response' || d.event === 'expire') && (d.rttMs ?? 0) >= 7500)).toBe(true);
    expect(JSON.stringify(readAuthzDiagnostics())).not.toMatch(/0000-4000|administrador/);
    s.lat = 500; retry(); await tick(8000);
    expect(loadingText()).toBeNull();
    expect(screen.getByText('Contas a receber')).toBeTruthy();
  });
});
