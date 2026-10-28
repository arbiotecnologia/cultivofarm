import React, { type PropsWithChildren } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const t = vi.hoisted(() => ({ auth: {} as any, rpc: vi.fn(), toast: vi.fn(), close: vi.fn(), confirmed: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => t.auth }));
vi.mock('@/hooks/use-toast', () => ({ toast: t.toast }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: t.rpc, from: () => { const c: any = { select: () => c, eq: () => c, order: () => c, then: (yes: any) => Promise.resolve({ data: [], error: null }).then(yes) }; return c; } } }));
import { ConfirmarEntregaDialog } from '@/components/entregas/ConfirmarEntregaDialog';
const id = '11111111-1111-4111-8111-111111111111';
function mount() {
 const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } });
 const invalidate = vi.spyOn(qc, 'invalidateQueries');
 const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
 const element = (target = id) => <ConfirmarEntregaDialog open entrega={{ id: target, status: 'em_rota' }} onClose={t.close} onConfirmed={t.confirmed} />;
 const h = render(element(), { wrapper });
 fireEvent.change(screen.getByPlaceholderText('Nome de quem recebeu na fazenda'), { target: { value: 'Recebedor' } });
 fireEvent.click(screen.getByRole('radio', { name: /Confirmar e faturar depois/ }));
 return { ...h, qc, invalidate, element };
}
beforeEach(() => { vi.clearAllMocks(); t.auth = { user: { id }, profile: { user_id: id, organization_id: id, ativo: true }, roles: ['gestor'], loading: false, authzReady: true, authzEpoch: 0 }; t.rpc.mockResolvedValue({ data: { success: true, entrega_id: id, replay: false }, error: null }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('Confirmação existente com transporte simulado — não libera RPC fechada', () => {
 it.each([null, { ok: false }, { success: true }, { success: true, entrega_id: 'other', replay: false }])('ACK inválido preserva dialog/draft: %j', async data => {
   t.rpc.mockResolvedValue({ data, error: null }); const h = mount();
   fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
   await waitFor(() => expect(t.toast).toHaveBeenCalled());
   expect(t.close).not.toHaveBeenCalled(); expect(t.confirmed).not.toHaveBeenCalled(); expect(h.invalidate).not.toHaveBeenCalled(); expect(t.rpc).toHaveBeenCalledTimes(1); expect(screen.getByPlaceholderText('Nome de quem recebeu na fazenda')).toHaveValue('Recebedor'); h.qc.clear();
 });
 it('dupla ação não envia dois dispatches', async () => {
   let done: any; t.rpc.mockImplementation(() => new Promise(r => { done = r; })); const h = mount(); const b = screen.getByRole('button', { name: 'Confirmar entrega' });
   act(() => { fireEvent.click(b); fireEvent.click(b); });
   await waitFor(() => expect(t.rpc).toHaveBeenCalledTimes(1));
   await act(async () => { done({ data: { success: true, entrega_id: id, replay: true }, error: null }); });
   await waitFor(() => expect(t.confirmed).toHaveBeenCalledWith('bill_later', id)); h.qc.clear();
 });
 it.each(['tenant','epoch','entrega'])('ACK tardio %s não fecha nem invalida', async change => {
   let done: any; t.rpc.mockImplementation(() => new Promise(r => { done = r; })); const h = mount(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
   await waitFor(() => expect(t.rpc).toHaveBeenCalledTimes(1));
   if (change === 'tenant') t.auth.profile.organization_id = 'other'; if (change === 'epoch') t.auth.authzEpoch++;
   h.rerender(h.element(change === 'entrega' ? '22222222-2222-4222-8222-222222222222' : id));
   await act(async () => { done({ data: { success: true, entrega_id: id, replay: false }, error: null }); });
   expect(t.close).not.toHaveBeenCalled(); expect(t.confirmed).not.toHaveBeenCalled(); expect(h.invalidate).not.toHaveBeenCalled(); h.qc.clear();
 });

 it('timeout confirma incerteza e ACK tardio não fecha/invalida', async () => {
   let done: any; t.rpc.mockImplementation(() => new Promise(r => { done = r; })); const h = mount(); vi.useFakeTimers();
   fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
   await act(async () => { await vi.advanceTimersByTimeAsync(30001); });
   expect(t.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Não foi possível confirmar' }));
   fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
   await act(async () => { await Promise.resolve(); }); expect(t.rpc).toHaveBeenCalledTimes(1);
   await act(async () => { done({ data: { success: true, entrega_id: id, replay: false }, error: null }); });
   expect(t.close).not.toHaveBeenCalled(); expect(h.invalidate).not.toHaveBeenCalled(); h.qc.clear();
 });
});
