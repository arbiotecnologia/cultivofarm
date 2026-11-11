import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { readAttemptStatus, persistJournal, parseOrderJournal } from '@/lib/authz/orderJournal';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { withPaymentMethod, TEST_CONTRACT } from "@/test/helpers/b2bPaymentMethodMock";
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
  epoch: 0, revoked:false,
  draft: null as null | { partnerId: string; addItemId: string | null; requestedDeliveryDate: string | null; items: Array<{ itemId: string; volumeId: string; quantity: number }> },
  rpc: vi.fn(), table: vi.fn(), writes: vi.fn(),
  options: null as null | ((args: Record<string, unknown>) => unknown), ack: null as null | Record<string, unknown>,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true, senha_provisoria: false },
  role: "parceiro_b2b", roles: ["parceiro_b2b"], loading: false, authzReady: true, authzEpoch: state.epoch,
  checkAuthzAccess: () => !state.revoked, signOut: vi.fn(),
  setSafePartnerOrderDraft: vi.fn(), takeSafePartnerOrderDraft: () => state.draft,
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
  rpc: (...args: unknown[]) => state.rpc(...args),
  from: (...args: unknown[]) => state.table(...args),
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  }, removeChannel: vi.fn(),
} }));

import Layout from "@/pages/portal-parceiro/PortalParceiroLayout";
import NovoPedido from "@/pages/portal-parceiro/NovoPedido";
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
  Object.assign(state, { tenant: "22222222-2222-4222-8222-222222222222", partner: "33333333-3333-4333-8333-333333333333", epoch: 0, revoked:false, draft: null });
  vi.clearAllMocks();
  vi.stubGlobal("indexedDB",new IDBFactory());vi.stubGlobal("crypto",webcrypto);
  sessionStorage.clear();
  state.table.mockImplementation((table: string) => {
    if (table === "catalogo_volumes") return { select: () => ({ eq: () => response([{ ...VOLUME, produto_id: state.partner }]) }) };
    if (table === "partner_orders") return { select: () => ({ eq: () => ({ maybeSingle: () => response({
      id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b",
      c2_external_origin_snapshot: { contract: "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1", accounting_validated: false },
    }) }) }) };
    throw new Error(`Unexpected table read: ${table}`);
  });
  Object.assign(state, { options: null, ack: null });
  state.rpc.mockImplementation(withPaymentMethod((name: string, args?: Record<string, unknown>) => {
    if(name==='partner_order_journal_capability_v1') return Promise.resolve({data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}});
    const context = { contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant,
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
    if (name === "create_partner_order_secure") return response({ id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", total: 10 });
    if (name === "get_my_commercial_orders_projection") return response({
      partner_id: state.partner,
      orders: [{ id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", status: "em_analise_comercial", created_at: "2026-10-26T15:00:00+00:00" }],
    });
    if (name === "log_my_access_denied_secure") return response(null);
    state.writes(name); throw new Error(`Unexpected RPC: ${name}`);
  }, (n: string, a?: Record<string, unknown>) => state.rpc(n, a)));
});
afterEach(()=>{cleanup();sessionStorage.clear();});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Routes>
    <Route path="/portal-parceiro" element={<B2BRouteGuard><Layout /></B2BRouteGuard>}>
      <Route element={<EntitlementOutlet />}><Route path="catalogo" element={<NovoPedido />} /></Route>
      <Route path="pedidos" element={<p>MeusPedidos legado não deve montar</p>} />
    </Route><Route path="/sem-permissao" element={<p>Negado</p>} />
  </Routes></MemoryRouter></QueryClientProvider>);
  return { view, client };
}


