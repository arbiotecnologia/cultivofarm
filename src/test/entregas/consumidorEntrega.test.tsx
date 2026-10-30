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
describe('Contenção real antes do primeiro dispatch da página', () => {
 it.each([1,2])('grupo com %s itens não reserva/cria/expede/estorna', async n => {
  const h=mount(); await act(async()=>{ await expect(t.submit(payload(n))).rejects.toThrow(); });
  expect(t.rpc).not.toHaveBeenCalled(); expect(t.motor).not.toHaveBeenCalled(); expect(t.updates).toEqual([]); expect(t.success).not.toHaveBeenCalled(); expect(h.invalid).not.toHaveBeenCalled(); h.qc.clear();
 });
 it('lote disponível não recebe reserva nem auditoria', async()=>{
  const p=payload(); Object.assign(p.itens[0].item,{status:'disponivel',reservado_para_os_id:null}); const h=mount();
  await act(async()=>{await expect(t.submit(p)).rejects.toThrow();}); expect(t.rpc).not.toHaveBeenCalled(); expect(t.motor).not.toHaveBeenCalled(); h.qc.clear();
 });
 it.each(['separado','em_rota'])('cancelamento %s não altera status nem estorna',async status=>{
  t.rows=[{id:ids[3],status,estoque_produto_id:ids[1],clientes:{nome:'Cliente'}}]; const h=mount();
  fireEvent.click((await screen.findAllByRole('button',{name:'Cancelar'}))[0]); fireEvent.click(screen.getByRole('button',{name:'Confirmar cancelamento'}));
  await waitFor(()=>expect(t.error).toHaveBeenCalled()); expect(t.updates).toEqual([]); expect(t.rpc).not.toHaveBeenCalled(); expect(t.motor).not.toHaveBeenCalled(); expect(t.success).not.toHaveBeenCalled(); h.qc.clear();
 });
 it('envio em rota não faz UPDATE',async()=>{
  t.rows=[{id:ids[3],status:'separado',clientes:{nome:'Cliente'}}];const h=mount(); fireEvent.click((await screen.findAllByRole('button',{name:'Enviar'}))[0]);
  await waitFor(()=>expect(t.error).toHaveBeenCalled()); expect(t.updates).toEqual([]); expect(t.rpc).not.toHaveBeenCalled();h.qc.clear();
 });
 it.each(['gestor','administrador','financeiro','parceiro_b2b','cliente_produtor'])('papel %s não abre o contrato',async role=>{
  t.auth.role=role;t.auth.roles=[role]; const h=mount(); await act(async()=>{await expect(t.submit(payload())).rejects.toThrow();}); expect(t.rpc).not.toHaveBeenCalled();expect(t.updates).toEqual([]);h.qc.clear();
 });
 it('remount, tenant e dupla ação nunca abrem dispatch',async()=>{
  const h=mount();await act(async()=>{await Promise.all([t.submit(payload()).catch(()=>{}),t.submit(payload()).catch(()=>{})]);});h.unmount();h.qc.clear();
  t.auth.profile.organization_id=ids[0];const next=mount();await act(async()=>{await expect(t.submit(payload())).rejects.toThrow();});expect(t.rpc).not.toHaveBeenCalled();expect(t.motor).not.toHaveBeenCalled();expect(t.updates).toEqual([]);next.qc.clear();
 });
 it('consulta existente conserva linhas sem operações',async()=>{
  t.rows=[{id:ids[3],status:'entregue',clientes:{nome:'Cliente autorizado'}}];const h=mount();await screen.findByText('Cliente autorizado');expect(t.from).toHaveBeenCalledWith('entregas');expect(t.rpc).not.toHaveBeenCalled();h.qc.clear();
 });
});
