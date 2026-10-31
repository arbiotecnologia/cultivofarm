import React, { type PropsWithChildren } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const t = vi.hoisted(() => ({ auth: {} as any, confirm: {} as any, financial: false, rpc: vi.fn(), from: vi.fn(), submit: undefined as any, success: vi.fn(), error: vi.fn(), current: { os: null as any, estoque: [] as any[], entrega: null as any }, rows: [] as any[], writes: [] as any[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => t.auth }));
vi.mock("@/hooks/useCockpitQuery", () => ({ useCockpitQuery: () => ({ data: [] }) }));
vi.mock("@/hooks/useSystemConfig", () => ({ useSystemConfig: () => ({ config: {}, defaults: {} }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("sonner", () => ({ toast: { success: t.success, error: t.error, info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: t.rpc, from: t.from, channel: () => { const c: any = { on: () => c, subscribe: () => c }; return c; }, removeChannel: vi.fn() } }));
vi.mock("@/components/entregas/RegistrarEntregaDialog", () => ({ RegistrarEntregaDialog: (p: any) => { t.submit = p.onSubmit; return null; } }));
vi.mock("@/components/entregas/ConfirmarEntregaDialog", () => ({ ConfirmarEntregaDialog: (p: any) => { t.confirm = p; return null; } }));
vi.mock("@/components/financeiro/ConfirmarEntregaFinanceiroDialog", () => ({ ConfirmarEntregaFinanceiroDialog: (p: any) => { t.financial = p.open; return null; } }));
vi.mock("@/components/entregas/EntregaComprovantePanel", () => ({ EntregaComprovantePanel: () => null }));
vi.mock("@/components/entregas/TermoEntregaPanel", () => ({ TermoEntregaPanel: () => null }));
vi.mock("@/components/estoque/EmbalagensEntregaPanel", () => ({ EmbalagensEntregaPanel: () => null }));
vi.mock("@/components/entregas/PreviewDocumentoEntrega", () => ({ PreviewDocumentoEntrega: () => null }));
import Entregas from "@/pages/Entregas";
import { CANCEL_RPC, CAPABILITY_RPC, GROUP_RPC } from "@/lib/entregas/deliveryOperationsFlow";

const ORG = "10000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000002";
const ACTOR = "10000000-0000-4000-8000-000000000003";
const OS = "10000000-0000-4000-8000-000000000007";
const S = "10000000-0000-4000-8000-000000000013";
const E1 = "10000000-0000-4000-8000-000000000101";
const M1 = "10000000-0000-4000-8000-000000000201";
const T1 = "2026-10-30T10:00:00Z";
const T2 = "2026-10-30T11:00:00Z";
const cap = { capability: "delivery_operations_v1", group: true, cancel: true };
const groupAck = { success: true, replay: false, organization_id: ORG, os_id: OS, itens: [{ entrega_id: E1, estoque_produto_id: S, movimentacao_id: M1 }] };
const cancelAck = { success: true, replay: false, organization_id: ORG, entrega_id: E1, estoque_estornado: true, reserva_liberada: true };

function payload(over: any = {}) {
  return {
    grupoId: "30000000-0000-4000-8000-000000000999", osId: OS, osTipo: "padrao",
    itens: [{ item: { id: S, status: "disponivel", _saldo: 10 }, quantidade: 1 }],
    tipo_entrega: "motorista", motorista: "", veiculo: "", data_saida: "", endereco_origem: "cadastro",
    observed: { os: { id: OS, type: "padrao", updated_at: T1, origem: "agronomica", partner_order_id: null }, itens: { [S]: { updated_at: T1, status: "disponivel" } } },
    ...over,
  };
}
function chain(table: string) {
  let sel = ""; let single = false;
  const c: any = {
    select: (s: string) => { sel = s; return c; }, update: (v: any) => { t.writes.push([table, "update", v]); return c; }, insert: (v: any) => { t.writes.push([table, "insert", v]); return c; },
    delete: () => { t.writes.push([table, "delete"]); return c; }, eq: () => c, neq: () => c, in: () => c, order: () => c, limit: () => c, abortSignal: () => c, single: () => c,
    maybeSingle: () => { single = true; return c; },
    then: (yes: any, no: any) => {
      let data: any = [];
      if (table === "ordens_servico" && single) data = t.current.os;
      else if (table === "estoque_produto" && sel.startsWith("id, updated_at, status")) data = t.current.estoque;
      else if (table === "entregas" && single) data = t.current.entrega;
      else if (table === "entregas") data = t.rows;
      return Promise.resolve({ data, error: null }).then(yes, no);
    },
  };
  return c;
}
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
  return { ...render(<Entregas />, { wrapper }), qc };
}
const writerCalls = () => t.rpc.mock.calls.filter((c: any[]) => c[0] === GROUP_RPC || c[0] === CANCEL_RPC);
const PFX = `cf:delivery-uncertain:v2:${ACTOR}:${ORG}:`;
const pendingKeys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) as string).filter(k => k.startsWith(PFX)).sort();
const pendingRaw = () => { const k = pendingKeys()[0]; return k ? localStorage.getItem(k) : null; };

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); t.writes = []; t.rows = [];
  t.auth = { user: { id: ACTOR }, profile: { user_id: ACTOR, organization_id: ORG, ativo: true }, role: "gestor", roles: ["gestor"], loading: false, authzReady: true, authzEpoch: 0 };
  t.current = { os: { id: OS, updated_at: T1, origem: "agronomica", partner_order_id: null }, estoque: [{ id: S, updated_at: T1, status: "disponivel" }], entrega: null };
  t.from.mockImplementation(chain);
  t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : fn === GROUP_RPC ? { data: groupAck, error: null } : { data: cancelAck, error: null });
});
afterEach(() => { cleanup(); });

