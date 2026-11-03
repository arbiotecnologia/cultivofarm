// AuthProvider real + gates reais (produtor monitorado) + producerContextProbe real +
// MobileLogin/SelecionarPortal/AcessoPendente reais; transporte simulado. Não é JWT/RLS real.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const U = '00000000-0000-4000-8000-0000000000a1', O = '00000000-0000-4000-8000-0000000000a2', C = '00000000-0000-4000-8000-0000000000a3';
const s = vi.hoisted(() => ({ roles: ['cliente_produtor'] as string[], active: true, org: '', ids: [] as string[], rows: [] as unknown[],
  ctx: [] as string[], ctxError: false, h15Error: false, h15Org: null as string | null, calls: {} as Record<string, number> }));
// Historical producer login/h15 contract isolated from later C2 rollout.
// Real producer probe/guards are retained; current C2 has separate tests.
vi.mock('@/lib/authz/multiProfileContract',async importOriginal=>({...await importOriginal<typeof import('@/lib/authz/multiProfileContract')>(),isC2ExternalScope:()=>false}));
function chain(result: () => unknown) { const q: Record<string, unknown> = {}; for (const n of ['select', 'eq', 'in', 'filter', 'order', 'abortSignal', 'not', 'is']) q[n] = () => q; q.maybeSingle = async () => result(); q.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(result()).then(f, r); return q; }
vi.mock('@/lib/portalBroadcast', () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: '00000000-0000-4000-8000-0000000000a1' } } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {} },
  from: (t: string) => chain(() => t === 'profiles' ? { data: { user_id: '00000000-0000-4000-8000-0000000000a1', organization_id: s.org, ativo: s.active, senha_provisoria: false, nome: 'Produtor' }, error: null }
    : t === 'user_roles' ? { data: s.roles.map(role => ({ role })), error: null }
    : t === 'clientes' ? { data: s.rows, error: null } : { data: [], error: null }),
  rpc: (name: string) => { s.calls[name] = (s.calls[name] ?? 0) + 1; const p = (async () => {
    if (name === 'get_my_available_portal_contexts') return s.ctxError ? { data: null, error: { message: 'x' } } : { data: { available_contexts: s.ctx, has_technical_access: s.ctx.includes('technical'), is_admin: false }, error: null };
    if (name === 'h15_actor_organization') return s.h15Error ? { data: null, error: {} } : { data: s.h15Org ?? s.org, error: null };
    if (name === 'get_cliente_ids_for_user') return { data: s.ids, error: null };
    if (name === 'register_my_login_redirect_secure') return { data: null, error: null };
    return { data: null, error: null };
  })(); return Object.assign(p, { abortSignal: () => p }); },
} }));
import { AuthProvider } from '@/hooks/useAuth';
import MobileLogin from '@/pages/app/MobileLogin';
import SelecionarPortal from '@/pages/SelecionarPortal';
import AcessoPendente from '@/pages/AcessoPendente';

