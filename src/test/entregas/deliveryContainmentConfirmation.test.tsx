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
describe('Confirmação real contida, sem upload/metadados/RPC',()=>{
 it('confirmação não chama RPC nem sucesso/cache',async()=>{const h=mount();fireEvent.click(screen.getByRole('button',{name:'Confirmar entrega'}));await waitFor(()=>expect(t.toast).toHaveBeenCalled());expect(t.rpc).not.toHaveBeenCalled();expect(t.close).not.toHaveBeenCalled();expect(t.confirmed).not.toHaveBeenCalled();expect(h.invalidate).not.toHaveBeenCalled();h.qc.clear();});
 it('arquivo pendente não inicia upload nem inserção',async()=>{const h=mount();const input=document.querySelector('input[type=file]');expect(input).not.toBeNull();if(input)fireEvent.change(input,{target:{files:[new File(['evidence'],'test.pdf',{type:'application/pdf'})]}});fireEvent.click(screen.getByRole('button',{name:'Confirmar entrega'}));await waitFor(()=>expect(t.toast).toHaveBeenCalled());expect(t.toast).toHaveBeenCalledWith(expect.objectContaining({description:expect.stringContaining('Nenhuma alteração')}));expect(t.rpc).not.toHaveBeenCalled();expect(t.close).not.toHaveBeenCalled();h.qc.clear();});
 it('duplo clique e remount permanecem contidos',async()=>{let h=mount();fireEvent.click(screen.getByRole('button',{name:'Confirmar entrega'}));fireEvent.click(screen.getByRole('button',{name:'Confirmar entrega'}));await waitFor(()=>expect(t.toast).toHaveBeenCalled());h.unmount();h.qc.clear();h=mount();fireEvent.click(screen.getByRole('button',{name:'Confirmar entrega'}));await waitFor(()=>expect(t.toast).toHaveBeenCalled());expect(t.rpc).not.toHaveBeenCalled();h.qc.clear();});
});
