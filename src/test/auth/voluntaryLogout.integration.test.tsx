// Logout voluntário vs pausa real (scaffold copiado de retryLoadingRace). Transporte falso: não prova JWT/RLS.
// Active policy scaffolding: fail ONLY the first fresh profile transport (503), exhausting
// the automatic attempt before manual Retry; all subsequent transport and security assertions are unchanged.
// Real AuthProvider/monitor/probe/ProtectedRoutes/RoleGuard/AppPortalGuard/AppLayout/MobileLayout.
// Only Supabase transport (per-call latency), session events and shell widgets are fake: not JWT/RLS.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({
  uid: '00000000-0000-4000-8000-000000000001', org: '00000000-0000-4000-8000-000000000002',
  autoFreshFailures: 0, roles: ['gestor', 'consultor_tecnico'] as string[], lat: 0, authListener: undefined as undefined | ((e: string, x: { user: { id: string } } | null) => void),
  hangNext: '' as string, h15: 0, holdNext: '' as string, hangSkip: 0, hangStar: false, auth: undefined as undefined | { authzReady: boolean; authzSigningOut: boolean; revalidateAuthz: () => void; signOut: () => Promise<void>; user: { id: string } | null }, release: undefined as undefined | (() => void), signOutImpl: (() => Promise.resolve({ error: null })) as (...a: unknown[]) => Promise<unknown>,
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
  const run = () => (t === 'profiles' && cols === 'user_id, organization_id, ativo' && s.autoFreshFailures++ === 0 ? Promise.resolve({ data: null, error: { status: 503, message: 'controlled automatic fresh-read failure' } }) : null) ?? (t === 'profiles' && cols === '*' && s.hangStar ? (s.hangStar = false, new Promise<never>(() => {})) : null) ?? later(() => t === 'profiles'
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
    onAuthStateChange: (l: typeof s.authListener) => { s.authListener = l; return { data: { subscription: { unsubscribe() { s.authListener = undefined; } } } }; }, signOut: (...a: unknown[]) => s.signOutImpl(...a) },
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
import { installInternalActorContextAdapter } from '../config/helpers/internalActorContextAdapter';
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


const PAUSED = 'Sessão de acesso pausada';
const LEAVING = 'Saindo da sua conta…';
beforeEach(() => { vi.useFakeTimers(); s.roles = ['gestor', 'consultor_tecnico']; s.autoFreshFailures = 1; s.signOutImpl = () => Promise.resolve({ error: null }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const signedOut = () => act(() => { s.authListener?.('SIGNED_OUT', null); });

describe('logout voluntário não exibe "sessão pausada"', () => {
  it('logout lento: oculta conteúdo e mostra "Saindo", nunca pausa', async () => {
    let finish!: () => void;
    s.signOutImpl = () => new Promise(r => { finish = () => r({ error: null }); });
    setup(); await tick(3000);
    expect(screen.getByText('Contas a receber')).toBeTruthy();
    let p!: Promise<void>; act(() => { p = s.auth!.signOut(); }); await tick(20000);
    expect(screen.queryByText('Contas a receber')).toBeNull();
    expect(screen.queryByText(PAUSED)).toBeNull();
    expect(screen.getByText(LEAVING)).toBeTruthy();
    expect(s.auth!.authzReady).toBe(false);
    finish(); signedOut(); await act(async () => { await p; }); await tick(500);
    expect(screen.queryByText(PAUSED)).toBeNull();
    expect(s.auth!.authzSigningOut).toBe(false);
  });

  it('evento SIGNED_OUT encerra a marca de saída', async () => {
    setup(); await tick(3000);
    act(() => { void s.auth!.signOut(); }); signedOut(); await tick(500);
    expect(s.auth!.user).toBeNull();
    expect(s.auth!.authzSigningOut).toBe(false);
    expect(screen.queryByText(PAUSED)).toBeNull();
    expect(screen.queryByText('Contas a receber')).toBeNull();
  });

  it('logout rejeitado (error): volta ao estado honesto de pausa, sem conteúdo', async () => {
    s.signOutImpl = () => Promise.resolve({ error: { status: 500, message: 'x' } });
    setup(); await tick(3000);
    await act(async () => { await s.auth!.signOut(); }); await tick(500);
    expect(s.auth!.authzSigningOut).toBe(false);
    expect(screen.queryByText(LEAVING)).toBeNull();
    expect(screen.queryByText('Contas a receber')).toBeNull();
    expect(screen.getByText(PAUSED)).toBeTruthy();
  });

  it('logout que lança exceção: propaga e limpa a marca', async () => {
    s.signOutImpl = () => Promise.reject(new Error('net'));
    setup(); await tick(3000);
    await act(async () => { await expect(s.auth!.signOut()).rejects.toThrow('net'); }); await tick(500);
    expect(s.auth!.authzSigningOut).toBe(false);
    expect(screen.queryByText('Contas a receber')).toBeNull();
  });

  it('troca de usuário durante logout: marca não vale para a nova identidade', async () => {
    s.signOutImpl = () => new Promise(() => {});
    setup(); await tick(3000);
    act(() => { void s.auth!.signOut(); }); await tick(100);
    expect(s.auth!.authzSigningOut).toBe(true);
    s.uid = '00000000-0000-4000-8000-0000000000bb';
    act(() => { s.authListener?.('SIGNED_IN', { user: { id: s.uid } }); }); await tick(3000);
    expect(s.auth!.user?.id).toBe(s.uid);
    expect(s.auth!.authzSigningOut).toBe(false);
    expect(screen.queryByText(LEAVING)).toBeNull();
    s.uid = '00000000-0000-4000-8000-000000000001';
  });

  it('pausa real (perda de papel) continua visível como pausa', async () => {
    s.autoFreshFailures = 0;
    setup(); await tick(3000);
    s.roles = ['consultor_tecnico']; focus(); await tick(3000);
    expect(screen.getByText(PAUSED)).toBeTruthy();
    expect(screen.queryByText(LEAVING)).toBeNull();
    expect(s.auth!.authzSigningOut).toBe(false);
  });
});
