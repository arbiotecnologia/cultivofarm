import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({ actor: 'actor-A', tenant: 'tenant-A', epoch: 0, ready: true, fetch: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true }, roles: ['administrador'], loading: false, authzReady: state.ready, authzEpoch: state.epoch }) }));
// Real SDK, including rpc receiver and REST builder. Only transport is synthetic.
vi.mock('@/integrations/supabase/client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient('https://swzpzcwiasxmjutrmvkm.supabase.co', 'synthetic-test-key', {
    accessToken: async () => 'synthetic-test-bearer',
    global: { fetch: (...args) => state.fetch(...args) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) };
});
import { useArchiveTenantProduct, useSaveTenantProduct, useTenantProducts } from '@/hooks/useTenantProducts';
import { supabase } from '@/integrations/supabase/client';

const clients: QueryClient[] = [];
const stamp = '2026-11-03T01:20:00Z';
const ack = { product_id: 'product-A', updated_at: stamp, replayed: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function mount<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return { ...renderHook(hook, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }), client };
}
beforeEach(() => { Object.assign(state, { actor: 'actor-A', tenant: 'tenant-A', epoch: 0, ready: true }); state.fetch.mockReset(); });
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); });
function request(index: number, name: string) {
  const [url, init] = state.fetch.mock.calls[index];
  expect(String(url)).toBe(`https://swzpzcwiasxmjutrmvkm.supabase.co/rest/v1/rpc/${name}`);
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer synthetic-test-bearer');
  expect(init.method).toBe('POST');
  return JSON.parse(init.body);
}
it('reproduz a extração sem this com SDK real, antes de qualquer fetch', async () => {
  const detached = supabase.rpc;
  expect(() => detached('tenant_product_list' as never)).toThrow(/rest/);
  expect(state.fetch).not.toHaveBeenCalled();
});
it('lista via REST autorizado preservando receiver e argumento de arquivados', async () => {
  state.fetch.mockResolvedValue(json([{ id: 'product-A', owner_organization_id: 'tenant-A', nome: 'Produto A', updated_at: stamp }]));
  const { result } = mount(() => useTenantProducts(true));
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.[0].nome).toBe('Produto A');
  expect(request(0, 'tenant_product_list')).toEqual({ p_include_archived: true });
});
it('salva via SDK real com CAS/chave originais e sem empresa no payload', async () => {
  state.fetch.mockResolvedValue(json(ack));
  const { result } = mount(useSaveTenantProduct);
  await act(async () => { expect(await result.current.mutateAsync({ id: 'product-A', draft: { nome: 'Produto A', tipo: 'solo' }, expectedUpdatedAt: stamp })).toEqual(ack); });
  expect(request(0, 'tenant_product_save')).toEqual({ p_product_id: 'product-A', p_payload: { nome: 'Produto A', tipo: 'solo' }, p_expected_updated_at: stamp, p_idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/) });
});
it('arquiva via SDK real com CAS e ACK exatos', async () => {
  state.fetch.mockResolvedValue(json(ack));
  const { result } = mount(useArchiveTenantProduct);
  await act(async () => { expect(await result.current.mutateAsync({ id: 'product-A', archived: true, expectedUpdatedAt: stamp })).toEqual(ack); });
  expect(request(0, 'tenant_product_set_archived')).toEqual({ p_product_id: 'product-A', p_archived: true, p_expected_updated_at: stamp, p_idempotency_key: expect.any(String) });
});
it('erro backend real de list/save/archive é propagado sem retry ou falsa confirmação', async () => {
  state.fetch.mockImplementation(async () => json({ code: '42501', message: 'forbidden' }, 403));
  const list = mount(() => useTenantProducts(false));
  await waitFor(() => expect(list.result.current.isError).toBe(true));
  const save = mount(useSaveTenantProduct); const archive = mount(useArchiveTenantProduct);
  await act(async () => {
    await expect(save.result.current.mutateAsync({ id: null, draft: { nome: 'Produto A', tipo: 'solo' }, expectedUpdatedAt: null })).rejects.toThrow(/permissão/);
    await expect(archive.result.current.mutateAsync({ id: 'product-A', archived: true, expectedUpdatedAt: stamp })).rejects.toThrow(/permissão/);
  });
  expect(state.fetch).toHaveBeenCalledTimes(3);
});
it('troca de ator/tenant oculta cache A e não adota resposta atrasada A nem após ABA', async () => {
  let resolveA: ((value: Response) => void) | undefined;
  state.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveA = resolve; }));
  const { result, rerender, client } = mount(() => useTenantProducts(false));
  await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
  state.actor = 'actor-B'; state.tenant = 'tenant-B'; state.epoch++;
  state.fetch.mockResolvedValue(json([{ id: 'product-B', nome: 'Produto B', owner_organization_id: 'tenant-B', updated_at: stamp }]));
  rerender(); expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(result.current.data?.[0].nome).toBe('Produto B'));
  await act(async () => { resolveA?.(json([{ id: 'product-A', nome: 'Produto A', owner_organization_id: 'tenant-A' }])); });
  expect(result.current.data?.[0].nome).toBe('Produto B');
  expect(client.getQueryCache().getAll().some(q => String(q.queryKey).includes('actor-A'))).toBe(false);
  state.actor = 'actor-A'; state.tenant = 'tenant-A'; state.epoch++;
  state.fetch.mockResolvedValue(json([])); rerender(); expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(result.current.data).toEqual([]));
});
it('ACK tardio de salvar em outro contexto não invalida cache B', async () => {
  let resolve: ((value: Response) => void) | undefined;
  state.fetch.mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
  const { result, rerender, client } = mount(useSaveTenantProduct);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  let work: Promise<unknown> | undefined;
  await act(async () => { work = result.current.mutateAsync({ id: 'product-A', draft: { nome: 'Produto A' }, expectedUpdatedAt: stamp }).catch(e => e); });
  await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
  state.actor = 'actor-B'; state.tenant = 'tenant-B'; state.epoch++; rerender();
  await act(async () => { resolve?.(json(ack)); expect(await work).toMatchObject({ message: 'catalog_context_changed' }); });
  expect(invalidate).not.toHaveBeenCalled();
});