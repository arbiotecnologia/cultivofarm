import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Local fixture authority only: never calls hosted services or invokes mutations.
// Layout, guards, NovoPedido, useMyPartner and all catalogue/order hooks stay real.
const state = vi.hoisted(() => ({
  actor: "11111111-1111-4111-8111-111111111111",
  tenant: "22222222-2222-4222-8222-222222222222",
  partner: "33333333-3333-4333-8333-333333333333",
  epoch: 0, entitled: true, loadingPlan: false, orderCreate: true, foreignProjection: false, scoped: null as null | { name: string | null },
  rpc: vi.fn(), table: vi.fn(), writes: vi.fn(), subscriptions: vi.fn(),
  pk: "absent" as "absent" | "pending" | "error" | "invalid" | "solid_unpriced" | "not_solid" | "offer",
  draft: null as unknown, toastWarn: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: (...a: unknown[]) => state.toastWarn(...a) }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true, senha_provisoria: false },
  role: "parceiro_b2b", roles: ["parceiro_b2b"], loading: false, authzReady: true, authzEpoch: state.epoch,
  checkAuthzAccess: () => true, signOut: vi.fn(),
  setSafePartnerOrderDraft: vi.fn(), takeSafePartnerOrderDraft: () => { const d = state.draft; state.draft = null; return d; },
}) }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({
  status: state.loadingPlan ? "loading" : "ready",
  features: new Set(state.entitled ? ["catalogo_precos", "pedidos_b2b"] : []),
}) }));
vi.mock("@/hooks/useAvailableContexts", () => ({ useAvailableContexts: () => ({
  ready: true, isLoading: false, isError: false, data: { has_b2b_access: true, available_contexts: ["b2b"] },
}) }));
// Unrelated shell infrastructure is excluded, not the route or domain readers.
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
    const channel = { on: () => channel, subscribe: () => { state.subscriptions(); return channel; } };
    return channel;
  }, removeChannel: vi.fn(),
} }));

import Layout from "@/pages/portal-parceiro/PortalParceiroLayout";
import NovoPedido from "@/pages/portal-parceiro/NovoPedido";
import { EntitlementOutlet } from "@/components/guards/EntitlementOutlet";
import { B2BRouteGuard } from "@/components/guards/B2BRouteGuard";

