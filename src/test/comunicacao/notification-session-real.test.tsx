import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const m = vi.hoisted(() => ({ auth: { user: { id: 'A' } as { id: string } | null, profile: { user_id: 'A', organization_id: 'OA', ativo: true }, roles: ['cliente_produtor'], loading: false }, requests: [] as { table: string; resolve: (value: unknown) => void }[], remove: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => m.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
 from: (table: string) => {
  const promise = new Promise(resolve => m.requests.push({ table, resolve }));
  const builder = { select: () => builder, eq: () => builder, filter: () => builder, in: () => builder, order: () => builder, limit: () => promise, maybeSingle: () => promise, then: promise.then.bind(promise) };
  return builder;
 }, channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; }, removeChannel: m.remove,
} }));
import { useNotificacoesUnificadas } from '@/hooks/useNotificacoesUnificadas';
import { useNotificacoesOperacionais } from '@/hooks/useNotificacoesOperacionais';
import { usePortalCliente } from '@/hooks/usePortalCliente';
function wrapper() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
const row = (id: string) => ({ id, titulo: id, tipo: 'informativo', lido: false, created_at: '2026-10-08T12:00:00Z' });
function resolve(table: string, data: unknown) { const r = m.requests.find(r => r.table === table); if (!r) throw new Error(`Missing ${table}`); m.requests.splice(m.requests.indexOf(r), 1); r.resolve({ data, error: null }); }
beforeEach(() => { m.requests = []; m.remove.mockClear(); m.auth = { user: { id: 'A' }, profile: { user_id: 'A', organization_id: 'OA', ativo: true }, roles: ['cliente_produtor'], loading: false }; });
describe('NOTIF-2 real QueryClient, only auth/server mocked', () => {
 for (const role of ['administrador', 'gestor']) it(`portal resolves linked CA for ${role} and clears selection for financeiro`, async () => {
  m.auth.roles = [role];
  const h = renderHook(() => usePortalCliente(), { wrapper: wrapper() });
  await act(async () => resolve('user_clientes', [{ cliente_id: 'CA', principal: true }]));
  await act(async () => resolve('clientes', [{ id: 'CA', nome: 'A' }]));
  await waitFor(() => expect(h.result.current.clienteId).toBe('CA'));
  expect(h.result.current.clientes.map(c => c.id)).toEqual(['CA']);
  m.auth.roles = ['financeiro']; h.rerender();
  expect(h.result.current.clienteId).toBeNull();
  expect(h.result.current.clientes).toEqual([]);
  h.unmount();
 });
 for (const kind of ['unified', 'operational'] as const) {
  const hook = kind === 'unified' ? useNotificacoesUnificadas : useNotificacoesOperacionais;
  const rows = (result: ReturnType<typeof hook>) => result.data ?? [];
  for (const change of ['identity', 'tenant'] as const) it(`${kind}: ${change} change fences late old response and cleans Realtime`, async () => {
   const h = renderHook(() => hook(), { wrapper: wrapper() });
   const old = m.requests.find(r => r.table === 'notificacoes_operacionais'); expect(old).toBeDefined();
   if (!old) return;
   m.requests.splice(m.requests.indexOf(old), 1);
   m.auth = { ...m.auth, user: { id: change === 'identity' ? 'B' : 'A' }, profile: { ...m.auth.profile, user_id: change === 'identity' ? 'B' : 'A', organization_id: 'OB' } };
   h.rerender(); expect(rows(h.result.current)).toEqual([]);
   await act(async () => resolve('notificacoes_operacionais', [row('NEW')]));
   await waitFor(() => expect(rows(h.result.current)[0]?.titulo).toBe('NEW'));
   await act(async () => old.resolve({ data: [row('OLD')], error: null }));
   expect(rows(h.result.current)[0]?.titulo).toBe('NEW'); expect(m.remove).toHaveBeenCalled();
   h.unmount();
  });
  for (const state of ['loading', 'mismatch', 'inactive', 'logout', 'revoked'] as const) it(`${kind}: hides populated cache during ${state}`, async () => {
   const h = renderHook(() => hook(), { wrapper: wrapper() });
   await act(async () => resolve('notificacoes_operacionais', [row('SECRET')]));
   await waitFor(() => expect(rows(h.result.current)).toHaveLength(1));
   if (state === 'loading') m.auth.loading = true;
   if (state === 'mismatch') m.auth.profile.user_id = 'B';
   if (state === 'inactive') m.auth.profile.ativo = false;
   if (state === 'logout') m.auth.user = null;
   if (state === 'revoked') m.auth.roles = [];
   h.rerender(); expect(rows(h.result.current)).toEqual([]); expect(h.result.current.unreadCount).toBe(0);
   expect(m.remove).toHaveBeenCalled(); h.unmount();
  });
 }
 for (const state of ['loading', 'mismatch', 'inactive', 'logout', 'revoked', 'unowned'] as const) it(`portal hides resolved selection during ${state}`, async () => {
  const h = renderHook(() => usePortalCliente(), { wrapper: wrapper() });
  await act(async () => resolve('user_clientes', [{ cliente_id: 'CA', principal: true }]));
  await act(async () => resolve('clientes', [{ id: 'CA', nome: 'A' }]));
  await waitFor(() => expect(h.result.current.clienteId).toBe('CA'));
  if (state === 'loading') m.auth.loading = true;
  if (state === 'mismatch') m.auth.profile.user_id = 'B';
  if (state === 'inactive') m.auth.profile.ativo = false;
  if (state === 'logout') m.auth.user = null;
  if (state === 'revoked') m.auth.roles = [];
  if (state === 'unowned') m.auth.profile.organization_id = '';
  h.rerender(); expect(h.result.current.clienteId).toBeNull(); expect(h.result.current.clientes).toEqual([]); h.unmount();
 });
 it('unified portal data disappears when producer role is removed despite cached rows', async () => {
  const h = renderHook(() => useNotificacoesUnificadas(), { wrapper: wrapper() });
  await act(async () => resolve('notificacoes_operacionais', []));
  await act(async () => resolve('user_clientes', [{ cliente_id: 'CA', principal: true }]));
  await act(async () => resolve('clientes', [{ id: 'CA', nome: 'A' }]));
  await waitFor(() => expect(m.requests.some(r => r.table === 'portal_notificacoes')).toBe(true));
  await act(async () => resolve('portal_notificacoes', [row('PORTAL')]));
  await waitFor(() => expect(h.result.current.all[0]?.titulo).toBe('PORTAL'));
  m.auth.roles = ['administrador']; h.rerender(); expect(h.result.current.all).toEqual([]); expect(m.remove).toHaveBeenCalled(); h.unmount();
 });
 it('portal fences late selection and role removal including remembered selection', async () => {
  const h = renderHook(() => usePortalCliente(), { wrapper: wrapper() });
  const old = m.requests.shift(); expect(old?.table).toBe('user_clientes');
  m.auth.profile = { ...m.auth.profile, organization_id: 'OB' }; h.rerender();
  await act(async () => resolve('user_clientes', [{ cliente_id: 'CB', principal: true }]));
  await act(async () => resolve('clientes', [{ id: 'CB', nome: 'B' }]));
  await waitFor(() => expect(h.result.current.clienteId).toBe('CB'));
  await act(async () => old?.resolve({ data: [{ cliente_id: 'CA', principal: true }], error: null }));
  await act(async () => resolve('clientes', [{ id: 'CA', nome: 'A' }]));
  expect(h.result.current.clienteId).toBe('CB');
  m.auth.roles = []; h.rerender(); expect(h.result.current.clienteId).toBeNull(); expect(h.result.current.clientes).toEqual([]); h.unmount();
 });
});
