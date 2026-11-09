import 'fake-indexeddb/auto';
import { withPaymentMethod, pickTestPix } from "@/test/helpers/b2bPaymentMethodMock";
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { minDeliveryDateISO } from "@/lib/b2bDeliveryDate";
import { formatDateDisplay } from "@/lib/date-utils";

// Fixture local apenas: transporte sintético, nunca serviços hospedados.
// Layout, guards, NovoPedido e hooks de catálogo/pedido permanecem reais.
const state = vi.hoisted(() => ({
  actor: "11111111-1111-4111-8111-111111111111",
  tenant: "22222222-2222-4222-8222-222222222222",
  partner: "33333333-3333-4333-8333-333333333333",
  epoch: 0, roles: ["parceiro_b2b"] as string[],
  draft: null as null | { partnerId: string; addItemId: string | null; requestedDeliveryDate: string | null; items: Array<{ itemId: string; volumeId: string; quantity: number }> },
  rpc: vi.fn(), table: vi.fn(), writes: vi.fn(),
  lastDraft: null as any, createImpl: null as null | ((args: Record<string, unknown>) => unknown), actorOverride: null as string | null, revoked: false, closeImpl: null as null | ((args: Record<string, unknown>) => unknown),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: state.actorOverride ?? state.actor }, profile: { user_id: state.actorOverride ?? state.actor, organization_id: state.tenant, ativo: true, senha_provisoria: false },
  role: "parceiro_b2b", roles: state.roles, loading: false, authzReady: true, authzEpoch: state.epoch,
  checkAuthzAccess: () => !state.revoked, signOut: vi.fn(),
  setSafePartnerOrderDraft: (d: unknown) => { if (d) state.lastDraft = d as typeof state.draft; }, takeSafePartnerOrderDraft: () => state.draft,
}) }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({
  status: "ready", features: new Set(["catalogo_precos", "pedidos_b2b"]),
}) }));
vi.mock("@/hooks/useAvailableContexts", () => ({ useAvailableContexts: () => ({
  ready: true, isLoading: false, isError: false, data: { has_b2b_access: true, available_contexts: ["b2b"] },
}) }));
vi.mock("@/hooks/useBranding", () => ({ usePortalBranding: () => ({}) }));
vi.mock("@/hooks/useNavCollapseState", () => ({ useSidebarOpenState: () => ({ open: false, setOpen: vi.fn() }) }));
vi.mock("@/components/nav/PortalSidebar", () => ({ PortalSidebar: () => null }));
vi.mock("@/components/portal/PortalTopBar", () => ({ PortalTopBar: () => null }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, SidebarTrigger: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  // Pré-instalação do status somente leitura (Opção A): PGRST202 exato mantém o comportamento anterior.
  rpc: (...args: unknown[]) => args[0]==='partner_order_attempt_status_v1' ? Promise.resolve({data:null,error:{code:'PGRST202',message:'Could not find the function public.partner_order_attempt_status_v1'}}) : state.rpc(...args),
  from: (...args: unknown[]) => state.table(...args),
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  }, removeChannel: vi.fn(),
} }));

import Layout from "@/pages/portal-parceiro/PortalParceiroLayout";
import NovoPedido from "@/pages/portal-parceiro/NovoPedido";
import { recoverOrderJournal } from "@/lib/authz/orderJournal";
import { EntitlementOutlet } from "@/components/guards/EntitlementOutlet";
import { B2BRouteGuard } from "@/components/guards/B2BRouteGuard";

const VOLUME = { id: "vol-1", item_tipo: "produto", produto_id: state.partner, microrganismo_id: null,
  volume_ml: 1000, rotulo: "1 L", preco_brl: 10, moeda: "BRL", ativo: true, ordem: 1 };
