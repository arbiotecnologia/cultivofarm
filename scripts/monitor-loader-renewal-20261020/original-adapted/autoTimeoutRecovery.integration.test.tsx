// Real AuthProvider + real monitor + real internalContextProbe + real boundary;
// fake transport latency and fake clock. Not hosted JWT/RLS nor browser proof.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import { installInternalActorContextAdapter } from '@/test/config/helpers/internalActorContextAdapter';
installInternalActorContextAdapter(fakeSupabaseClient, () => s.uid, (_uid, role) => s.roles.includes(role));
import { AuthzEpochBoundary } from '@/components/authz/AuthzEpochBoundary';

function Probe() { const { roles, checkAuthzAccess } = useAuth(); return <span>Conteúdo sensível [{checkAuthzAccess() ? 'ok' : 'no'}] {roles.join('+')}</span>; }
const adv = async (ms: number) => { for (let t = 0; t < ms; t += 250) await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(250, ms - t)); }); };
const paused = () => screen.queryByText('Sessão de acesso pausada');
const content = () => screen.queryByText(/Conteúdo sensível \[ok\]/);
const mount = () => render(<QueryClientProvider client={new QueryClient()}><AuthProvider><AuthzEpochBoundary><Probe /></AuthzEpochBoundary></AuthProvider></QueryClientProvider>);

/** Spike: every call started in the next `ms` takes > lease. */
async function spike(ms = 16_000) { s.perCall = ms; await adv(16_500); s.perCall = 50; }
async function settledValid() { mount(); await adv(10_000); expect(content()).toBeTruthy(); }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  s.roles = ['gestor', 'consultor_tecnico']; s.active = true; s.perCall = 50; s.probes = 0;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('bounded auto-recovery of a transient timeout (pair scope)', () => {
  it('spike > lease then healthy: hidden while paused, reopens only after a NEW observation, no click', async () => {
    await settledValid();
    await spike();
    expect(content()).toBeNull();               // hidden at expiry; the late answer did not reopen
    const before = s.probes;
    await adv(20_000);
    expect(s.probes).toBeGreaterThan(before);   // a fresh probe was required
    expect(content()).toBeTruthy();
  });

  it('repeated timeouts stop: ends paused with operative Retry, no indefinite load', async () => {
    await settledValid();
    s.perCall = 16_000;
    await adv(180_000);
    expect(paused()).toBeTruthy();
    const frozen = s.probes;
    await adv(180_000);
    expect(s.probes).toBe(frozen);              // no loop
    s.perCall = 50;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await adv(5_000);
    expect(content()).toBeTruthy();
  });

  it('budget is not renewed by a short-lived recovery (timeout → ok → timeout within 60 s stays paused)', async () => {
    await settledValid();
    await spike(); await adv(20_000); expect(content()).toBeTruthy();
    await spike(); await adv(20_000); expect(content()).toBeTruthy(); // 2nd and last attempt
    await spike(); await adv(60_000);
    expect(paused()).toBeTruthy();
  });

  it('revocation during backoff stays denied and is not retried again', async () => {
    await settledValid();
    s.perCall = 16_000; await adv(16_500);      // expire (timeout)
    s.roles = []; s.perCall = 50;               // revoked before the auto attempt
    await adv(30_000);
    expect(content()).toBeNull();
    expect(paused()).toBeTruthy();
    const frozen = s.probes;
    await adv(60_000);
    expect(s.probes).toBe(frozen);
  });

  it('inactive profile during backoff stays denied', async () => {
    await settledValid();
    s.perCall = 16_000; await adv(16_500);
    s.active = false; s.perCall = 50;
    await adv(60_000);
    expect(content()).toBeNull();
  });

  it('ineligible (partial revocation) is never auto-recovered', async () => {
    await settledValid();
    s.roles = ['gestor', 'consultor_tecnico', 'financeiro']; // unreviewed superset
    await adv(15_000);
    expect(paused()).toBeTruthy();
    s.roles = ['gestor', 'consultor_tecnico'];   // restored, but only a manual Retry may re-check
    const frozen = s.probes;
    await adv(60_000);
    expect(s.probes).toBe(frozen);
    expect(paused()).toBeTruthy();
  });

  it('manual Retry during backoff: single-flight, timer cancelled', async () => {
    await settledValid();
    s.perCall = 16_000;
    for (let i = 0; i < 80 && !paused(); i++) await adv(250); // inside backoff window
    expect(paused()).toBeTruthy();
    s.perCall = 50;
    const before = s.probes;
    const btn = screen.getByRole('button', { name: 'Tentar novamente' });
    fireEvent.click(btn); fireEvent.click(btn);
    await adv(10_000);
    expect(content()).toBeTruthy();
    expect(s.probes - before).toBeLessThanOrEqual(3);
  });

  it('never-resolving transport during auto attempt is bounded and ends paused', async () => {
    await settledValid();
    s.perCall = 10_000_000;
    await adv(200_000);
    expect(paused()).toBeTruthy();
    expect(screen.queryByText('Verificando seu acesso')).toBeNull();
  });

  it('TOKEN_REFRESHED during backoff: no stale reopen; revoked stays denied', async () => {
    await settledValid();
    s.perCall = 16_000; await adv(16_500);
    s.perCall = 50; s.roles = [];
    await act(async () => { s.authCb?.('TOKEN_REFRESHED', { user: { id: s.uid } }); });
    await adv(40_000);
    expect(content()).toBeNull();
  });

  it('unmount during backoff cancels the timer', async () => {
    const { unmount } = mount(); await adv(10_000);
    s.perCall = 16_000; await adv(16_500);
    unmount();
    const frozen = s.probes;
    s.perCall = 50;
    await adv(30_000);
    expect(s.probes).toBe(frozen);
  });
});