async function toPayment(mounted = mount()) {
  await screen.findByText("Produto local");
  fireEvent.click(screen.getByRole("button", { name: "Adicionar ao pedido" }));
  fireEvent.click(await screen.findByRole("button", { name: "Adicionar ao carrinho" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Continuar para condição de pagamento" })[0]);
  fireEvent.click(await screen.findByRole("button", { name: /À vista/ }));
  return mounted;
}
const calls = (n: string) => state.rpc.mock.calls.filter(([x]) => x === n).map(([, a]) => a as Record<string, unknown>);
const submitBtn = () => screen.findByRole("button", { name: "Enviar pedido para análise" });

// Tela, hook, journal, IndexedDB e mutation reais; somente transporte simulado, sem rede.
type Args=Record<string,unknown>;
const K1='44444444-4444-4444-8444-444444444444', K2='66666666-6666-4666-8666-666666666666';
const ID='55555555-5555-4555-8555-555555555555', CT='C2_ORDER_JOURNAL_V1';
const SLOT=JSON.stringify([state.actor,state.tenant,state.partner]);
let terminal:'none'|'closed'|'committed'|'uncertain'='none';
let generation=1;
let failure=false;
let holdStatus:Promise<void>|null=null;
let holdReserve:Promise<void>|null=null;
let holdCreate:Promise<void>|null=null;
const journal=()=>({contract:CT,key:generation===1?K1:K2,generation,state:terminal,
 ...(terminal==='committed'?{order_id:ID,numero:'PB-LOCAL'}:{}),
 predecessors:generation===1?[]:[{key:K1,generation:1,state:'closed'}]});
beforeEach(()=>{
 terminal='none';generation=1;failure=false;holdStatus=null;holdReserve=null;holdCreate=null;
 const base=state.rpc.getMockImplementation();
 if(!base)throw Error('missing transport');
 state.rpc.mockImplementation((n:string,a:Args={})=>{
  if(n==='partner_order_journal_capability_v1')return response({contract:CT,enabled:true,actor_id:state.actor,organization_id:state.tenant,partner_id:state.partner});
  if(n==='partner_order_attempt_status_v1')return (holdStatus??Promise.resolve()).then(()=>failure?{data:null,error:{code:'42501',message:'forbidden_partner'}}:
   {data:terminal==='none'?{contract:'C2_ORDER_ATTEMPT_STATUS_V1',state:'none',actor_id:state.actor,organization_id:state.tenant,partner_id:state.partner}:journal(),error:null});
  if(n==='b2b_list_payment_condition_options_secure')return response({contract:TEST_CONTRACT,partner_id:state.partner,payment_plan_id:a.p_payment_plan_id,mode:'required',due_basis:'nf_issue',options:[{payment_method:'boleto',payment_condition_version:1,payment_deadline_days:30,available:true,payment_method_name:'Boleto',installment_count:1,monthly_rate:0}]});
  if(n==='simulate_b2b_payment_condition_secure')return response({partner_id:state.partner,pricing_mode:'discount_from_base',quote_required:false,cart_hash:'hash-boleto-18',
   payment_plan:{...PLAN,pricing_mode:'discount_from_base'},
   amounts:{table_amount:18,discount_amount:0,net_amount_after_discount:18,financial_interest_amount:0,final_amount:18},
   final_amount:18,installment_count:1,schedule_estimated:true,due_basis:'nf_issue',payment_condition_contract:TEST_CONTRACT,payment_choice:a.p_payment_choice,
   payment_condition:{payment_method_name:'Boleto',installment_count:1,monthly_rate:0,deadline_days:30,due_basis:'nf_issue',estimated:true},
   schedule:[{installment_number:1,due_date:minDeliveryDateISO(),amount:18,principal_amount:18,interest_amount:0}],warnings:[],credit:{credit_limit:1000,exposicao_projetada:18,credit_checked:true}});
  if(n==='recover_partner_order_attempt_v1'){
   if(a.p_advance && (a.p_expected_key!==K1 || a.p_expected_generation!==generation ||
    !['closed','committed'].includes(terminal) || a.p_ack_order!==(terminal==='committed'?ID:null)))return Promise.resolve({data:null,error:{code:'PT409',message:'C2DJ_CAS_CONFLICT'}});
   if(a.p_advance || terminal==='none')return (holdReserve??Promise.resolve()).then(()=>{
    const pred=terminal==='none'?[]:[{key:K1,generation:1,state:terminal,...(terminal==='committed'?{order_id:ID,numero:'PB-LOCAL'}:{})}];
    generation=terminal==='none'?1:2;terminal='uncertain';
    return {data:{contract:CT,key:generation===1?K1:K2,generation,state:'reserved',predecessors:pred},error:null};
   });
   return response(journal());
  }
  // No hosted write. A held, deliberately failed simulated dispatch verifies lock + key only.
  if(n==='create_partner_order_condition_secure')return (holdCreate??Promise.resolve()).then(()=>({data:null,error:{code:'XX000',message:'synthetic_dispatch_stopped'}}));
  return base(n,a);
 });
});
const reserves=()=>calls('recover_partner_order_attempt_v1');
async function simulate(view=mount()){
 await toPayment(view);fireEvent.click(await screen.findByRole('radio',{name:/Boleto · 1x · 0%/}));
 await waitFor(()=>expect(calls('simulate_b2b_payment_condition_secure')).toHaveLength(1));
 return view;
}
it('closed → iniciar → simular → habilitado; uma reserva CAS somente no dispatch, duplo clique não duplica',async()=>{
 terminal='closed';const view=mount();
 // Primeiro teste do arquivo paga o carregamento frio (módulos, IndexedDB, leitura do journal) sob suíte conjunta:
 // espera a leitura real do status e só então a ação, sem afrouxar nenhuma asserção.
 await waitFor(()=>expect(calls('partner_order_attempt_status_v1').length).toBeGreaterThan(0),{timeout:5000});
 fireEvent.click(await screen.findByRole('button',{name:'Iniciar nova tentativa'},{timeout:5000}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Iniciar nova tentativa'})).toBeNull());
 expect(reserves()).toHaveLength(0);
 await simulate(view);const send=await submitBtn();await waitFor(()=>expect(send).toBeEnabled());
 expect(screen.getAllByText(/R\$ 18,00/).length).toBeGreaterThan(0);
 expect(reserves()).toHaveLength(0);
 let release:()=>void=()=>{};holdReserve=new Promise(r=>{release=r;});
 fireEvent.click(send);fireEvent.click(send);
 await waitFor(()=>expect(reserves()).toHaveLength(1));
 expect(reserves()[0]).toMatchObject({p_advance:true,p_expected_key:K1,p_expected_generation:1,p_ack_order:null});
 expect(calls('create_partner_order_condition_secure')).toHaveLength(0);
 await act(async()=>{release();});
 await waitFor(()=>expect(calls('create_partner_order_condition_secure')).toHaveLength(1));
 expect(calls('create_partner_order_condition_secure')[0]).toMatchObject({p_idempotency_key:K2});
 expect(reserves()).toHaveLength(1);
});
it('none inicial só lê; simulação permite envio e reserva apenas no clique',async()=>{
 await simulate();const send=await submitBtn();await waitFor(()=>expect(send).toBeEnabled());
 expect(reserves()).toHaveLength(0);fireEvent.click(send);
 await waitFor(()=>expect(calls('create_partner_order_condition_secure')).toHaveLength(1));
 expect(reserves()).toHaveLength(1);expect(reserves()[0]).toMatchObject({p_advance:false});
});
it('committed exige ACK explícito do pedido exato antes da intenção, sem reservar no ACK',async()=>{
 terminal='committed';const view=mount();
 fireEvent.click(await screen.findByRole('button',{name:'Confirmar pedido existente e iniciar novo'}));
 expect(reserves()).toHaveLength(0);
 fireEvent.click(await screen.findByRole('button',{name:'Confirmar e iniciar novo'}));
 await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
 expect(reserves()).toHaveLength(0);await simulate(view);
 const send=await submitBtn();await waitFor(()=>expect(send).toBeEnabled());fireEvent.click(send);
 await waitFor(()=>expect(reserves()).toHaveLength(1));
 expect(reserves()[0]).toMatchObject({p_advance:true,p_expected_key:K1,p_expected_generation:1,p_ack_order:ID});
});
it('reload perde intenção closed e não reserva; precisa de novo clique explícito',async()=>{
 terminal='closed';const view=mount();fireEvent.click(await screen.findByRole('button',{name:'Iniciar nova tentativa'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Iniciar nova tentativa'})).toBeNull());
 view.view.unmount();mount();
 expect(await screen.findByRole('button',{name:'Iniciar nova tentativa'})).toBeEnabled();
 expect(reserves()).toHaveLength(0);expect(calls('create_partner_order_condition_secure')).toHaveLength(0);
});
it('outra aba publica uncertain e invalida intenção com diálogo aberto; handler não envia nova geração',async()=>{
 const view=await simulate();const send=await submitBtn();await waitFor(()=>expect(send).toBeEnabled());
 terminal='uncertain';
 await act(async()=>{await readAttemptStatus(SLOT,state.partner,()=>true);});
 await act(async()=>{await persistJournal(SLOT,parseOrderJournal(journal()),()=>true,undefined,'another-tab-payload');});
 // Uncertain can only replay its exact original payload; changed payload must never dispatch.
 fireEvent.click(send);
 await waitFor(()=>expect(reserves()).toHaveLength(1));
 expect(reserves()[0]).toMatchObject({p_advance:false,p_expected_key:null});
 await waitFor(()=>expect(send).toBeEnabled());
 expect(calls('create_partner_order_condition_secure')).toHaveLength(0);
});
it('status falho bloqueia botão e não reserva nem despacha',async()=>{
 failure=true;await simulate();expect(await submitBtn()).toBeDisabled();
 fireEvent.click(await submitBtn());expect(reserves()).toHaveLength(0);expect(calls('create_partner_order_condition_secure')).toHaveLength(0);
});
it('checking/pending conserva bloqueio mesmo com simulação pronta',async()=>{
 let release:()=>void=()=>{};holdStatus=new Promise(r=>{release=r;});
 await simulate();expect(await submitBtn()).toBeDisabled();expect(reserves()).toHaveLength(0);
 await act(async()=>{release();});await waitFor(async()=>expect(await submitBtn()).toBeEnabled());
});
it('scope revogado entre clique e reserva impede dispatch e mantém nenhuma criação',async()=>{
 await simulate();const send=await submitBtn();await waitFor(()=>expect(send).toBeEnabled());
 let release:()=>void=()=>{};holdReserve=new Promise(r=>{release=r;});fireEvent.click(send);
 await waitFor(()=>expect(reserves()).toHaveLength(1));state.revoked=true;
 await act(async()=>{release();});
 expect(calls('create_partner_order_condition_secure')).toHaveLength(0);
});
it('outra aba conclui geração e fecha diálogo; clique no controle antigo não contorna terminal',async()=>{
 await simulate();const send=await submitBtn();await waitFor(()=>expect(send).toBeEnabled());
 terminal='closed';await act(async()=>{await readAttemptStatus(SLOT,state.partner,()=>true);});
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());fireEvent.click(send);
 expect(reserves()).toHaveLength(0);expect(calls('create_partner_order_condition_secure')).toHaveLength(0);
});
it('falha na releitura depois de intenção valida bloqueia handler e aposenta next',async()=>{
 terminal='closed';const view=mount();fireEvent.click(await screen.findByRole('button',{name:'Iniciar nova tentativa'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Iniciar nova tentativa'})).toBeNull());
 await simulate(view);const send=await submitBtn();await waitFor(()=>expect(send).toBeEnabled());
 // A new terminal observation retires the intent; status failure must never restore it.
 generation=2;terminal='committed';await act(async()=>{await readAttemptStatus(SLOT,state.partner,()=>true);});
 failure=true;fireEvent.click(await screen.findByRole('button',{name:'Confirmar pedido existente e iniciar novo'}));
 fireEvent.click(await screen.findByRole('button',{name:'Confirmar e iniciar novo'}));
 await screen.findByText('Não foi possível verificar a continuidade do pedido. Nada foi liberado.');
 fireEvent.click(send);expect(reserves()).toHaveLength(0);expect(calls('create_partner_order_condition_secure')).toHaveLength(0);
});
