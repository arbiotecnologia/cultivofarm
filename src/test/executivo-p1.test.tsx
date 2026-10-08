import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const m = vi.hoisted(() => ({ auth: { user: { id: 'A' } as { id: string } | null, profile: { user_id: 'A', organization_id: 'OA', ativo: true, senha_provisoria: false }, roles: ['administrador'], loading: false }, rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => m.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: m.rpc } }));
import { useExecutivoTimeline } from '@/hooks/useExecutivoTimeline';
import { useExecutivoGargalos } from '@/hooks/useExecutivoGargalos';
import { parseExecutivoOperationalPayload } from '@/hooks/useExecutivoOperationalScope';
function wrapper() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
beforeEach(() => { m.rpc.mockReset(); m.auth = { user: { id: 'A' }, profile: { user_id: 'A', organization_id: 'OA', ativo: true, senha_provisoria: false }, roles: ['administrador'], loading: false }; });
describe('Executive P1 data containment (server/Auth mocked)', () => {
  for (const [field, hook] of [['eventos', useExecutivoTimeline], ['gargalos', useExecutivoGargalos]] as const) {
    it(`${field}: retains unavailability and suppresses residual items`, async () => {
      m.rpc.mockResolvedValue({ data: { [field]: [{ referencia_id: 'LEGACY' }], dados_indisponiveis: ['unproven'], motivo_indisponibilidade: 'blocked' }, error: null });
      const h = renderHook(() => hook({ periodo: '30_dias' }), { wrapper: wrapper() });
      await waitFor(() => expect(h.result.current.data?.dados_indisponiveis).toEqual(['unproven']));
      expect(h.result.current.data?.items).toEqual([]); expect(h.result.current.data?.motivo_indisponibilidade).toBe('blocked'); h.unmount();
    });
    for (const change of ['tenant', 'identity'] as const) it(`${field}: fences late ${change} responses`, async () => {
      let complete: ((v: unknown) => void) | undefined;
      m.rpc.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
      const h = renderHook(() => hook({ periodo: '30_dias' }), { wrapper: wrapper() });
      await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(1));
      m.auth = { ...m.auth, user: { id: change === 'identity' ? 'B' : 'A' }, profile: { ...m.auth.profile, user_id: change === 'identity' ? 'B' : 'A', organization_id: 'OB' } };
      m.rpc.mockResolvedValue({ data: { [field]: [{ referencia_id: 'NEW' }], dados_indisponiveis: [] }, error: null });
      h.rerender(); expect(h.result.current.data).toBeUndefined();
      await waitFor(() => expect(h.result.current.data?.items[0]?.referencia_id).toBe('NEW'));
      await act(async () => complete?.({ data: { [field]: [{ referencia_id: 'OLD' }], dados_indisponiveis: [] }, error: null }));
      expect(h.result.current.data?.items[0]?.referencia_id).toBe('NEW'); h.unmount();
    });
    for (const state of ['loading', 'inactive', 'logout', 'revoked', 'mismatch', 'unowned', 'temporary-password'] as const) it(`${field}: hides cache during ${state}`, async () => {
      m.rpc.mockResolvedValue({ data: { [field]: [{ referencia_id: 'OLD' }], dados_indisponiveis: [] }, error: null });
      const h = renderHook(() => hook({}), { wrapper: wrapper() });
      await waitFor(() => expect(h.result.current.data?.items).toHaveLength(1));
      if (state === 'loading') m.auth.loading = true;
      if (state === 'inactive') m.auth.profile.ativo = false;
      if (state === 'logout') m.auth.user = null;
      if (state === 'revoked') m.auth.roles = ['financeiro'];
      if (state === 'mismatch') m.auth.profile.user_id = 'B';
      if (state === 'unowned') m.auth.profile.organization_id = '';
      if (state === 'temporary-password') m.auth.profile.senha_provisoria = true;
      h.rerender(); expect(h.result.current.data).toBeUndefined(); expect(m.rpc).toHaveBeenCalledTimes(1); h.unmount();
    });
  }
  it('rejects missing availability contract rather than reporting empty', () => { expect(() => parseExecutivoOperationalPayload({ eventos: [] }, 'eventos')).toThrow('EXECUTIVO_INVALID_RESPONSE'); });
  it('rejects malformed availability contract', () => { expect(() => parseExecutivoOperationalPayload({ eventos: [], dados_indisponiveis: [42] }, 'eventos')).toThrow('EXECUTIVO_INVALID_RESPONSE'); });
});
