import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Fixture local apenas: nunca chama serviços hospedados nem executa mutações.
// Layout, guards e hooks de domínio permanecem reais.
const state = vi.hoisted(() => ({
  actor: "11111111-1111-4111-8111-111111111111",
  tenant: "22222222-2222-4222-8222-222222222222",
  partner: "33333333-3333-4333-8333-333333333333",
  epoch: 0, entitled: true, foreignProjection: false,
  sidebarGroups: [] as Array<{ items: Array<{ route: string }> }>,
  rpc: vi.fn(), table: vi.fn(), writes: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true, senha_provisoria: false },
  role: "parceiro_b2b", roles: ["parceiro_b2b"], loading: false, authzReady: true, authzEpoch: state.epoch,
  checkAuthzAccess: () => true, signOut: vi.fn(),
}) }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({
  status: "ready", features: new Set(state.entitled ? ["catalogo_precos", "pedidos_b2b"] : []),
}) }));
vi.mock("@/hooks/useAvailableContexts", () => ({ useAvailableContexts: () => ({
  ready: true, isLoading: false, isError: false, data: { has_b2b_access: true, available_contexts: ["b2b"] },
}) }));
vi.mock("@/hooks/useBranding", () => ({ usePortalBranding: () => ({}) }));
vi.mock("@/hooks/useNavCollapseState", () => ({ useSidebarOpenState: () => ({ open: false, setOpen: vi.fn() }) }));
vi.mock("@/components/nav/PortalSidebar", () => ({ PortalSidebar: (props: { groups: typeof state.sidebarGroups }) => { state.sidebarGroups = props.groups; return null; } }));
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
import { B2BRouteGuard } from "@/components/guards/B2BRouteGuard";

function response(data: unknown) {
  const promise = Promise.resolve({ data, error: null });
  return Object.assign(promise, { abortSignal: () => promise });
}
beforeEach(() => {
  Object.assign(state, { tenant: "22222222-2222-4222-8222-222222222222", partner: "33333333-3333-4333-8333-333333333333", epoch: 0, entitled: true, foreignProjection: false, sidebarGroups: [] });
  vi.clearAllMocks();
  state.table.mockImplementation((table: string) => { throw new Error(`Unexpected table read: ${table}`); });
  state.rpc.mockImplementation((name: string) => {
    const context = { contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant,
      organization_id: state.tenant, commercial_owner_organization_id: state.tenant, mode: "commercial_owner",
      partner_id: state.partner, external_roles: ["parceiro_b2b"], manager: true, technician: false, role: "parceiro_b2b", papel: "gestor" };
    if (name === "get_my_commercial_partner_context") return response(context);
    if (name === "get_my_commercial_partner_projection") return response({ ...context, tenant_id: state.foreignProjection ? "foreign-tenant" : state.tenant, id: state.partner, ativo: true,
      codigo: "LOCAL", razao_social: "Parceiro local", capabilities: { contract: "C2_CAT_V1", catalog_read: true, sheets_read: true },
      order_capabilities: { contract: "C2_OWNER_ORDER_V1", order_create: true } });
    if (name === "get_my_commercial_orders_projection") return response({
      partner_id: state.partner,
      orders: [{ id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", status: "em_analise_comercial", created_at: "2026-10-26T15:00:00+00:00" }],
    });
    if (name === "log_my_access_denied_secure") return response(null);
    state.writes(name); throw new Error(`Unexpected RPC: ${name}`);
  });
});
afterEach(cleanup);
function mount(path = "/portal-parceiro/pedidos") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/portal-parceiro" element={<B2BRouteGuard><Layout /></B2BRouteGuard>}>
      <Route path="pedidos" element={<p>MeusPedidos legado não deve montar</p>} />
      <Route path="dashboard" element={<p>Dashboard</p>} />
    </Route><Route path="/sem-permissao" element={<p>Negado</p>} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

it("commercialOwner em /pedidos vê acompanhamento somente leitura do pedido próprio, sem fallback nem ações legadas", async () => {
  mount();
  await screen.findByRole("region", { name: "Acompanhamento de pedidos" });
  await screen.findByText("PB-001029");
  expect(screen.getByText("em analise comercial")).toBeTruthy();
  // Fallback antigo ("Cliente comercial") e MeusPedidos legado não montam.
  expect(screen.queryByRole("region", { name: "Cliente comercial" })).toBeNull();
  expect(screen.queryByText(/Simulações, arquivos e alterações de pedidos estão indisponíveis/)).toBeNull();
  expect(screen.queryByText("MeusPedidos legado não deve montar")).toBeNull();
  expect(screen.queryByRole("button", { name: /Mensagens/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Andamento/ })).toBeNull();
  // Aviso honesto: nenhuma promessa de aprovação/cobrança/NF/entrega.
  expect(screen.getByText(/podem permanecer bloqueadas/)).toBeTruthy();
  // Menu passa a incluir Meus Pedidos para o cliente comercial.
  const routes = state.sidebarGroups.flatMap(g => g.items.map(i => i.route));
  expect(routes).toContain("/portal-parceiro/pedidos");
  expect(state.writes).not.toHaveBeenCalled();
  expect(state.table).not.toHaveBeenCalled();
});
it("projeção de tenant estrangeiro não monta acompanhamento nem menu", async () => {
  state.foreignProjection = true;
  mount();
  await screen.findByText("Negado");
  expect(screen.queryByRole("region", { name: "Acompanhamento de pedidos" })).toBeNull();
  expect(state.rpc.mock.calls.some(([name]) => name === "get_my_commercial_orders_projection")).toBe(false);
  expect(state.writes).not.toHaveBeenCalled();
});
