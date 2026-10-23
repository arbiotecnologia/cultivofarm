// Regressão real pós-C2: pausa transitória (timeout de RTT ~10s) incrementava
// authzEpoch e remontava /configuracoes — aba voltava a "Meu perfil pessoal" e
// o modal de edição perdia o rascunho. AuthProvider real + monitor real +
// boundary real; transporte e relógio simulados. Não é prova JWT/RLS hosted.
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({
  uid: '00000000-0000-4000-8000-000000000001', org: '00000000-0000-4000-8000-000000000002',
  roles: ['gestor', 'consultor_tecnico'] as string[], active: true, perCall: 50, probes: 0,
  authCb: null as null | ((e: string, sess: unknown) => void),
}));
const later = <T,>(v: () => T) => { const ms = s.perCall; return new Promise<T>(r => setTimeout(() => r(v()), ms)); };
vi.mock('@/lib/authz/authzEpochGate', () => ({ AUTHZ_CACHE_FOUNDATION_ENABLED: true, AUTHZ_CACHE_ROLLOUT_SCOPE: 'b2b-context', MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED: true, FINANCIAL_CONTEXT_MONITOR_ENABLED: true, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: true, PRODUCER_CONTEXT_MONITOR_ENABLED: false, CONSULTANT_CONTEXT_MONITOR_ENABLED: true, OPERATOR_CONTEXT_MONITOR_ENABLED: false }));
vi.mock('@/lib/portalBroadcast', () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: s.uid } } }, error: null }),
    onAuthStateChange: (cb: (e: string, sess: unknown) => void) => { s.authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async () => {},
  },
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    for (const n of ['select', 'eq', 'in', 'order', 'abortSignal']) q[n] = () => q;
    const run = () => later(() => t === 'profiles'
      ? { data: { user_id: s.uid, organization_id: s.org, ativo: s.active, senha_provisoria: false, nome: 'B' }, error: null }
      : { data: s.roles.map(role => ({ role })), error: null });
    q.maybeSingle = run; q.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => run().then(f, r);
    return q;
  },
  rpc: (name: string) => { if (name === 'h15_actor_organization') s.probes++; return later(() => ({ data: s.org, error: null })); },
} }));
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { supabase as fakeSupabaseClient } from '@/integrations/supabase/client';
import { installInternalActorContextAdapter } from './helpers/internalActorContextAdapter';
installInternalActorContextAdapter(fakeSupabaseClient, () => s.uid, (_uid, role) => s.roles.includes(role));
import { AuthzEpochBoundary } from '@/components/authz/AuthzEpochBoundary';

function Probe() {
  const { roles, checkAuthzAccess, authzEpoch } = useAuth();
  return <span>Conteúdo sensível [{checkAuthzAccess() ? 'ok' : 'no'}] {roles.join('+')} epoch:{authzEpoch}</span>;
}
const adv = async (ms: number) => { for (let t = 0; t < ms; t += 250) await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(250, ms - t)); }); };
const content = () => screen.queryByText(/Conteúdo sensível \[ok\]/);
const epochOf = () => {
  const el = screen.queryByText(/epoch:\d+/);
  const m = el?.textContent?.match(/epoch:(\d+)/);
  return m ? Number(m[1]) : null;
};
const mount = () => render(<QueryClientProvider client={new QueryClient()}><AuthProvider><AuthzEpochBoundary><Probe /></AuthzEpochBoundary></AuthProvider></QueryClientProvider>);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  s.roles = ['gestor', 'consultor_tecnico']; s.active = true; s.perCall = 50; s.probes = 0;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('pausa transitória não muda a época (regressão /configuracoes)', () => {
  it('timeout de ~10s com recuperação pelo MESMO fingerprint: época estável, conteúdo volta', async () => {
    mount();
    await adv(10_000);
    expect(content()).toBeTruthy();
    const before = epochOf();
    expect(before).not.toBeNull();
    // Spike de transporte: toda chamada iniciada nos próximos 16s leva > lease.
    s.perCall = 16_000;
    await adv(16_500);
    s.perCall = 50;
    expect(content()).toBeNull(); // oculto durante a pausa (fail-closed)
    await adv(20_000);            // auto-recuperação limitada revalida
    expect(content()).toBeTruthy();
    expect(epochOf()).toBe(before); // MESMA época: sem remount por época, fences estáveis
  });

  it('mudança real de fingerprint (revogação parcial do par) NÃO recupera e muda o estado', async () => {
    mount();
    await adv(10_000);
    expect(content()).toBeTruthy();
    s.perCall = 16_000;
    await adv(16_500);
    s.perCall = 50;
    s.roles = []; // revogação durante a pausa
    await adv(30_000);
    expect(content()).toBeNull(); // deny: nada reabre
    expect(screen.queryByText('Sessão de acesso pausada')).toBeTruthy();
  });

  it('duas pausas transitórias seguidas mantêm a época estável após cada recuperação', async () => {
    mount();
    await adv(10_000);
    const before = epochOf();
    for (let i = 0; i < 2; i++) {
      s.perCall = 16_000;
      await adv(16_500);
      s.perCall = 50;
      expect(content()).toBeNull();
      await adv(20_000);
      expect(content()).toBeTruthy();
      expect(epochOf()).toBe(before);
    }
  });
});
