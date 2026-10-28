import React, { type PropsWithChildren } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const t = vi.hoisted(() => ({ auth: {} as any, rpc: vi.fn(), from: vi.fn(), submit: undefined as any, success: vi.fn(), error: vi.fn(), motor: vi.fn(), updates: [] as any[], rows: [] as any[] }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => t.auth }));
vi.mock('@/hooks/useCockpitQuery', () => ({ useCockpitQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useSystemConfig', () => ({ useSystemConfig: () => ({ config: {}, defaults: {} }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('sonner', () => ({ toast: { success: t.success, error: t.error, info: vi.fn() } }));
vi.mock('@/lib/estoque/motorEstoque', async () => ({ ...await vi.importActual<any>('@/lib/estoque/motorEstoque'), operarEstoque: t.motor }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: t.rpc, from: t.from, channel: () => { const c: any = { on: () => c, subscribe: () => c }; return c; }, removeChannel: vi.fn() } }));
vi.mock('@/components/entregas/RegistrarEntregaDialog', () => ({ RegistrarEntregaDialog: (p: any) => { t.submit = p.onSubmit; return null; } }));
vi.mock('@/components/entregas/ConfirmarEntregaDialog', () => ({ ConfirmarEntregaDialog: () => null }));
vi.mock('@/components/financeiro/ConfirmarEntregaFinanceiroDialog', () => ({ ConfirmarEntregaFinanceiroDialog: () => null }));
vi.mock('@/components/entregas/EntregaComprovantePanel', () => ({ EntregaComprovantePanel: () => null }));
vi.mock('@/components/entregas/TermoEntregaPanel', () => ({ TermoEntregaPanel: () => null }));
vi.mock('@/components/estoque/EmbalagensEntregaPanel', () => ({ EmbalagensEntregaPanel: () => null }));
vi.mock('@/components/entregas/PreviewDocumentoEntrega', () => ({ PreviewDocumentoEntrega: () => null }));
import Entregas from '@/pages/Entregas';
const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
const ack = { success: true, entrega_id: ids[3], replay: false };
function payload(n = 1) { return { grupoId: ids[4], osId: ids[0], osTipo: 'padrao', itens: Array.from({ length: n }, (_, i) => ({ item: { id: ids[i + 1], organization_id: ids[4], status: 'reservado', reservado_para_os_id: ids[0], reservado_para_os_tipo: 'padrao', reservado_para_cliente_id: ids[3], _saldo: 10, _saldo_reserva: 10, quantidade_reservada: 1 }, quantidade: 1 })) }; }
function chain(table: string) { let selected = ''; let updating = false; const c: any = { select: (s: string) => { selected = s; return c; }, update: (v: any) => { updating = true; t.updates.push(v); return c; }, insert: () => c, eq: () => c, neq: () => c, in: () => c, order: () => c, limit: () => c, abortSignal: () => c, single: () => c, maybeSingle: () => c, then: (yes: any, no: any) => Promise.resolve({ data: updating ? [{ id: ids[3], status: 'cancelada' }] : table === 'entregas' ? selected === 'quantidade_entregue' ? [{ quantidade_entregue: 1 }] : selected.startsWith('status,') || selected.startsWith('id, status') ? t.rows[0] : t.rows : table === 'estoque_movimentacoes' ? { id: ids[2] } : [], error: null }).then(yes, no) }; return c; }
function mount() { const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } }); const invalid = vi.spyOn(qc, 'invalidateQueries'); const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>; const h = render(<Entregas />, { wrapper }); return { ...h, qc, invalid }; }
beforeEach(() => { vi.clearAllMocks(); t.updates = []; t.rows = []; t.auth = { user: { id: ids[2] }, profile: { user_id: ids[2], organization_id: ids[4], ativo: true }, role: 'gestor', roles: ['gestor'], loading: false, authzReady: true, authzEpoch: 0 }; t.from.mockImplementation(chain); t.rpc.mockResolvedValue({ data: ack, error: null }); t.motor.mockResolvedValue({ ok: true, replay: false, acao: 'expedicao', estoque_produto_id: ids[1], movimentacao_id: ids[2], saldo_anterior: 1, saldo_posterior: 0, reservado_anterior: 1, reservado_posterior: 0, status_anterior: 'reservado', status_novo: 'expedido' }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('Página Entregas real / hook real / QueryClient real; Auth e transporte simulados', () => {
 it('dupla submissão despacha uma criação', async () => { let done: any; t.rpc.mockImplementation(() => new Promise(r => { done = r; })); const h = mount(); let a: any, b: any; act(() => { a = t.submit(payload()).catch((e: any) => e); b = t.submit(payload()).catch((e: any) => e); }); await waitFor(() => expect(t.rpc).toHaveBeenCalledTimes(1)); await act(async () => { done({ data: ack, error: null }); await Promise.all([a,b]); }); expect(await b).toBeInstanceOf(Error); h.qc.clear(); });
 it('motor ok:false não anuncia grupo concluído nem compensa ficticiamente', async () => { t.motor.mockResolvedValue({ ok: false }); const h = mount(); await act(async () => { await expect(t.submit(payload())).rejects.toThrow(); }); expect(t.success).not.toHaveBeenCalled(); expect(t.updates).toEqual([]); h.qc.clear(); });
 it('falha item N conserva efeitos conhecidos sem rollback direto', async () => { t.rpc.mockResolvedValueOnce({ data: ack, error: null }).mockResolvedValueOnce({ data: null, error: { code: 'PT409', message: 'conflito' } }); const h = mount(); await act(async () => { await expect(t.submit(payload(2))).rejects.toThrow(); }); expect(t.rpc).toHaveBeenCalledTimes(2); expect(t.updates).toEqual([]); expect(t.success).not.toHaveBeenCalled(); h.qc.clear(); });
 it.each(['tenant','ator','epoch'])('ACK tardio após %s não expede/invalida/sucesso', async change => { let done: any; t.rpc.mockImplementation(() => new Promise(r => { done = r; })); const h = mount(); let a: any; act(() => { a = t.submit(payload()).catch((e: any) => e); }); await waitFor(() => expect(t.rpc).toHaveBeenCalledTimes(1)); if (change === 'tenant') t.auth.profile.organization_id = ids[0]; if (change === 'ator') t.auth.user.id = ids[0]; if (change === 'epoch') t.auth.authzEpoch++; h.rerender(<Entregas />); await act(async () => { done({ data: ack, error: null }); await a; }); expect(await a).toBeInstanceOf(Error); expect(t.motor).not.toHaveBeenCalled(); expect(h.invalid).not.toHaveBeenCalled(); expect(t.success).not.toHaveBeenCalled(); h.qc.clear(); });

 it.each([null, { success: true }, { success: true, ok: false, entrega_id: ids[3] }, { success: true, entrega_id: 'invalid' }, { success: true, entrega_id: ids[3], replay: 'true' }])('ACK criação inválido não expede/invalida: %j', async data => {
   t.rpc.mockResolvedValue({ data, error: null }); const h = mount();
   await act(async () => { await expect(t.submit(payload())).rejects.toThrow(); });
   expect(t.motor).not.toHaveBeenCalled(); expect(h.invalid).not.toHaveBeenCalled(); expect(t.success).not.toHaveBeenCalled(); h.qc.clear();
 });
 it.each(['PT409','42501','55P03'])('erro %s não repete nem apaga efeitos', async code => {
   t.rpc.mockResolvedValue({ data: null, error: { code, message: code } }); const h = mount();
   await act(async () => { await expect(t.submit(payload())).rejects.toThrow(); });
   expect(t.rpc).toHaveBeenCalledTimes(1); expect(t.updates).toEqual([]); expect(h.invalid).not.toHaveBeenCalled(); h.qc.clear();
 });
 it('ACK perdido bloqueia reenvio explícito e não faz compensação', async () => {
   t.rpc.mockRejectedValue(new TypeError('Failed to fetch')); const h = mount();
   await act(async () => { await expect(t.submit(payload())).rejects.toThrow(); await expect(t.submit(payload())).rejects.toThrow(); });
   expect(t.rpc).toHaveBeenCalledTimes(1); expect(t.updates).toEqual([]); expect(h.invalid).not.toHaveBeenCalled(); h.qc.clear();
 });
 it('resultado positivo invalida só caches do ator capturado', async () => {
   const h = mount(); h.qc.setQueryData(['entregas','other-actor','other-request'], [{ id: 'foreign' }]);
   await act(async () => { await t.submit(payload()); });
   expect(t.success).toHaveBeenCalledTimes(1); expect(h.invalid).toHaveBeenCalledTimes(2);
   for (const [filters] of h.invalid.mock.calls) expect(filters?.predicate?.({ queryKey: ['entregas','other-actor','other-request'] } as any)).toBe(false);
   h.qc.clear();
 });
 it('parcial válido não expede reserva completa prematuramente', async () => {
   const h = mount(); const p = payload(); p.itens[0].item.quantidade_reservada = 5;
   await act(async () => { await t.submit(p); });
   expect(t.motor).not.toHaveBeenCalled(); expect(t.success).toHaveBeenCalledTimes(1); h.qc.clear();
 });
 it('timeout abandona etapas posteriores mesmo com ACK tardio', async () => {
   let done: any; t.rpc.mockImplementation(() => new Promise(r => { done = r; })); const h = mount(); let request: any;
   vi.useFakeTimers(); act(() => { request = t.submit(payload()).catch((e: any) => e); });
   await act(async () => { await vi.advanceTimersByTimeAsync(30001); });
   expect(await request).toBeInstanceOf(Error);
   await act(async () => { await expect(t.submit(payload())).rejects.toThrow(); });
   expect(t.rpc).toHaveBeenCalledTimes(1);
   await act(async () => { done({ data: ack, error: null }); await Promise.resolve(); });
   expect(t.motor).not.toHaveBeenCalled(); expect(h.invalid).not.toHaveBeenCalled(); expect(t.updates).toEqual([]); h.qc.clear();
 });
 it('cancelamento com estorno negativo mantém draft e não anuncia sucesso', async () => {
   t.rows = [{ id: ids[3], status: 'em_rota', estoque_produto_id: ids[1], clientes: { nome: 'Cliente' } }];
   t.motor.mockResolvedValue({ ok: false }); const h = mount();
   await waitFor(() => expect(screen.getAllByRole('button', { name: 'Cancelar' }).length).toBeGreaterThan(0));
   fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]);
   const button = screen.getByRole('button', { name: 'Confirmar cancelamento' });
   await act(async () => { fireEvent.click(button); fireEvent.click(button); });
   await waitFor(() => expect(t.motor).toHaveBeenCalledTimes(1));
   expect(t.updates).toHaveLength(1); expect(t.success).not.toHaveBeenCalled();
   expect(screen.getByRole('button', { name: 'Confirmar cancelamento' })).toBeInTheDocument(); h.qc.clear();
 });

 it.each([{ ok: true }, { ok: true, replay: false, acao: 'expedicao', movimentacao_id: ids[2], estoque_produto_id: ids[0] }])('ACK estoque parcial/alheio não vira sucesso: %j', async response => {
   t.motor.mockResolvedValue(response); const h = mount(); await act(async () => { await expect(t.submit(payload())).rejects.toThrow(); });
   expect(t.success).not.toHaveBeenCalled(); expect(h.invalid).not.toHaveBeenCalled(); expect(t.updates).toEqual([]); h.qc.clear();
 });
 it('reserva sem UUID confirmado não continua criação', async () => {
   const p = payload(); Object.assign(p.itens[0].item, { reservado_para_os_id: null, status: 'disponivel' });
   t.from.mockImplementation(table => table === 'ordens_servico' ? { ...chain(table), then: (yes: any) => Promise.resolve({ data: [{ id: ids[0], cliente_id: ids[3] }], error: null }).then(yes) } : chain(table));
   t.rpc.mockResolvedValue({ data: { ok: false }, error: null }); const h = mount();
   await waitFor(() => expect(h.qc.getQueryCache().findAll({ queryKey: ['todas-os-disponiveis'] })[0]?.state.status).toBe('success'));
   await act(async () => { await expect(t.submit(p)).rejects.toThrow(); });
   expect(t.rpc).toHaveBeenCalledTimes(1); expect(t.rpc.mock.calls[0][0]).toBe('reservar_estoque_item'); expect(t.success).not.toHaveBeenCalled(); h.qc.clear();
 });
});
