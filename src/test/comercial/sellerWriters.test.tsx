import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useOutletContext } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canAccess } from "@/lib/permissions";

const ORG = "11111111-1111-4111-8111-111111111111";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PX = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const V1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const cap = (over: Record<string, unknown> = {}) => ({ contract: "seller_portfolio_capability_v1", version: 2, ready: true, reason: null, fiscal_block: null,
  order_create: true, quote_respond: true, organization_id: ORG, partners: [{ partner_id: P1, razao_social: "Parceiro Um", order_create: true }], ...over });
const ordersReply = { contract: "seller_portfolio_orders_v1", orders: [
  { id: "o-q", numero: "PB-9", partner_id: P1, razao_social: "Parceiro Um", status: "aguardando_cotacao", total: null, created_at: "2026-11-11", created_by_me: false,
    items: [{ id: "it-1", quantidade: 2, produto_nome_snapshot: "Produto X" }] },
  { id: "o-1", numero: "PB-10", partner_id: P1, razao_social: "Parceiro Um", status: "em_analise_comercial", total: 90, created_at: "2026-11-11", created_by_me: true, items: [] }] };

// Transporte sintético somente na borda do SDK.
const rpc = vi.fn();
const auth: any = { user: { id: V1 }, profile: { user_id: V1, organization_id: ORG, ativo: true }, roles: ["vendedor"], authzReady: true, authzEpoch: 1 };
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
const toastErr = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastErr(m), success: () => {} } }));
const { parseSellerCapability, parseSellerOrders, portfolioErrorText } = await import("@/hooks/useSellerPortfolio");
const { default: MinhaCarteira } = await import("@/pages/comercial/MinhaCarteiraVendedor");
const { default: VendedorNovoPedido } = await import("@/pages/comercial/VendedorNovoPedido");

function Probe() { const { partner, afterCreatePath } = useOutletContext<any>(); return <div data-testid="order" data-partner={partner.id} data-after={afterCreatePath} />; }
const page = (url: string) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[url]}><Routes>
  <Route path="/comercial/minha-carteira" element={<MinhaCarteira />} />
  <Route path="/comercial/minha-carteira/pedido" element={<VendedorNovoPedido />}><Route index element={<Probe />} /></Route>
</Routes></MemoryRouter></QueryClientProvider>);
function route(map: Record<string, unknown>) {
  rpc.mockImplementation(async (name: string, args?: unknown) => {
    const v = map[name];
    if (typeof v === "function") return (v as any)(args);
    return v === undefined ? { data: null, error: { message: "unexpected " + name } } : { data: v, error: null };
  });
}
beforeEach(() => { rpc.mockReset(); auth.roles = ["vendedor"]; });
afterEach(cleanup);

describe("capability do vendedor v2", () => {
  it("v1 (writers não instalados) mantém lançamento e cotação fechados", () => {
    const c = parseSellerCapability({ ...cap(), version: undefined });
    expect(c).toMatchObject({ ready: true, orderCreate: false, quoteRespond: false });
    expect(c.partners[0].orderCreate).toBe(false);
  });
  it("bloqueio fiscal é distinto de ausência funcional", () => {
    const c = parseSellerCapability(cap({ fiscal_block: "issuer_not_validated", order_create: false, reason: "issuer_not_validated",
      partners: [{ partner_id: P1, razao_social: "Parceiro Um", order_create: false }] }));
    expect(c).toMatchObject({ fiscalBlock: "issuer_not_validated", orderCreate: false, quoteRespond: true });
    const none = parseSellerCapability(cap({ order_create: false, quote_respond: false, partners: [], reason: "no_partner_in_scope" }));
    expect(none).toMatchObject({ fiscalBlock: null, orderCreate: false, quoteRespond: false, reason: "no_partner_in_scope" });
  });
  it("não pronto descarta parceiros e escrita", () => {
    expect(parseSellerCapability(cap({ ready: false }))).toMatchObject({ ready: false, orderCreate: false, quoteRespond: false, partners: [] });
  });
  it("pedidos fora do contrato ficam indisponíveis", () => {
    expect(parseSellerOrders({ orders: [] })).toBeNull();
    expect(parseSellerOrders(ordersReply)?.length).toBe(2);
  });
  it("mensagens de carteira não vazam erro cru", () => {
    expect(portfolioErrorText("SELLER_PORTFOLIO_ALREADY_ASSIGNED")).toMatch(/já está na carteira/);
    expect(portfolioErrorText("SELLER_PORTFOLIO_PARTNER_INVALID")).toMatch(/inativo ou excluído/);
    expect(portfolioErrorText("SELLER_PORTFOLIO_SELLER_INVALID")).toMatch(/exclusivo/);
    expect(portfolioErrorText("boom")).toBe("Não foi possível concluir. Nada foi alterado.");
  });
});