describe("Entregas page with atomic adapter (mounted)", () => {
  it('send timeout retains ownership until transport settles and never parallel-dispatches', async () => {
    t.rows=[{id:E1,status:'separado',ordem_servico_id:OS,updated_at:T1,clientes:{nome:'Timeout alvo'}}];
    let release: ((value:any)=>void) | undefined;
    t.rpc.mockImplementation((fn:string)=>fn==='rpc_entrega_envio_capability_v1'
      ? Promise.resolve({data:{capability:'delivery_send_manual_v1',available:true,actor_id:ACTOR,organization_id:ORG,entrega_id:E1,os_id:OS,status:'separado',updated_at:T1},error:null})
      : new Promise(resolve=>{release=resolve;}));
    const h=mount(); await screen.findByText('Timeout alvo'); vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button',{name:'Enviar'}));await act(async()=>{await Promise.resolve();await Promise.resolve();});
      expect(t.rpc).toHaveBeenCalledTimes(2);
      await act(async()=>{await vi.advanceTimersByTimeAsync(30001);});
      fireEvent.click(screen.getByRole('button',{name:'Enviar'}));await act(async()=>{await Promise.resolve();});
      expect(t.rpc).toHaveBeenCalledTimes(2);expect(t.error).toHaveBeenCalledWith('Uma operação de entrega já está em andamento.');
      await act(async()=>{release?.({data:{success:true,action:'send',replay:false,actor_id:ACTOR,organization_id:ORG,entrega_id:E1,os_id:OS,status:'em_rota',updated_at:T2},error:null});await Promise.resolve();});
      expect(t.success).not.toHaveBeenCalled();expect(t.writes).toEqual([]);expect(t.financial).toBe(false);
    } finally {vi.useRealTimers();h.qc.clear();}
  });
  it('preflight rejection then refresh uses a fresh observed revision and dispatches once', async () => {
    t.rows = [{ id: E1, status: 'separado', ordem_servico_id: OS, updated_at: T1, clientes: { nome: 'Cliente' } }];
    const uuid = vi.spyOn(crypto, 'randomUUID');
    t.rpc.mockImplementation(async (fn: string, args: any) => fn === 'rpc_entrega_envio_capability_v1'
      ? { data: { capability: 'delivery_send_manual_v1', available: true, actor_id: ACTOR, organization_id: ORG, entrega_id: E1, os_id: OS, status: 'separado', updated_at: T2 }, error: null }
      : { data: { success: true, action: 'send', replay: false, actor_id: ACTOR, organization_id: ORG, entrega_id: E1, os_id: OS, status: 'em_rota', updated_at: T2 }, error: null });
    const h = mount(); fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(t.error).toHaveBeenCalled()); expect(t.rpc).toHaveBeenCalledTimes(1);
    t.rows = [{ ...t.rows[0], updated_at: T2 }]; fireEvent.click(screen.getByRole('button', { name: 'Consultar entregas' }));
    const own = h.qc.getQueryCache().findAll().find(q => q.queryKey[0] === 'entregas');
    await waitFor(() => expect(h.qc.getQueryData(own?.queryKey ?? [])).toEqual(t.rows));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(t.success).toHaveBeenCalledWith('Status atualizado'));
    const sends = t.rpc.mock.calls.filter(c => c[0] === 'rpc_entrega_enviar_manual_v1');
    expect(sends).toHaveLength(1); expect(sends[0][1].p_observed).toBe(T2); expect(uuid).toHaveBeenCalledTimes(2);
    uuid.mockRestore(); expect(t.writes).toEqual([]); h.qc.clear();
  });
  it.each(['reconcile', 'terminal', 'tenant'])('lost ACK then Consultar retains exact send and fences other target: %s', async (mode) => {
    const E2 = '10000000-0000-4000-8000-000000000102';
    t.rows = [E1,E2].map((id,i) => ({ id, status:'separado', ordem_servico_id:OS, updated_at:T1, clientes:{ nome:i ? 'Outro' : 'Cliente perdido' } }));
    let sent = 0;
    t.rpc.mockImplementation(async (fn:string,args:any) => {
      if (fn === 'rpc_entrega_envio_capability_v1') { const row=t.rows.find(r=>r.id===args.p_entrega); return { data:{capability:'delivery_send_manual_v1',available:true,actor_id:ACTOR,organization_id:ORG,entrega_id:args.p_entrega,os_id:OS,status:row?.status,updated_at:row?.updated_at},error:null }; }
      sent++; t.rows=t.rows.map(r=>r.id===E1 ? {...r,status:'em_rota',updated_at:T2}:r);
      return sent===1 ? {data:null,error:{code:'57014',message:'timeout'}} : {data:{success:true,action:'send',replay:true,actor_id:ACTOR,organization_id:ORG,entrega_id:E1,os_id:OS,status:'em_rota',updated_at:T2},error:null};
    });
    const h=mount(); await screen.findByText('Cliente perdido');
    const row=(name:string)=>{const el=screen.getByText(name).closest('tr');if(!el)throw new Error('row');return within(el);};
    fireEvent.click(row('Cliente perdido').getByRole('button',{name:'Enviar'}));await waitFor(()=>expect(t.error).toHaveBeenCalled());
    const first=t.rpc.mock.calls.find(c=>c[0]==='rpc_entrega_enviar_manual_v1')?.[1];
    const calls=t.rpc.mock.calls.length;fireEvent.click(row('Outro').getByRole('button',{name:'Enviar'}));
    await waitFor(()=>expect(t.error).toHaveBeenCalledWith('Reconcilie somente o mesmo envio pendente.'));expect(t.rpc).toHaveBeenCalledTimes(calls);
    if(mode==='terminal')t.rows=t.rows.map(r=>r.id===E1?{...r,status:'entregue'}:r);
    fireEvent.click(screen.getByRole('button',{name:'Consultar entregas'}));
    if(mode==='terminal') {
      await screen.findByText(/entrega encerrada; reconciliação por escrita indisponível/);expect(screen.queryByRole('button',{name:'Reconciliar envio'})).toBeNull();expect(sent).toBe(1);
    } else {
      await screen.findByRole('button',{name:'Reconciliar envio'});
      if(mode==='tenant') {
        t.auth={...t.auth,profile:{...t.auth.profile,organization_id:ORG_B},authzEpoch:1};h.rerender(<Entregas/>);
        await waitFor(()=>expect(screen.queryByRole('button',{name:'Reconciliar envio'})).toBeNull());expect(sent).toBe(1);
      } else {
        fireEvent.click(screen.getByRole('button',{name:'Reconciliar envio'}));await waitFor(()=>expect(t.success).toHaveBeenCalledWith('Status atualizado'));
        const sends=t.rpc.mock.calls.filter(c=>c[0]==='rpc_entrega_enviar_manual_v1');expect(sends).toHaveLength(2);expect(sends[1][1]).toEqual(first);
      }
    }
    expect(t.writes).toEqual([]);expect(t.financial).toBe(false);h.qc.clear();
  });
  it.each([false, true])("two items: partial A confirmation then B send/replay (early B=%s)", async (early) => {
    const E2 = "10000000-0000-4000-8000-000000000102";
    t.rows = [E1, E2].map((id, i) => ({ id, status: "separado", ordem_servico_id: OS, updated_at: T1, clientes: { nome: `Cliente ${i ? 'B' : 'A'}` } }));
    const receipts = new Map<string, any>(); let osStatus = 'pronto_entrega';
    t.rpc.mockImplementation(async (fn: string, args: any) => {
      const id = args.p_entrega ?? args.p_entrega_id; const row = t.rows.find(r => r.id === id);
      if (fn === 'rpc_entrega_envio_capability_v1') return { data: { capability: 'delivery_send_manual_v1', available: ['pronto_entrega', 'entregue'].includes(osStatus), actor_id: ACTOR, organization_id: ORG, entrega_id: id, os_id: OS, status: row?.status, updated_at: row?.updated_at }, error: null };
      expect(fn).toBe('rpc_entrega_enviar_manual_v1'); expect(['pronto_entrega', 'entregue']).toContain(osStatus);
      const prior = receipts.get(args.p_request_key);
      if (prior) return { data: { ...prior, replay: true }, error: null };
      t.rows = t.rows.map(r => r.id === id ? { ...r, status: 'em_rota', updated_at: T2 } : r);
      const ack = { success: true, action: 'send', replay: false, actor_id: ACTOR, organization_id: ORG, entrega_id: id, os_id: OS, status: 'em_rota', updated_at: T2 };
      receipts.set(args.p_request_key, ack);
      return early && id === E2 ? { data: null, error: { code: '57014', message: 'timeout' } } : { data: ack, error: null };
    });
    const h = mount();
    await screen.findByText('Cliente A');
    const row = (name: string) => { const el = screen.getByText(name).closest('tr'); if (!el) throw new Error('row missing'); return within(el); };
    fireEvent.click(row('Cliente A').getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(t.rows[0].status).toBe('em_rota'));
    if (early) {
      fireEvent.click(row('Cliente B').getByRole('button', { name: 'Enviar' }));
      await waitFor(() => expect(receipts.size).toBe(2));
      await waitFor(() => expect(t.error).toHaveBeenCalled());
    }
    fireEvent.click(await row('Cliente A').findByRole('button', { name: 'Confirmar' }));
    osStatus = 'entregue'; t.rows = t.rows.map(r => r.id === E1 ? { ...r, status: 'entregue' } : r);
    await act(async () => t.confirm.onConfirmed('physical', E1));
    await waitFor(() => expect(row('Cliente A').getByText('Entregue')).toBeInTheDocument());
    fireEvent.click(row('Cliente B').getByRole('button', { name: early ? /Reconciliar/ : 'Enviar' }));
    fireEvent.click(await row('Cliente B').findByRole('button', { name: 'Confirmar' }));
    expect(t.confirm.entrega.id).toBe(E2);
    osStatus = 'finalizada'; t.rows = t.rows.map(r => ({ ...r, status: 'entregue' }));
    await act(async () => t.confirm.onConfirmed('physical', E2));
    await waitFor(() => expect(screen.getAllByText('Entregue')).toHaveLength(2));
    const sends = t.rpc.mock.calls.filter(c => c[0] === 'rpc_entrega_enviar_manual_v1');
    expect(sends).toHaveLength(early ? 3 : 2);
    if (early) expect(sends[2][1]).toEqual(sends[1][1]);
    expect(t.writes).toEqual([]); expect(t.financial).toBe(false); h.qc.clear();
  });
  it("Enviar replaces direct UPDATE and makes physical confirmation reachable", async () => {
    t.rows = [{ id: E1, status: "separado", ordem_servico_id: OS, updated_at: T1, clientes: { nome: "Cliente" } }];
    t.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'rpc_entrega_envio_capability_v1') return { data: { capability: 'delivery_send_manual_v1', available: true, actor_id: ACTOR, organization_id: ORG, entrega_id: E1, os_id: OS, status: 'separado', updated_at: T1 }, error: null };
      t.rows = [{ ...t.rows[0], status: 'em_rota', updated_at: T2 }];
      return { data: { success: true, action: 'send', replay: false, actor_id: ACTOR, organization_id: ORG, entrega_id: E1, os_id: OS, status: 'em_rota', updated_at: T2 }, error: null };
    });
    const h = mount(); fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(t.confirm.open).toBe(true); expect(t.confirm.entrega.status).toBe('em_rota');
    t.rows = [{ ...t.rows[0], status: 'entregue' }]; await act(async () => t.confirm.onConfirmed('physical', E1));
    expect(await screen.findByText('Entregue')).toBeInTheDocument(); expect(t.financial).toBe(false); expect(t.writes).toEqual([]); h.qc.clear();
  });
  it("physical ACK refreshes exact real list cache only and never opens finance", async () => {
    t.rows = [{ id: E1, status: "em_rota", updated_at: T1, clientes: { nome: "Cliente" } }];
    const h = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    const own = h.qc.getQueryCache().findAll().find(q => q.queryKey[0] === "entregas");
    expect(own).toBeDefined();
    const foreignKey = ["entregas", "foreign-actor", "foreign-request"];
    h.qc.setQueryData(foreignKey, [{ id: "foreign", status: "separado" }]);
    const foreignRead = vi.fn(async () => [{ id: "foreign", status: "separado" }]);
    const observer = new QueryObserver(h.qc, { queryKey: foreignKey, queryFn: foreignRead, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    const foreignBefore = h.qc.getQueryState(foreignKey);
    t.rows = [{ ...t.rows[0], status: "entregue" }];
    await act(async () => t.confirm.onConfirmed("physical", E1));
    await waitFor(() => expect(h.qc.getQueryData(own?.queryKey ?? [] )).toEqual(t.rows));
    expect(await screen.findByText("Entregue")).toBeInTheDocument();
    expect(h.qc.getQueryState(foreignKey)).toEqual(foreignBefore);
    expect(foreignRead).not.toHaveBeenCalled();
    expect(t.financial).toBe(false); unsubscribe(); h.qc.clear();
  });
  it("late physical callback after tenant change does not invalidate either cache", async () => {
    t.rows = [{ id: E1, status: "em_rota", updated_at: T1, clientes: { nome: "Cliente" } }];
    const h = mount(); fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    const callback = t.confirm.onConfirmed;
    t.auth = { ...t.auth, profile: { ...t.auth.profile, organization_id: ORG_B } }; h.rerender(<Entregas />);
    const invalidation = vi.spyOn(h.qc, "invalidateQueries");
    await act(async () => callback("physical", E1)); expect(invalidation).not.toHaveBeenCalled(); expect(t.financial).toBe(false); h.qc.clear();
  });
  it("dispatches exactly the observed revisions when unchanged", async () => {
    const h = mount();
    await act(async () => { await t.submit(payload()); });
    expect(writerCalls()).toHaveLength(1);
    expect(writerCalls()[0][1]).toMatchObject({ p_os_observed: T1, p_itens: [{ item_id: S, quantidade: 1, observed_updated_at: T1 }] });
    expect(t.success).toHaveBeenCalled();
    expect(pendingRaw()).toBeNull();
    expect(t.writes).toEqual([]);
    h.qc.clear();
  });
  it.each([
    ["OS revision", () => { t.current.os = { ...t.current.os, updated_at: T2 }; }],
    ["lot revision", () => { t.current.estoque = [{ id: S, updated_at: T2, status: "disponivel" }]; }],
    ["lot status", () => { t.current.estoque = [{ id: S, updated_at: T1, status: "reservado" }]; }],
    ["OS became B2B", () => { t.current.os = { ...t.current.os, partner_order_id: ORG_B }; }],
  ])("%s changed since selection: rejected for review, no rebase, no writer", async (_n, mutate) => {
    mutate();
    const h = mount();
    await act(async () => { await expect(t.submit(payload())).rejects.toThrow(/mudou desde a seleção/); });
    expect(writerCalls()).toHaveLength(0);
    h.qc.clear();
  });
  it("missing observed snapshot is refused before any call", async () => {
    const h = mount();
    await act(async () => { await expect(t.submit(payload({ observed: undefined }))).rejects.toThrow(/Revisão observada/); });
    expect(t.rpc).not.toHaveBeenCalled();
    h.qc.clear();
  });
  it.each([["onfarm", "padrao"], ["padrao", "b2b"]])("osTipo %s / origem %s is denied without writer", async (osTipo, origem) => {
    const h = mount();
    const p = payload({ osTipo });
    p.observed.os.origem = origem; t.current.os.origem = origem;
    await act(async () => { await expect(t.submit(p)).rejects.toThrow(); });
    expect(writerCalls()).toHaveLength(0);
    h.qc.clear();
  });
  it("recipient/address filled from cadastro is dispatched and confirmed (no clearing workaround)", async () => {
    const h = mount();
    await act(async () => { await t.submit(payload({ destinatario_nome: "Fazenda X", endereco_cidade: "Paracatu", endereco_cep: "38.600-000", hora_saida_prevista: "08:30" })); });
    expect(writerCalls()).toHaveLength(1);
    expect(writerCalls()[0][1].p_dados).toMatchObject({ destinatario_nome: "Fazenda X", endereco_cidade: "Paracatu", endereco_cep: "38.600-000", hora_saida_prevista: "08:30" });
    expect(t.success).toHaveBeenCalled();
    h.qc.clear();
  });
  it("unknown field from the dialog is refused explicitly, never dropped", async () => {
    const h = mount();
    await act(async () => { await expect(t.submit(payload({ cliente_id: ORG_B }))).rejects.toThrow(/não aceitos.*cliente_id/); });
    expect(writerCalls()).toHaveLength(0);
    h.qc.clear();
  });
  it("ACK of another tenant is uncertain, persisted, and blocks new submissions after remount", async () => {
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: { ...groupAck, organization_id: ORG_B }, error: null });
    const h = mount();
    await act(async () => { await expect(t.submit(payload())).rejects.toThrow(/pode ter sido gravada/); });
    expect(t.success).not.toHaveBeenCalled();
    const stored = JSON.parse(pendingRaw() as string);
    expect(stored).toMatchObject({ fn: GROUP_RPC, expectedOrg: ORG, args: { p_request_key: payload().grupoId, p_os_observed: T1 } });
    h.unmount(); h.qc.clear();
    // Remount (reload): new key is blocked; only the exact replay is offered.
    const next = mount();
    await screen.findByRole("button", { name: "Repetir envio pendente" });
    t.rpc.mockClear();
    await act(async () => { await expect(t.submit(payload({ grupoId: "30000000-0000-4000-8000-000000000555" }))).rejects.toThrow(/resultado incerto/); });
    expect(t.rpc).not.toHaveBeenCalled();
    // Exact replay: identical frozen args, no new CAS read.
    t.current.os = { ...t.current.os, updated_at: T2 };
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: { ...groupAck, replay: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Repetir envio pendente" }));
    await waitFor(() => expect(t.success).toHaveBeenCalledWith("Envio pendente confirmado pelo servidor."));
    expect(writerCalls()).toHaveLength(1);
    expect(writerCalls()[0][1]).toEqual(stored.args);
    expect(pendingRaw()).toBeNull();
    next.qc.clear();
  });
  it.each(["57014", "PGRST001", "504"])("ambiguous code %s keeps pending and never claims nothing was saved", async (code) => {
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: null, error: { code, message: "timeout" } });
    const h = mount();
    let msg = "";
    await act(async () => { await t.submit(payload()).catch((e: Error) => { msg = e.message; }); });
    expect(msg).toMatch(/pode ter sido gravada/);
    expect(msg).not.toMatch(/nenhuma etapa|nada foi/i);
    expect(pendingRaw()).not.toBeNull();
    h.qc.clear();
  });
  it("same-mount uncertain result can be settled by the exact replay button", async () => {
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: null, error: { code: "57014", message: "timeout" } });
    const h = mount();
    await act(async () => { await t.submit(payload()).catch(() => {}); });
    const stored = JSON.parse(pendingRaw() as string);
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: { ...groupAck, replay: true }, error: null });
    fireEvent.click(await screen.findByRole("button", { name: "Repetir envio pendente" }));
    await waitFor(() => expect(pendingRaw()).toBeNull());
    expect(writerCalls().at(-1)?.[1]).toEqual(stored.args);
    h.qc.clear();
  });
  it("definitive PT409 clears the reservation", async () => {
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: null, error: { code: "PT409", message: "DELIVERY_OBSERVED_CONFLICT" } });
    const h = mount();
    await act(async () => { await expect(t.submit(payload())).rejects.toThrow(/PT409/); });
    expect(pendingRaw()).toBeNull();
    h.qc.clear();
  });
  it("late ACK after tenant switch is not adopted (no success, pending stays for original session)", async () => {
    let release!: (v: any) => void;
    t.rpc.mockImplementation((fn: string) => fn === CAPABILITY_RPC ? Promise.resolve({ data: cap, error: null }) : new Promise(r => { release = r; }));
    const h = mount();
    let settled: Promise<unknown> = Promise.resolve();
    await act(async () => { settled = t.submit(payload()).catch((e: Error) => e); await new Promise(r => setTimeout(r, 0)); });
    await waitFor(() => expect(writerCalls()).toHaveLength(1));
    t.auth = { ...t.auth, profile: { ...t.auth.profile, organization_id: ORG_B } };
    h.rerender(<Entregas />);
    await act(async () => { release({ data: groupAck, error: null }); await settled; });
    expect(t.success).not.toHaveBeenCalled();
    expect(pendingRaw()).not.toBeNull();
    h.qc.clear();
  });
  it("replay refused (42501 after revocation) keeps the original pending, marks reconciliation and blocks new keys", async () => {
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: null, error: { code: "57014", message: "timeout" } });
    const h = mount();
    await act(async () => { await t.submit(payload()).catch(() => {}); });
    const before = JSON.parse(pendingRaw() as string);
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: null, error: { code: "42501", message: "revoked" } });
    fireEvent.click(await screen.findByRole("button", { name: "Repetir envio pendente" }));
    await screen.findByText(/não prova que o envio original não foi gravado/);
    const after = JSON.parse(pendingRaw() as string);
    expect(after).toMatchObject({ ...before, replayRejected: "42501" });
    expect(screen.queryByRole("button", { name: "Repetir envio pendente" })).toBeNull();
    t.rpc.mockClear();
    await act(async () => { await expect(t.submit(payload({ grupoId: "30000000-0000-4000-8000-000000000777" }))).rejects.toThrow(/resultado incerto/); });
    expect(t.rpc).not.toHaveBeenCalled();
    h.unmount(); h.qc.clear();
    mount();
    await screen.findByText(/consulta\/reconciliação autorizada/);
  });
  it("PT409 on replay (CAS changed) is not proof of no-commit: pending kept", async () => {
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: null, error: { code: "57014", message: "timeout" } });
    const h = mount();
    await act(async () => { await t.submit(payload()).catch(() => {}); });
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: null, error: { code: "PT409", message: "DELIVERY_OBSERVED_CONFLICT" } });
    fireEvent.click(await screen.findByRole("button", { name: "Repetir envio pendente" }));
    await screen.findByText(/não prova que o envio original não foi gravado/);
    expect(JSON.parse(pendingRaw() as string).replayRejected).toBe("PT409");
    h.qc.clear();
  });
  it("two mounted consumers sharing storage, interleaved: Y's attempt is never overwritten nor cleared by X's ACK", async () => {
    // Same-document simulation of two consumers (not real browser tabs).
    const X = "30000000-0000-4000-8000-0000000000aa", Y = "30000000-0000-4000-8000-0000000000bb";
    const releases: Record<string, (v: any) => void> = {};
    t.rpc.mockImplementation((fn: string, args: any) => fn === CAPABILITY_RPC ? Promise.resolve({ data: cap, error: null }) : new Promise(r => { releases[args.p_request_key] = r; }));
    const a = mount();
    let pa: Promise<unknown> = Promise.resolve();
    await act(async () => { pa = t.submit(payload({ grupoId: X })).catch((e: Error) => e); await new Promise(r => setTimeout(r, 0)); });
    await waitFor(() => expect(releases[X]).toBeDefined());
    // Consumer B mounted after X reserved; simulate Y written by another tab that raced past its own check.
    const yAttempt = JSON.parse(pendingRaw() as string); yAttempt.args = { ...yAttempt.args, p_request_key: Y };
    localStorage.setItem(`${PFX}${GROUP_RPC}:${Y}`, JSON.stringify(yAttempt));
    const b = mount();
    // B sees pending and refuses a new key without dispatch.
    const before = writerCalls().length;
    await act(async () => { await expect(t.submit(payload({ grupoId: "30000000-0000-4000-8000-0000000000cc" }))).rejects.toThrow(/incerto|outra aba/); });
    expect(writerCalls().length).toBe(before);
    // X's exact ACK arrives: clears only X.
    await act(async () => { releases[X]({ data: groupAck, error: null }); await pa; });
    expect(pendingKeys()).toEqual([`${PFX}${GROUP_RPC}:${Y}`]);
    expect(JSON.parse(localStorage.getItem(`${PFX}${GROUP_RPC}:${Y}`) as string).args.p_request_key).toBe(Y);
    a.qc.clear(); b.qc.clear();
  });
  it("double submit dispatches a single writer", async () => {
    const h = mount();
    await act(async () => { await Promise.all([t.submit(payload()).catch(() => {}), t.submit(payload()).catch(() => {})]); });
    expect(writerCalls()).toHaveLength(1);
    h.qc.clear();
  });
  it("cancel uses the revision seen when the dialog opened and refuses if it changed", async () => {
    t.rows = [{ id: E1, status: "separado", updated_at: T1, clientes: { nome: "Cliente" } }];
    t.current.entrega = { id: E1, status: "separado", updated_at: T2 };
    const h = mount();
    fireEvent.click((await screen.findAllByRole("button", { name: "Cancelar" }))[0]);
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Cliente recusou" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
    await waitFor(() => expect(t.error).toHaveBeenCalledWith(expect.stringMatching(/mudou desde a abertura/)));
    expect(writerCalls()).toHaveLength(0);
    t.current.entrega = { id: E1, status: "separado", updated_at: T1 };
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
    await waitFor(() => expect(writerCalls()).toHaveLength(1));
    expect(writerCalls()[0][1]).toEqual({ p_entrega_id: E1, p_motivo: "Cliente recusou", p_observed: T1 });
    h.qc.clear();
  });
});
