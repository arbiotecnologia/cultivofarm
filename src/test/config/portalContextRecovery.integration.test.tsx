// Active policy scaffolding: fail ONLY the first fresh profile transport (503), exhausting
// the automatic attempt before manual Retry; all subsequent transport and security assertions are unchanged.
// Real AuthProvider/monitor/probe/ProtectedRoutes/RoleGuard/AppPortalGuard/AppLayout/MobileLayout.
// Only Supabase transport (per-call latency), session events and shell widgets are fake: not JWT/RLS.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({
  uid: '00000000-0000-4000-8000-000000000001', org: '00000000-0000-4000-8000-000000000002',
  autoFreshFailures: 0, roles: ['gestor', 'consultor_tecnico'] as string[], lat: 0, authListener: undefined as undefined | ((e: string, x: { user: { id: string } } | null) => void),
  contextsMode: 'valid' as 'valid' | 'error' | 'denied' | 'hold' | 'never', contextRelease: undefined as undefined | (() => void), contextsCalls: 0, hangNext: '' as string, h15: 0, holdNext: '' as string, hangSkip: 0, hangStar: false, auth: undefined as undefined | { authzReady: boolean; revalidateAuthz: () => void }, release: undefined as undefined | (() => void),
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
  const run = () => (t === 'profiles' && cols.includes('user_id, organization_id, ativo') && s.autoFreshFailures++ === 0 ? Promise.resolve({ data: null, error: { status: 503, message: 'controlled automatic fresh-read failure' } }) : null) ?? (t === 'profiles' && cols === '*' && s.hangStar ? (s.hangStar = false, new Promise<never>(() => {})) : null) ?? later(() => t === 'profiles'
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
vi.mock('@/hooks/usePushSubscription', () => ({ usePushSubscription: () => ({ isSupported: false, subscription: null, deliveryAvailable: false, unsubscribe: () => {}, isLoading: false }) }));
vi.mock('@/hooks/useEntitlements', () => ({ useEntitlements: () => ({ status: 'ready', features: new Set(['ordens_producao', 'estoque_embalagens', 'contas_receber']) }) }));
vi.mock('@/components/app/OfflineIndicator', () => ({ OfflineIndicator: () => null }));
vi.mock('@/components/app/PendingMediaRecovery', () => ({ PendingMediaRecovery: () => null }));
vi.mock('@/components/ui/sidebar', () => ({ SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, SidebarTrigger: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: s.uid } } }, error: null }),
    onAuthStateChange: (l: typeof s.authListener) => { s.authListener = l; return { data: { subscription: { unsubscribe() { s.authListener = undefined; } } } }; }, signOut: async () => {} },
  from: (t: string) => chain(t),
  rpc: (name: string, args?: { _role: string }) => {
    if (name === 'get_my_available_portal_contexts') {
      s.contextsCalls++;
      if (s.contextsMode === 'never') { const p = new Promise<never>(() => {}); return Object.assign(p, { abortSignal: () => p }); }
      if (s.contextsMode === 'hold') { const p = new Promise<unknown>(resolve => { s.contextRelease = () => resolve({ data: { has_technical_access: true, available_contexts: ['technical'] }, error: null }); }); return Object.assign(p, { abortSignal: () => p }); }
    }
    const p = later(() => {
      if (name === 'get_my_available_portal_contexts') {
        if (s.contextsMode === 'error') return { data: null, error: { code: 'fetch_failed' } };
        const tech = s.contextsMode !== 'denied' && s.roles.some(r => ['tecnico_agronomo', 'consultor_tecnico', 'aplicador'].includes(r)); const adm = s.roles.some(r => ['gestor', 'administrador'].includes(r));
        return { data: { available_contexts: [...(adm ? ['admin'] : []), ...(tech ? ['technical'] : [])], has_technical_access: adm || tech, is_admin: adm, has_b2b_access: adm, must_select_context: adm && tech }, error: null };
      }
      if (name === 'has_role') return { data: s.roles.includes(args?._role ?? ''), error: null };
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
import MobilePerfil from '@/pages/app/MobilePerfil';
import { useAvailableContexts } from '@/hooks/useAvailableContexts';
import { readAuthzDiagnostics, clearAuthzDiagnostics } from '@/lib/authz/localDiagnostics';

function Url() { return <output data-testid="url">{useLocation().pathname}</output>; }
function NestedContextReader() {
  const { data } = useAvailableContexts();
  return data?.available_contexts.includes('technical') ? <span>Técnico campo</span> : null;
}
function setup(path = '/financeiro/receber', child: React.ReactNode = <span>Técnico campo</span>, appGuard = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><AuthProvider><AuthSpy /><MemoryRouter initialEntries={[path]}><Url /><Routes>
    <Route element={<ProtectedRoutes />}>
      <Route path="/financeiro/receber" element={<RoleGuard><span>Contas a receber</span></RoleGuard>} />
    </Route>
    <Route element={appGuard ? <AppPortalGuard /> : <Outlet />}><Route element={<MobileLayout />}><Route path="/app" element={child} /><Route path="/app/perfil" element={<MobilePerfil />} /></Route></Route>
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
  s.autoFreshFailures = 0; s.contextsMode = 'valid'; s.contextRelease = undefined; s.contextsCalls = 0; s.autoFreshFailures = 0; s.roles = ['gestor', 'consultor_tecnico']; s.lat = 500; s.hangNext = ''; s.hangSkip = 0; s.hangStar = false; s.holdNext = ''; s.release = undefined; s.org = '00000000-0000-4000-8000-000000000002'; s.h15 = 0; s.authListener = undefined; localStorage.clear(); clearAuthzDiagnostics();
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => { cleanup(); focusManager.setFocused(undefined); vi.useRealTimers(); vi.restoreAllMocks(); });


describe('real provider + contexts query + app guard + mobile: uncertainty is not denial', () => {
  it.each([['gestor'], ['gestor', 'consultor_tecnico'], ['consultor_tecnico'], ['administrador']])('MobileLayout independently enforces canonical list for %j', async (...roles) => {
    s.roles = roles; setup('/app/perfil', undefined, false); await tick(4000);
    const allowed = roles.includes('consultor_tecnico') || roles.includes('administrador');
    expect(screen.getByTestId('url').textContent).toBe(allowed ? '/app/perfil' : '/sem-permissao');
    expect(!!screen.queryByText('Meu Perfil')).toBe(allowed);
  });
  it.each([['gestor'], ['gestor', 'consultor_tecnico'], ['consultor_tecnico'], ['administrador']])('real RPC semantics with roles %j at Perfil', async (...roles) => {
    s.roles = roles; setup('/app/perfil'); await tick(4000);
    const allowed = roles.includes('consultor_tecnico') || roles.includes('administrador');
    expect(screen.getByTestId('url').textContent).toBe(allowed ? '/app/perfil' : '/sem-permissao');
    expect(!!screen.queryByText('Meu Perfil')).toBe(allowed);
  });
  it.each(['consultor_tecnico', 'gestor'])('Perfil real: remove %s, pause, Retry and remaining role only', async removed => {
    setup('/app/perfil'); await tick(4000); expect(screen.getByText('Meu Perfil')).toBeTruthy();
    s.roles = s.roles.filter(r => r !== removed); focus(); await tick(3000);
    expect(screen.getByText('Sessão de acesso pausada')).toBeTruthy();
    expect(screen.queryByText('Meu Perfil')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar Ocorrência' })).toBeNull();
    retry(); await tick(8000);
    const allowed = removed === 'gestor';
    expect(screen.getByTestId('url').textContent).toBe(allowed ? '/app/perfil' : '/sem-permissao');
    expect(!!screen.queryByText('Meu Perfil')).toBe(allowed);
    expect(!!screen.queryByRole('button', { name: 'Registrar Ocorrência' })).toBe(allowed);
  });
  it.each(['default-reader', 'mobile-perfil'])('%s stabilizes after load, focus and epoch without mount-refetch loop', async kind => {
    const label = kind === 'mobile-perfil' ? 'Meu Perfil' : 'Técnico campo';
    const qc = setup('/app', kind === 'mobile-perfil' ? <MobilePerfil /> : <NestedContextReader />);
    await tick(12000);
    expect(s.contextsCalls).toBeLessThan(5);
    expect(screen.getByText(label)).toBeTruthy();
    let calls = s.contextsCalls;
    s.contextsMode = 'hold';
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await tick(100);
    expect(screen.queryByText(label)).toBeNull();
    expect(screen.getByTestId('url').textContent).toBe('/app');
    s.contextsMode = 'valid'; s.contextRelease?.(); await tick(12000);
    expect(s.contextsCalls - calls).toBeGreaterThan(0);
    expect(s.contextsCalls - calls).toBeLessThan(5);
    expect(screen.getByText(label)).toBeTruthy();
    calls = s.contextsCalls;
    s.contextsMode = 'hold'; tokenRefreshed(); await tick(4000);
    expect(screen.queryByText(label)).toBeNull();
    s.contextsMode = 'valid'; s.contextRelease?.(); await tick(12000);
    expect(s.contextsCalls - calls).toBeGreaterThan(0);
    expect(s.contextsCalls - calls).toBeLessThan(5);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByTestId('url').textContent).toBe('/app');
    qc.clear();
  });
  it('epoch cleanup pending → valid with context pending → valid keeps /app', async () => {
    const qc = setup('/app'); await tick(3000);
    expect(screen.getByText('Técnico campo')).toBeTruthy();
    s.contextsMode = 'hold'; tokenRefreshed(); await tick(4000);
    expect(screen.queryByText('Técnico campo')).toBeNull();
    expect(screen.getByTestId('url').textContent).toBe('/app');
    s.contextRelease?.(); s.contextsMode = 'valid'; await tick(3000);
    expect(screen.getByText('Técnico campo')).toBeTruthy(); qc.clear();
  });
  it('invalidated query error hides cached grant; canonical retry recovers without navigation', async () => {
    const qc = setup('/app'); await tick(3000);
    s.contextsMode = 'error'; act(() => { void qc.invalidateQueries({ queryKey: ['available-portal-contexts'] }); }); await tick(4000);
    expect(screen.queryByText('Técnico campo')).toBeNull();
    expect(screen.getByTestId('url').textContent).toBe('/app');
    s.contextsMode = 'valid'; retry(); await tick(4000);
    expect(screen.getByText('Técnico campo')).toBeTruthy();
  });
  it('pending query → explicit negative remains a definitive technical denial', async () => {
    s.contextsMode = 'error'; setup('/app'); await tick(5000);
    expect(screen.getByTestId('url').textContent).toBe('/app');
    s.contextsMode = 'denied'; retry(); await tick(3000);
    expect(screen.getByTestId('url').textContent).toBe('/sem-permissao');
    expect(screen.queryByText('Técnico campo')).toBeNull();
  });
  it('never-resolve contexts settles hidden and allows a fresh retry; old bytes never authorize', async () => {
    s.contextsMode = 'never'; setup('/app'); await tick(40000);
    expect(screen.getByTestId('url').textContent).toBe('/app');
    expect(screen.queryByText('Técnico campo')).toBeNull();
    s.contextsMode = 'valid'; retry(); await tick(4000);
    expect(screen.getByText('Técnico campo')).toBeTruthy();
  });
  it.each(['gestor', 'consultor_tecnico'])('remove %s during timeout then Retry honors only fresh remaining access', async removed => {
    setup('/app'); await tick(3000);
    s.lat = 16000; focus(); await tick(40000);
    expect(screen.queryByText('Técnico campo')).toBeNull();
    s.roles = s.roles.filter(r => r !== removed); s.lat = 500;
    // Let the bounded slow automatic Retry settle before the explicit Retry.
    // Concurrent manual clicks intentionally coalesce into that existing flight.
    await tick(22000);
    act(() => s.auth?.revalidateAuthz()); await tick(8000);
    expect(screen.getByTestId('url').textContent).toBe(removed === 'gestor' ? '/app' : '/sem-permissao');
    expect(!!screen.queryByText('Técnico campo')).toBe(removed === 'gestor');
  });
  it('late old-epoch context grant after revoke cannot reopen technical content', async () => {
    setup('/app'); await tick(3000);
    s.contextsMode = 'hold'; tokenRefreshed(); await tick(4000);
    const old = s.contextRelease;
    s.roles = ['gestor']; s.contextsMode = 'valid'; focus(); await tick(3000);
    act(() => s.auth?.revalidateAuthz()); await tick(8000);
    old?.(); await tick(3000);
    expect(screen.queryByText('Técnico campo')).toBeNull();
    expect(screen.getByTestId('url').textContent).toBe('/sem-permissao');
  });
});