describe("rotas", () => {
  it("lançamento só para vendedor; gestor comercial e financeiro não herdam", () => {
    expect(canAccess("vendedor", "/comercial/minha-carteira/pedido")).toBe(true);
    expect(canAccess("gestor_comercial", "/comercial/minha-carteira/pedido")).toBe(false);
    expect(canAccess("financeiro", "/comercial/minha-carteira/pedido")).toBe(false);
    expect(canAccess("administrador", "/comercial/minha-carteira")).toBe(true);
    expect(canAccess("vendedor", "/comercial/pedidos-b2b/novo")).toBe(false);
  });
});

describe("Minha carteira montada (vendedor)", () => {
  it("parceiro apto mostra Lançar pedido; cotação abre resposta com itens do servidor", async () => {
    route({ seller_portfolio_capability_v1: cap(), seller_portfolio_orders_v1: ordersReply });
    page("/comercial/minha-carteira");
    const link = await screen.findByRole("link", { name: "Lançar pedido" });
    expect(link.getAttribute("href")).toBe(`/comercial/minha-carteira/pedido?parceiro=${P1}`);
    fireEvent.click(await screen.findByRole("button", { name: "Responder cotação" }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText(/Responder cotação PB-9/)).toBeTruthy();
    expect(screen.getByText(/lançado por você/)).toBeTruthy();
  });
  it("bloqueio fiscal: sem Lançar pedido, cotação continua", async () => {
    route({ seller_portfolio_capability_v1: cap({ fiscal_block: "issuer_not_validated", order_create: false, reason: "issuer_not_validated",
      partners: [{ partner_id: P1, razao_social: "Parceiro Um", order_create: false }] }), seller_portfolio_orders_v1: ordersReply });
    page("/comercial/minha-carteira");
    expect(await screen.findByText(/não foi validada pela contabilidade/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Lançar pedido" })).toBeNull();
    expect(await screen.findByRole("button", { name: "Responder cotação" })).toBeTruthy();
  });
  it("writers não instalados (v1): nada de escrita", async () => {
    route({ seller_portfolio_capability_v1: { ...cap(), version: undefined }, seller_portfolio_orders_v1: ordersReply });
    page("/comercial/minha-carteira");
    expect(await screen.findByText(/ainda não estão liberados/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Lançar pedido" })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Responder cotação" })).toBeNull());
  });
});

describe("Lançar pedido montado (vendedor)", () => {
  it("parceiro da carteira monta o pedido canônico com retorno para a carteira", async () => {
    route({ seller_portfolio_capability_v1: cap() });
    page(`/comercial/minha-carteira/pedido?parceiro=${P1}`);
    const o = await screen.findByTestId("order");
    expect(o.getAttribute("data-partner")).toBe(P1);
    expect(o.getAttribute("data-after")).toBe("/comercial/minha-carteira");
  });
  it("parceiro fora da carteira pela URL não monta pedido", async () => {
    route({ seller_portfolio_capability_v1: cap() });
    page(`/comercial/minha-carteira/pedido?parceiro=${PX}`);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("order")).toBeNull();
  });
  it("bloqueio fiscal não monta pedido e explica o motivo", async () => {
    route({ seller_portfolio_capability_v1: cap({ fiscal_block: "issuer_not_validated", order_create: false, partners: [{ partner_id: P1, razao_social: "Parceiro Um", order_create: false }] }) });
    page(`/comercial/minha-carteira/pedido?parceiro=${P1}`);
    expect(await screen.findByText(/não foi validada pela contabilidade/)).toBeTruthy();
    expect(screen.queryByTestId("order")).toBeNull();
  });
});