const PLAN = { id: "plan-1", name: "À vista", code: "CASH", description: null, plan_type: "cash",
  max_days: 0, months_count: 1, installment_count: 1, discount_percent: 0, monthly_interest_percent: 0,
  interest_type: "none", requires_credit_approval: false, requires_guarantee: false,
  requires_financial_approval: false, minimum_order_amount: null, sort_order: 1 };

function response(data: unknown) {
  const promise = Promise.resolve({ data, error: null });
  return Object.assign(promise, { abortSignal: () => promise });
}
beforeEach(() => {
  Object.assign(state, { lastDraft: null, createImpl: null, actorOverride: null, revoked: false, closeImpl: null, roles: ["parceiro_b2b"], tenant: "22222222-2222-4222-8222-222222222222", partner: "33333333-3333-4333-8333-333333333333", epoch: 0, draft: null });
  vi.clearAllMocks();
  state.table.mockImplementation((table: string) => {
    if (table === "catalogo_volumes") return { select: () => ({ eq: () => response([{ ...VOLUME, produto_id: state.partner }]) }) };
    if (table === "partner_orders") return { select: () => ({ eq: () => ({ maybeSingle: () => response({
      id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b",
      c2_external_origin_snapshot: { contract: "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1", accounting_validated: false },
    }) }) }) };
    throw new Error(`Unexpected table read: ${table}`);
  });
  state.rpc.mockImplementation(withPaymentMethod((name: string, args?: Record<string, unknown>) => {
    if(name==='partner_order_journal_capability_v1') return Promise.resolve({data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}});
    const context = { contract: "C2_MULTIPROFILE_V1", actor_id: state.actorOverride ?? state.actor, tenant_id: state.tenant,
      organization_id: state.tenant, commercial_owner_organization_id: state.tenant, mode: "commercial_owner",
      partner_id: state.partner, external_roles: ["parceiro_b2b"], manager: true, technician: false, role: "parceiro_b2b", papel: "gestor" };
    if (name === "get_my_commercial_partner_context") return response(context);
    if (name === "get_my_commercial_partner_projection") return response({ ...context, id: state.partner, ativo: true,
      codigo: "LOCAL", razao_social: "Parceiro local", capabilities: { contract: "C2_CAT_V1", catalog_read: true, sheets_read: true },
      order_capabilities: { contract: "C2_OWNER_ORDER_V1", order_create: true } });
    // Pré-instalação: leitor escopado ausente (PGRST202) mantém a leitura de volumes anterior.
    if (name === "get_partner_catalog_volumes_secure") { const p = Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.get_partner_catalog_volumes_secure(p_partner_id) in the schema cache" } }); return Object.assign(p, { abortSignal: () => p }); }
    if (name === "get_partner_packaging_offers_secure") { const p = Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.get_partner_packaging_offers_secure(p_partner_id) in the schema cache" } }); return Object.assign(p, { abortSignal: () => p }); }
    if (name === "get_partner_catalog_secure") return response([{
      catalog_contract: "C1B_DUAL_TENANT_V1", item_id: args?.p_partner_id, item_tipo: "produto",
      produto_nome: "Produto local", produto_codigo: "LOCAL", familia_catalogo: "biologico",
      valor_litro_brl: 10, preco_parceiro: 10, desconto_percentual: 0, unidade_preco_principal: "litro", ficha_aprovada: false,
    }]);
    if (name === "rpc_b2b_list_selectable_payment_plans") return response([PLAN]);
    if (name === "simulate_b2b_payment_plan_secure") return response({
      partner_id: state.partner, pricing_mode: "discount_from_base", quote_required: false, cart_hash: "hash-1",
      payment_plan: { id: PLAN.id, name: PLAN.name, code: PLAN.code, pricing_mode: "discount_from_base", discount_percent: 0,
        monthly_interest_percent: 0, months_count: 1, installment_count: 1, requires_financial_approval: false,
        requires_credit_approval: false, requires_guarantee: false },
      amounts: { table_amount: 10, discount_amount: 0, net_amount_after_discount: 10, financial_interest_amount: 0, final_amount: 10 },
      schedule: [{ installment_number: 1, due_date: minDeliveryDateISO(), amount: 10, principal_amount: 10, interest_amount: 0 }],
      warnings: [],
    });
    if (name === "close_partner_order_attempt_v1" && state.closeImpl) return state.closeImpl(args ?? {}) as never;
    if (name === "create_partner_order_secure" && state.createImpl) return state.createImpl(args ?? {}) as never;
    if (name === "create_partner_order_secure") return response({ id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", total: 10 });
    if (name === "get_my_commercial_orders_projection") return response({
      partner_id: state.partner,
      orders: [{ id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", status: "em_analise_comercial", created_at: "2026-10-26T15:00:00+00:00" }],
    });
    if (name === "log_my_access_denied_secure") return response(null);
    state.writes(name); throw new Error(`Unexpected RPC: ${name}`);
  }, (n: string, a?: Record<string, unknown>) => state.rpc(n, a)));
});
afterEach(cleanup);
let client!: QueryClient;
const tree=()=><QueryClientProvider client={client}><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Routes>
    <Route path="/portal-parceiro" element={<B2BRouteGuard><Layout /></B2BRouteGuard>}>
      <Route element={<EntitlementOutlet />}><Route path="catalogo" element={<NovoPedido />} /></Route>
      <Route path="pedidos" element={<p>Lista de pedidos</p>} />
    </Route><Route path="/sem-permissao" element={<p>Negado</p>} />
  </Routes></MemoryRouter></QueryClientProvider>;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Routes>
    <Route path="/portal-parceiro" element={<B2BRouteGuard><Layout /></B2BRouteGuard>}>
      <Route element={<EntitlementOutlet />}><Route path="catalogo" element={<NovoPedido />} /></Route>
      <Route path="pedidos" element={<p>Lista de pedidos</p>} />
    </Route><Route path="/sem-permissao" element={<p>Negado</p>} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

// Diálogo React do ACK explícito: NovoPedido/hooks/journal reais, transporte sintético.
type Args = Record<string, unknown>;
const K1='44444444-4444-4444-8444-444444444444', ID1='55555555-5555-4555-8555-555555555555', K2='66666666-6666-4666-8666-666666666666';
const CT='C2_ORDER_JOURNAL_V1';
let srv:{key:string;gen:number;order:string;numero:string;state?:'reserved'|'uncertain'|'closed'|'committed'};
let hold:null|Promise<void>=null;
const advances=()=>state.rpc.mock.calls.filter(([n,a])=>n==='recover_partner_order_attempt_v1'&&(a as Args).p_advance).map(([,a])=>a as Args);
beforeEach(()=>{
  vi.stubGlobal('indexedDB',new IDBFactory()); vi.stubGlobal('crypto',webcrypto);
  srv={key:K1,gen:1,order:ID1,numero:'PB-001033'}; hold=null;
  const base=state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation(withPaymentMethod((name:string,args?:Args)=>{
    if(name==='partner_order_journal_capability_v1') return Promise.resolve({data:{contract:CT,enabled:true,actor_id:state.actorOverride??state.actor,organization_id:state.tenant,partner_id:state.partner},error:null});
    if(name==='recover_partner_order_attempt_v1'){
      const terminal=srv.state??'committed';
      const cur={contract:CT,key:srv.key,generation:srv.gen,state:terminal,...(terminal==='committed'?{order_id:srv.order,numero:srv.numero}:{})};
      if(!args?.p_advance) return Promise.resolve({data:cur,error:null});
      if(args.p_expected_key!==srv.key||args.p_expected_generation!==srv.gen||!['closed','committed'].includes(terminal)||args.p_ack_order!==(terminal==='committed'?srv.order:null)) return Promise.resolve({data:null,error:{code:'PT409',message:'C2DJ_CAS_CONFLICT'}});
      const pred={key:srv.key,generation:srv.gen,state:terminal,...(terminal==='committed'?{order_id:srv.order,numero:srv.numero}:{})};
      const out={contract:CT,key:K2,generation:srv.gen+1,state:'reserved',predecessors:[pred]};
      return (hold??Promise.resolve()).then(()=>({data:out,error:null}));
    }
    if(name==='close_partner_order_attempt_v1') {
      srv.state='closed';
      return response({contract:'C2_ORDER_ATTEMPT_CLOSURE_V1',state:'closed'});
    }
    return base(name,args);
  }, (n: string, a?: Record<string, unknown>) => state.rpc(n, a)));
});
async function waitCart(){ await waitFor(()=>expect(screen.getAllByRole('button',{name:'Continuar para condição de pagamento'})[0]).toBeEnabled()); }
const ackBtn=()=>screen.findByRole('button',{name:'Confirmar pedido existente e iniciar novo'});
async function openDialog(){ await screen.findAllByText('Produto local'); fireEvent.click(await ackBtn()); return screen.findByRole('alertdialog'); }

it('nunca usa window.confirm; diálogo cita o número e Voltar não chama RPC nem limpa carrinho',async()=>{
  const native=vi.spyOn(window,'confirm');
  mount(); await screen.findAllByText('Produto local');
  fireEvent.click(screen.getByRole('button',{name:'Adicionar ao pedido'}));
  fireEvent.click(await screen.findByRole('button',{name:'Adicionar ao carrinho'}));
  await waitCart();
  const d=await openDialog();
  expect(d.textContent).toContain('PB-001033');
  const before=state.rpc.mock.calls.length;
  fireEvent.click(screen.getByRole('button',{name:'Voltar'}));
  await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(state.rpc.mock.calls.length).toBe(before); expect(advances()).toHaveLength(0);
  expect(native).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button',{name:'Continuar para condição de pagamento'})[0]).toBeEnabled();
});
it('duplo clique em confirmar avança uma única vez com key/geração/pedido capturados',async()=>{
  let release!:()=>void; hold=new Promise(r=>{release=r;});
  mount(); await openDialog();
  const ok=screen.getByRole('button',{name:'Confirmar e iniciar novo'});
  fireEvent.click(ok); fireEvent.click(ok);
  await waitFor(()=>expect(advances()).toHaveLength(1));
    await act(async()=>{release(); await Promise.resolve();});
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Confirmar pedido existente e iniciar novo'})).toBeNull());
  expect(advances()).toHaveLength(1);
  expect(advances()[0]).toMatchObject({p_expected_key:K1,p_expected_generation:1,p_ack_order:ID1});
});
it('estado do servidor muda com o diálogo aberto (outra aba): não confirma geração errada',async()=>{
  mount(); await openDialog();
  const NEXT='77777777-7777-4777-8777-777777777777';
  srv={key:K2,gen:2,order:NEXT,numero:'PB-001034'};
  const base=state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation(withPaymentMethod((n:string,a?:Args)=>n==='recover_partner_order_attempt_v1'&&!a?.p_advance
    ? Promise.resolve({data:{contract:CT,key:K2,generation:2,state:'committed',order_id:NEXT,numero:'PB-001034',predecessors:[{key:K1,generation:1,state:'committed',order_id:ID1,numero:'PB-001033'}]},error:null})
    : base(n,a), (n: string, a?: Record<string, unknown>) => state.rpc(n, a)));
  const ok=screen.getByRole('button',{name:'Confirmar e iniciar novo'});
  // Releitura do controlador real (como outra aba) com o diálogo aberto.
  await act(async()=>{ await recoverOrderJournal(JSON.stringify([state.actor,state.tenant,state.partner]),state.partner,()=>true); });
  await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
  fireEvent.click(ok);
  await act(async()=>{});
  expect(advances()).toHaveLength(0);
  expect(await screen.findByText(/PB-001034/)).toBeTruthy();
});
it('revogação/troca de contexto com o diálogo aberto nega o avanço',async()=>{
  mount(); await openDialog();
  state.revoked=true;
  fireEvent.click(screen.getByRole('button',{name:'Confirmar e iniciar novo'}));
  await act(async()=>{});
  expect(advances()).toHaveLength(0);
});
it('troca de papel com o diálogo aberto fecha sem avançar',async()=>{
  const v=mount(); await openDialog();
  state.roles=['parceiro_b2b','tecnico'];
  v.rerender(tree());
  await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(advances()).toHaveLength(0);
});

const closures=()=>state.rpc.mock.calls.filter(([n])=>n==='close_partner_order_attempt_v1');
const creations=()=>state.rpc.mock.calls.filter(([n])=>n==='create_partner_order_secure');
it('comprador novo: reserva inicial conserva a chave e não oferece encerramento nem avança ao montar',async()=>{
  srv.state='reserved';
  mount(); await screen.findAllByText('Produto local');
  await waitFor(()=>expect(state.rpc.mock.calls.some(([n])=>n==='recover_partner_order_attempt_v1')).toBe(true));
  await act(async()=>{});
  expect(screen.queryByRole('button',{name:'Verificar e encerrar envio anterior'})).toBeNull();
  expect(closures()).toHaveLength(0); expect(advances()).toHaveLength(0); expect(creations()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Adicionar ao pedido'}));
  fireEvent.click(await screen.findByRole('button',{name:'Adicionar ao carrinho'}));
  await waitCart();
  fireEvent.click(screen.getAllByRole('button',{name:'Continuar para condição de pagamento'})[0]);
  fireEvent.click(await screen.findByRole('button',{name:/À vista/}));
  await pickTestPix();
  const send=await screen.findByRole('button',{name:'Enviar pedido para análise'});
  await waitFor(()=>expect(send).toBeEnabled()); fireEvent.click(send);
  await waitFor(()=>expect(creations()).toHaveLength(1));
  expect(creations()[0][1]).toMatchObject({p_idempotency_key:K1});
  expect(closures()).toHaveLength(0); expect(advances()).toHaveLength(0);
});
it('envio incerto só encerra após clique e conserva a geração terminal até novo clique',async()=>{
  srv.state='uncertain'; mount();
  const close=await screen.findByRole('button',{name:'Verificar e encerrar envio anterior'});
  expect(closures()).toHaveLength(0); expect(advances()).toHaveLength(0);
  fireEvent.click(close);
  await screen.findByRole('button',{name:'Iniciar nova tentativa'});
  expect(closures()).toHaveLength(1); expect(advances()).toHaveLength(0); expect(creations()).toHaveLength(0);
});
it('closed não avança na montagem; clique usa CAS sem confirmação fictícia de pedido',async()=>{
  srv.state='closed'; mount();
  const next=await screen.findByRole('button',{name:'Iniciar nova tentativa'});
  expect(advances()).toHaveLength(0); expect(closures()).toHaveLength(0);
  fireEvent.click(next);
  await waitFor(()=>expect(advances()).toHaveLength(1));
  expect(advances()[0]).toMatchObject({p_expected_key:K1,p_expected_generation:1,p_ack_order:null});
  expect(creations()).toHaveLength(0);
});
it('troca de conta do committed para comprador novo fecha ACK e não encerra nem avança a reserva',async()=>{
  const v=mount(); await openDialog();
  state.actorOverride='88888888-8888-4888-8888-888888888888'; srv.state='reserved';
  v.rerender(tree());
  await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
  await waitFor(()=>expect(state.rpc.mock.calls.filter(([n])=>n==='recover_partner_order_attempt_v1').length).toBeGreaterThan(1));
  await act(async()=>{});
  expect(screen.queryByRole('button',{name:'Verificar e encerrar envio anterior'})).toBeNull();
  expect(advances()).toHaveLength(0); expect(closures()).toHaveLength(0); expect(creations()).toHaveLength(0);
});
