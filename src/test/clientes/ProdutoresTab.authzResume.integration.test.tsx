// AuthProvider real + monitor real + probe interno real + AuthzEpochBoundary real
// + ProdutoresTab real; transporte e relógio simulados. Não é JWT/RLS/browser real.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({
  uid: '00000000-0000-4000-8000-000000000001', org: '00000000-0000-4000-8000-000000000002',
  roles: ['administrador'] as string[], active: true, perCall: 50, probes: 0, clientReads: 0,
  rows: [] as Record<string, unknown>[],
  authCb: null as null | ((e: string, sess: unknown) => void),
}));
const later = <T,>(v: () => T) => { const ms = s.perCall; return new Promise<T>(r => setTimeout(() => r(v()), ms)); };
vi.mock('@/lib/authz/authzEpochGate', () => ({ AUTHZ_CACHE_FOUNDATION_ENABLED: true, AUTHZ_CACHE_ROLLOUT_SCOPE: 'b2b-context', MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED: true, FINANCIAL_CONTEXT_MONITOR_ENABLED: true, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: true, PRODUCER_CONTEXT_MONITOR_ENABLED: false, CONSULTANT_CONTEXT_MONITOR_ENABLED: true, OPERATOR_CONTEXT_MONITOR_ENABLED: false }));
vi.mock('@/lib/portalBroadcast', () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/clientes/ClienteHistoricoDialog', () => ({ ClienteHistoricoDialog: () => null }));
vi.mock('@/components/clientes/ClienteFormTabs', () => ({ ClienteFormTabs: ({ initialTab, onTabChange }: { initialTab?: string; onTabChange?: (t: string) => void }) => {
  const { register } = useFormContext();
  return <div>
    <span data-testid="tab">{initialTab === 'documentos' ? 'documentos' : 'geral'}</span>
    <button type="button" onClick={() => onTabChange?.('documentos')}>Aba Documentos</button>
    <button type="button" onClick={() => onTabChange?.('financeiro')}>Aba Financeiro</button>
    <input aria-label="Nome fantasia" {...register('nome_fantasia')} />
  </div>;
} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: s.uid } } }, error: null }),
    onAuthStateChange: (cb: (e: string, sess: unknown) => void) => { s.authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async () => {},
  },
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    for (const n of ['select', 'eq', 'in', 'order', 'abortSignal', 'filter', 'not', 'single']) q[n] = () => q;
    const run = () => later(() => t === 'profiles'
      ? { data: { user_id: s.uid, organization_id: s.org, ativo: s.active, senha_provisoria: false, nome: 'B' }, error: null }
      : t === 'clientes' ? (s.clientReads++, { data: s.rows, error: null })
      : { data: s.roles.map(role => ({ role })), error: null });
    q.maybeSingle = run; q.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => run().then(f, r);
    return q;
  },
  rpc: (name: string) => { if (name === 'h15_actor_organization') s.probes++; return later(() => ({ data: s.org, error: null })); },
} }));
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { supabase as fakeSupabaseClient } from '@/integrations/supabase/client';
import { installInternalActorContextAdapter } from '../config/helpers/internalActorContextAdapter';
installInternalActorContextAdapter(fakeSupabaseClient, () => s.uid, (_uid, role) => s.roles.includes(role));
import { AuthzEpochBoundary } from '@/components/authz/AuthzEpochBoundary';
import ProdutoresTab from '@/pages/clientes/ProdutoresTab';
import { __peekResumeForTests, clearResume } from '@/lib/navigation/protectedResumeContext';

let signOutRef: (() => Promise<void>) | null = null;
function SignOutHook() { const { signOut } = useAuth(); signOutRef = signOut; return null; }
const adv = async (ms: number) => { for (let t = 0; t < ms; t += 250) await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(250, ms - t)); }); };
const paused = () => screen.queryByText('Sessão de acesso pausada');
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><AuthProvider><SignOutHook /><AuthzEpochBoundary><ProdutoresTab /></AuthzEpochBoundary></AuthProvider></QueryClientProvider></MemoryRouter>);
const tab = () => screen.queryByTestId('tab')?.textContent ?? null;
const ROW = { id: 'C1', nome: 'Cliente 1', nome_fantasia: 'Cliente 1', status_cliente: 'ativo', telefones: [], tags: [] };