const PKG = "66666666-6666-4666-8666-666666666666";
function response(data: unknown) {
  const promise = Promise.resolve({ data, error: null });
  return Object.assign(promise, { abortSignal: () => promise });
}
beforeEach(() => {
  Object.assign(state, { pk: "absent", draft: null, tenant: "22222222-2222-4222-8222-222222222222", partner: "33333333-3333-4333-8333-333333333333", epoch: 0, entitled: true, loadingPlan: false, orderCreate: true, foreignProjection: false, scoped: null });
  vi.clearAllMocks();
  state.table.mockImplementation((table: string) => {
    if (table !== "catalogo_volumes") throw new Error(`Unexpected table read: ${table}`);
    return { select: () => ({ eq: () => response([]) }) };
  });
  state.rpc.mockImplementation((name: string, args?: { p_partner_id?: string }) => {
    if(name==='partner_order_journal_capability_v1') return Promise.resolve({data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}});
    const context = { contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant,
      organization_id: state.tenant, commercial_owner_organization_id: state.tenant, mode: "commercial_owner",
      partner_id: state.partner, external_roles: ["parceiro_b2b"], manager: true, technician: false, role: "parceiro_b2b", papel: "gestor" };
    if (name === "get_my_commercial_partner_context") return response(context);
    if (name === "get_my_commercial_partner_projection") return response({ ...context, tenant_id: state.foreignProjection ? "foreign-tenant" : state.tenant, id: state.partner, ativo: true,
      codigo: "LOCAL", razao_social: "Parceiro local", capabilities: { contract: "C2_CAT_V1", catalog_read: true, sheets_read: true },
      order_capabilities: { contract: "C2_OWNER_ORDER_V1", order_create: state.orderCreate } });
    if (name === "rpc_b2b_list_selectable_payment_plans") return response([]);
    if (name === "log_my_access_denied_secure") return response(null);
    // Pré-instalação: leitor escopado ausente (PGRST202) mantém a leitura de volumes anterior.
    if (name === "get_partner_catalog_volumes_secure" && state.scoped) return response({ contract: "B2B_PARTNER_VOLUMES_V1", partner_id: args?.p_partner_id,
      seller: { name: state.scoped.name }, volumes: [{ id: "b86f2fe8-e6b7-43e4-8345-53bd9e2a3b03", item_tipo: "produto", produto_id: args?.p_partner_id, microrganismo_id: null, volume_ml: 1000, rotulo: "1 L", ordem: 0 }] });
    // Pré-instalação: leitor de embalagens ausente (PGRST202) mantém sólidos fechados.
    if (name === "get_partner_packaging_offers_secure" && state.pk !== "absent") {
      if (state.pk === "pending") { const p = new Promise(() => {}); return Object.assign(p, { abortSignal: () => p }); }
      if (state.pk === "error") { const p = Promise.resolve({ data: null, error: { code: "42501", message: "partner_not_found" } }); return Object.assign(p, { abortSignal: () => p }); }
      if (state.pk === "invalid") return response({ contract: "B2B_PARTNER_PACKAGING_ORDER_V1", partner_id: args?.p_partner_id, offers: [] });
      const solid = state.pk === "not_solid" ? [] : [{ product_id: args?.p_partner_id, unidade_conteudo: "kg" }];
      const offers = state.pk === "offer" ? [{ product_id: args?.p_partner_id, unidade_conteudo: "kg", packaging_id: PKG, codigo: "SC25", descricao: "Saco 25 kg",
        rotulo: "Saco 25 kg", peso_liquido_kg: 25, version: 1, preco_tabela_brl: 10 }] : [];
      return response({ contract: "B2B_PARTNER_PACKAGING_ORDER_V1", partner_id: args?.p_partner_id, offers, solid_products: solid });
    }
    if (name === "get_partner_packaging_offers_secure") { const p = Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.get_partner_packaging_offers_secure(p_partner_id) in the schema cache" } }); return Object.assign(p, { abortSignal: () => p }); }
    if (name === "get_partner_catalog_volumes_secure") { const p = Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.get_partner_catalog_volumes_secure(p_partner_id) in the schema cache" } }); return Object.assign(p, { abortSignal: () => p }); }
    if (name === "get_partner_catalog_secure") return response([{
      catalog_contract: "C1B_DUAL_TENANT_V1", item_id: args?.p_partner_id, item_tipo: "produto",
      produto_nome: `Produto ${state.tenant}/${args?.p_partner_id}`, produto_codigo: "LOCAL", familia_catalogo: "biologico",
      valor_litro_brl: 10, preco_parceiro: 10, desconto_percentual: 0, unidade_preco_principal: "litro", ficha_aprovada: false,
    }]);
    state.writes(name); throw new Error(`Unexpected RPC: ${name}`);
  });
});
afterEach(() => { cleanup(); sessionStorage.clear(); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Routes>
    <Route path="/portal-parceiro" element={<B2BRouteGuard><Layout /></B2BRouteGuard>}>
      <Route element={<EntitlementOutlet />}><Route path="catalogo" element={<NovoPedido />} /></Route>
    </Route><Route path="/sem-permissao" element={<p>Negado</p>} />
  </Routes></MemoryRouter></QueryClientProvider>;
  const view = render(tree()); return { update: () => view.rerender(tree()) };
}
const product = () => `Produto ${state.tenant}/${state.partner}`;
const LIQUID_TITLE = /Adicionar ao carrinho|Volume|volume/;
async function openAdd() {
  mount(); await screen.findByText(product());
  fireEvent.click(screen.getByRole("button", { name: "Adicionar ao pedido" }));
}
it.each([
  ["pending", /Confirmando as apresentações/],
  ["error", /Não foi possível confirmar as apresentações/],
  ["invalid", /formato não reconhecido/],
  ["solid_unpriced", /vendido em embalagem inteira.*sem? ?.*preço vigente|ainda não tem embalagem ativa com preço vigente/],
] as const)("leitor de embalagens %s: estado explícito, nunca o diálogo líquido nem 'sem volume'", async (mode, text) => {
  state.pk = mode; await openAdd();
  expect(await screen.findByTestId("packaging-state")).toHaveTextContent(text);
  expect(screen.queryByText(/não há volume|sem volume|Nenhum volume/i)).toBeNull();
  expect(screen.queryByRole("button", { name: "Adicionar" })).toBeNull();
  expect(state.writes).not.toHaveBeenCalled();
});
it("sólido confirmado com oferta abre só o diálogo de embalagem inteira", async () => {
  state.pk = "offer"; await openAdd();
  expect(await screen.findByText(/Saco 25 kg/)).toBeInTheDocument();
  expect(screen.queryByTestId("packaging-state")).toBeNull();
});
it.each(["absent", "not_solid"] as const)("leitor %s: líquido segue no diálogo atual (sem regressão)", async (mode) => {
  state.pk = mode; await openAdd();
  await waitFor(() => expect(screen.queryByTestId("packaging-state")).toBeNull());
  expect(screen.queryByText(/Saco 25 kg/)).toBeNull();
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});
it("rascunho de renovação restaura embalagem revalidada e bloqueia modelo misto inteiro", async () => {
  state.pk = "offer";
  state.draft = { partnerId: state.partner, addItemId: null, requestedDeliveryDate: null, items: [{ itemId: state.partner, packagingId: PKG, quantity: 3 }] };
  mount(); await screen.findAllByText(/Saco 25 kg/);
  expect(state.toastWarn).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: /Salvar como favorito/ })[0]);
  expect(await screen.findByTestId("template-packaging-blocked")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Nome do modelo"), { target: { value: "Misto" } });
  expect(screen.getByRole("button", { name: "Salvar favorito" })).toBeDisabled();
  expect(state.writes).not.toHaveBeenCalled();
});
it("rascunho com embalagem cuja oferta sumiu (leitura bem-sucedida) não volta e avisa", async () => {
  state.pk = "solid_unpriced";
  state.draft = { partnerId: state.partner, addItemId: null, requestedDeliveryDate: null, items: [{ itemId: state.partner, packagingId: PKG, quantity: 3 }] };
  mount(); await screen.findByText(product());
  await waitFor(() => expect(state.toastWarn).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/Saco 25 kg/)).toBeNull();
  expect(screen.queryByTestId("pending-packaging")).toBeNull();
});
it("erro transitório do leitor NÃO apaga a embalagem: fica pendente, bloqueia e volta após nova leitura com preço atual", async () => {
  state.pk = "error";
  state.draft = { partnerId: state.partner, addItemId: null, requestedDeliveryDate: null, items: [{ itemId: state.partner, packagingId: PKG, quantity: 3 }] };
  mount(); await screen.findByText(product());
  expect(await screen.findByTestId("pending-packaging")).toHaveTextContent(/1 embalagem\(ns\).*aguardam confirmação/);
  expect(state.toastWarn).not.toHaveBeenCalled();
  expect(screen.queryByText(/Saco 25 kg/)).toBeNull();
  const saved = JSON.parse(sessionStorage.getItem(draftKey()) ?? "null");
  expect(saved?.draft.items).toEqual([{ itemId: state.partner, packagingId: PKG, quantity: 3 }]);   // retido, sem preço
  state.pk = "offer";
  fireEvent.click(screen.getByRole("button", { name: "Tentar confirmar agora" }));
  expect((await screen.findAllByText(/Saco 25 kg/)).length).toBeGreaterThan(0);
  await waitFor(() => expect(screen.queryByTestId("pending-packaging")).toBeNull());
  expect(state.toastWarn).not.toHaveBeenCalled();
});
const draftKey = (tenant = state.tenant, partner = state.partner) => `cf:b2b-order-draft:v1:${state.actor}:${tenant}:${partner}`;
const seed = (items: unknown[], over: Record<string, unknown> = {}, key = draftKey()) => {
  const now = Date.now();
  sessionStorage.setItem(key, JSON.stringify({ v: 1, u: state.actor, t: state.tenant, p: state.partner, savedAt: now, expiresAt: now + 3600_000,
    draft: { partnerId: state.partner, addItemId: null, requestedDeliveryDate: null, items }, ...over }));
};
it("recarregar (montagem nova sem recibo de renovação) restaura embalagem revalidada a partir da retenção escopada", async () => {
  state.pk = "offer"; seed([{ itemId: state.partner, packagingId: PKG, quantity: 2 }]);
  mount();
  expect((await screen.findAllByText(/Saco 25 kg/)).length).toBeGreaterThan(0);
  const raw = sessionStorage.getItem(draftKey()) ?? "";
  expect(raw).not.toMatch(/preco|price|hash|token|idempot/i);
});
it("recarregar com pedido misto restaura líquido e embalagem", async () => {
  state.pk = "offer"; state.scoped = { name: "AR Bio" };
  seed([{ itemId: state.partner, volumeId: "b86f2fe8-e6b7-43e4-8345-53bd9e2a3b03", quantity: 4 }, { itemId: state.partner, packagingId: PKG, quantity: 1 }]);
  mount();
  expect((await screen.findAllByText(/Saco 25 kg/)).length).toBeGreaterThan(0);
  expect((await screen.findAllByText(/1 L/)).length).toBeGreaterThan(0);
});
it.each([
  ["outro tenant", () => seed([{ itemId: "x", packagingId: PKG, quantity: 2 }], { t: "99999999-9999-4999-8999-999999999999" }, draftKey("99999999-9999-4999-8999-999999999999"))],
  ["expirado", () => seed([{ itemId: "x", packagingId: PKG, quantity: 2 }], { savedAt: Date.now() - 9 * 3600_000, expiresAt: Date.now() - 3600_000 })],
  ["corrompido", () => sessionStorage.setItem(draftKey(), "{nao-json")],
  ["com preço injetado", () => seed([{ itemId: "x", packagingId: PKG, quantity: 2, preco: 1 }])],
] as const)("retenção %s é ignorada", async (_n, prep) => {
  state.pk = "offer"; prep();
  mount(); await screen.findByText(product());
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText(/Saco 25 kg/)).toBeNull();
});