describe("Carteiras dos vendedores (administrador)", () => {
  const overview = { contract: "admin_seller_portfolio_overview_v1", organization_id: ORG,
    sellers: [{ user_id: V1, nome: "Vendedora Um" }], partners: [{ partner_id: P1, razao_social: "Parceiro Um" }, { partner_id: P2, razao_social: "Parceiro Dois" }],
    assignments: [{ id: "as-1", seller_user_id: V1, partner_id: P1, assigned_at: "2026-11-11", reason: "inicial", revoked_at: null, revoke_reason: null }] };
  it("lista vigentes e revoga só com motivo, pela RPC normal", async () => {
    auth.roles = ["administrador"];
    const calls: any[] = [];
    route({ admin_seller_portfolio_overview_v1: overview, admin_revoke_seller_portfolio_v1: (a: unknown) => { calls.push(a); return { data: null, error: null }; } });
    page("/comercial/minha-carteira");
    expect(await screen.findByText("Vendedora Um · Parceiro Um")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Revogar" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Motivo da revogação de Parceiro Um"), { target: { value: "fim" } });
    fireEvent.click(btn);
    await waitFor(() => expect(calls).toEqual([{ p_assignment: "as-1", p_reason: "fim" }]));
  });
  it("atribui pela interface: escolhe vendedor e parceiro, exige motivo e chama a RPC normal", async () => {
    auth.roles = ["administrador"];
    const calls: any[] = [];
    route({ admin_seller_portfolio_overview_v1: overview, admin_assign_seller_portfolio_v1: (a: unknown) => { calls.push(a); return { data: "as-2", error: null }; } });
    page("/comercial/minha-carteira");
    fireEvent.click(await screen.findByRole("combobox", { name: "Vendedor" }));
    fireEvent.click(await screen.findByRole("option", { name: "Vendedora Um" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Parceiro" }));
    fireEvent.click(await screen.findByRole("option", { name: "Parceiro Dois" }));
    const btn = screen.getByRole("button", { name: "Atribuir" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "nova carteira" } });
    fireEvent.click(btn);
    await waitFor(() => expect(calls).toEqual([{ p_seller: V1, p_partner: P2, p_reason: "nova carteira" }]));
  });
  it("recusa do servidor ao atribuir mostra motivo sem erro cru", async () => {
    auth.roles = ["administrador"];
    route({ admin_seller_portfolio_overview_v1: overview, admin_assign_seller_portfolio_v1: () => ({ data: null, error: { message: "SELLER_PORTFOLIO_ALREADY_ASSIGNED" } }) });
    page("/comercial/minha-carteira");
    fireEvent.click(await screen.findByRole("combobox", { name: "Vendedor" }));
    fireEvent.click(await screen.findByRole("option", { name: "Vendedora Um" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Parceiro" }));
    fireEvent.click(await screen.findByRole("option", { name: "Parceiro Um" }));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith(expect.stringMatching(/já está na carteira/)));
    expect(toastErr.mock.calls.flat().join(" ")).not.toMatch(/SELLER_PORTFOLIO/);
  });
  it("marca vendedor suspenso e parceiro desativado nas vigentes", async () => {
    auth.roles = ["administrador"];
    route({ admin_seller_portfolio_overview_v1: { ...overview, sellers: [], assignments: [{ ...overview.assignments[0], seller_active: false, partner_active: false }] } });
    page("/comercial/minha-carteira");
    expect(await screen.findByText("vendedor suspenso")).toBeTruthy();
    expect(screen.getByText("parceiro desativado")).toBeTruthy();
  });
  it("erro do servidor na leitura mantém fechado", async () => {
    auth.roles = ["administrador"];
    route({ admin_seller_portfolio_overview_v1: () => ({ data: null, error: { message: "SELLER_PORTFOLIO_FORBIDDEN" } }) });
    page("/comercial/minha-carteira");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Atribuir" })).toBeNull();
  });
});