async function openDocs(tabName = 'Aba Documentos') {
  mount(); await adv(10_000);
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  fireEvent.click(screen.getByRole('button', { name: tabName }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Nome fantasia' }), { target: { value: 'RASCUNHO_SENSIVEL' } });
}
const timeoutPause = async () => { s.perCall = 16_000; await adv(16_500); s.perCall = 50; };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  clearResume(); s.roles = ['administrador']; s.active = true; s.perCall = 50; s.probes = 0; s.clientReads = 0; s.rows = [ROW];
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('retomada /clientes: somente timeout confirmado do monitor', () => {
  it('timeout -> mesmo principal recupera: conteúdo ausente na pausa, releitura, reabre Documentos sem rascunho', async () => {
    await openDocs();
    await adv(150_000); // modal aberto > TTL: TTL conta da pausa, não da abertura
    await timeoutPause();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Cliente 1')).toBeNull();
    expect(__peekResumeForTests()?.pausedAt).not.toBeNull();
    const reads = s.clientReads;
    await adv(25_000); // auto-recovery canônica existente (sem novo probe/cadência)
    expect(paused()).toBeNull();
    expect(tab()).toBe('documentos');
    expect(screen.getByRole('textbox', { name: 'Nome fantasia' })).toHaveValue('Cliente 1');
    expect(s.clientReads).toBeGreaterThan(reads);
    expect(JSON.stringify(__peekResumeForTests())).not.toContain('RASCUNHO');
  });

  it('aba diferente de Documentos não é retomada', async () => {
    await openDocs('Aba Financeiro');
    await timeoutPause(); await adv(25_000);
    expect(paused()).toBeNull();
    expect(tab()).toBeNull();
  });

  it('ineligible com papéis em cache iguais e depois restaurado: não retoma', async () => {
    await openDocs();
    s.roles = ['administrador', 'financeiro']; // revogação/alteração observada pelo probe
    await adv(15_000);
    expect(paused()).toBeTruthy();
    expect(__peekResumeForTests()).toBeNull();
    s.roles = ['administrador'];
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await adv(15_000);
    expect(tab()).toBeNull();
  });

  it('cliente negado/removido na releitura: não reapresenta', async () => {
    await openDocs();
    await timeoutPause();
    s.rows = [];
    await adv(25_000);
    expect(paused()).toBeNull();
    expect(tab()).toBeNull();
    expect(__peekResumeForTests()).toBeNull();
  });

  it('revogação de papel durante a pausa: não retoma', async () => {
    await openDocs();
    await timeoutPause();
    s.roles = [];
    await act(async () => { s.authCb?.('TOKEN_REFRESHED', { user: { id: s.uid } }); });
    await adv(40_000);
    expect(tab()).toBeNull();
    expect(__peekResumeForTests()).toBeNull();
  });

  it('logout durante a pausa descarta', async () => {
    await openDocs();
    await timeoutPause();
    await act(async () => { await signOutRef?.(); });
    expect(__peekResumeForTests()).toBeNull();
  });

  it('A -> B -> A durante a pausa descarta', async () => {
    await openDocs();
    await timeoutPause();
    const a = s.uid;
    s.uid = '00000000-0000-4000-8000-0000000000bb';
    await act(async () => { s.authCb?.('SIGNED_IN', { user: { id: s.uid } }); });
    await adv(10_000);
    s.uid = a;
    await act(async () => { s.authCb?.('SIGNED_IN', { user: { id: s.uid } }); });
    await adv(30_000);
    expect(tab()).toBeNull();
  });
});