function Loc() { return <output data-testid="url">{useLocation().pathname}</output>; }
function setup(path = '/app/login') {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider><MemoryRouter initialEntries={[path]}><Loc /><Routes>
    <Route path="/app/login" element={<MobileLogin />} /><Route path="/selecionar-portal" element={<SelecionarPortal />} />
    <Route path="/acesso-pendente" element={<AcessoPendente />} /><Route path="/app" element={<div>Home produtor</div>} />
  </Routes></MemoryRouter></AuthProvider></QueryClientProvider>);
}
const tick = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); for (let i = 0; i < 10; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
const url = () => screen.getByTestId('url').textContent;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); s.roles = ['cliente_produtor']; s.active = true; s.org = O; s.ids = [C];
  s.rows = [{ id: C, organization_id: O }]; s.ctx = []; s.ctxError = false; s.h15Error = false; s.h15Org = null; s.calls = {};
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('login produtor: /app/login -> seletor -> home canônica /app', () => {
  it('produtor com vínculo/tenant/RLS válidos chega a /app, sem contexto técnico fabricado', async () => {
    setup(); await tick(); await tick(100);
    expect(url()).toBe('/app');
    expect(screen.getByText('Home produtor')).toBeTruthy();
    expect(localStorage.getItem('active_portal_context') ?? '').not.toContain('technical');
    expect(s.calls['register_my_login_redirect_secure'] ?? 0).toBe(0);
  });
  it('carga: uma leitura de contextos; probe produtor só pelo monitor existente', async () => {
    setup(); await tick(); await tick(100);
    expect(s.calls['get_my_available_portal_contexts']).toBe(1);
    expect(s.calls['get_cliente_ids_for_user']).toBe(1);
  });
  it('"Atualizar acesso" em /acesso-pendente leva o produtor válido a /app', async () => {
    setup('/acesso-pendente'); await tick(); await tick(100);
    expect(url()).toBe('/app');
  });
  for (const [name, mut] of [
    ['sem vínculo de cliente', () => { s.ids = []; s.rows = []; }],
    ['cliente de outro tenant (RLS vazio)', () => { s.rows = []; }],
    ['tenant divergente no h15', () => { s.h15Org = '00000000-0000-4000-8000-0000000000ff'; }],
  ] as const) {
    it(`negativa: ${name} não abre /app`, async () => {
      mut();
      setup(); await tick(); await tick(20_000);
      expect(url()).not.toBe('/app');
      expect(screen.queryByText('Home produtor')).toBeNull();
    });
  }
  it('negativa: papel diferente (sem cliente_produtor) não vai a /app', async () => {
    s.roles = ['aplicador_sem_portal'];
    setup(); await tick(); await tick(100);
    expect(url()).not.toBe('/app');
  });
  it('negativa: perfil inativo não abre /app', async () => {
    s.active = false;
    setup(); await tick(); await tick(20_000);
    expect(url()).not.toBe('/app');
  });
  it('indisponibilidade da leitura de contextos: erro com nova tentativa, sem acesso-pendente nem /app', async () => {
    s.ctxError = true;
    setup(); await tick(); await tick(5_000);
    expect(url()).toBe('/selecionar-portal');
    expect(screen.getByText('Não foi possível validar seus acessos')).toBeTruthy();
    s.ctxError = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await tick(100);
    expect(url()).toBe('/app');
  });
  it('indisponibilidade do probe (h15 erro): não acesso-pendente nem /app', async () => {
    s.h15Error = true;
    setup(); await tick(); await tick(100);
    expect(url()).not.toBe('/app'); expect(url()).not.toBe('/acesso-pendente');
  });
  it('produtor + contexto técnico real: segue o fluxo existente (técnico), sem desvio para /app', async () => {
    s.roles = ['cliente_produtor', 'consultor_tecnico']; s.ctx = ['technical'];
    setup(); await tick(); await tick(100);
    expect(url()).not.toBe('/acesso-pendente');
  });
});

describe('entrada direta em /acesso-pendente e escopo produtor confirmado', () => {
  const pendingText = () => screen.queryByText(/ainda não possui um portal operacional liberado/);
  it('erro na leitura de contextos: não afirma ausência de portal; Tentar novamente recupera', async () => {
    s.ctxError = true;
    setup('/acesso-pendente'); await tick(); await tick(5_000);
    expect(url()).toBe('/acesso-pendente');
    expect(pendingText()).toBeNull();
    expect(screen.getByText('Não foi possível validar seus acessos')).toBeTruthy();
    s.ctxError = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await tick(100);
    expect(url()).toBe('/app');
  });
  it('validação pendente do probe (h15 indisponível): mostra validando, nunca "sem portal"', async () => {
    s.h15Error = true;
    setup('/acesso-pendente'); await tick(); await tick(100);
    expect(pendingText()).toBeNull();
    expect(url()).not.toBe('/app');
  });
  it('papéis múltiplos com cliente_produtor e nenhum contexto: não encaminha a /app (escopo produtor não monitorado)', async () => {
    s.roles = ['cliente_produtor', 'financeiro'];
    setup('/selecionar-portal'); await tick(); await tick(100);
    expect(url()).not.toBe('/app');
    cleanup(); s.calls = {};
    setup('/acesso-pendente'); await tick(); await tick(100);
    expect(url()).not.toBe('/app');
  });
  it('sem papel algum: acesso pendente legítimo continua exibido', async () => {
    s.roles = [];
    setup('/acesso-pendente'); await tick(); await tick(100);
    expect(url()).toBe('/acesso-pendente');
  });
});
