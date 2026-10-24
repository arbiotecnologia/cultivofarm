import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useOutletContext } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommercialOrderEntry } from "@/components/comercial/CommercialOrderEntry";
import { readInternalOrderEntryCapability, resolveInternalOrderTarget, INTERNAL_ORDER_ENTRY_CONTRACT } from "@/lib/comercial/internalOrderEntry";
import { readOwnerOrderCapability } from "@/lib/comercial/ownerOrderAccess";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const PA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PA2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const capA = { contract: INTERNAL_ORDER_ENTRY_CONTRACT, order_create: true, profile_ok: true, reason: null, organization_id: A,
  partners: [{ partner_id: PA, razao_social: "Parceiro A1", commercial_owner_organization_id: A }, { partner_id: PA2, razao_social: "Parceiro A2", commercial_owner_organization_id: A }] };

// Synthetic transport at the SDK boundary only.
const rpc = vi.fn();
const auth = { user: { id: "u-a" }, profile: { user_id: "u-a", organization_id: A, ativo: true, senha_provisoria: false }, roles: ["gestor_comercial"], loading: false, authzReady: true, authzEpoch: 1 };
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => ({ abortSignal: () => rpc(...a) }) } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
const { default: ComercialNovoPedido } = await import("@/pages/comercial/ComercialNovoPedido");

let mounts = 0;
function ProbeOrder() {
  const { partner } = useOutletContext<{ partner: { id: string } }>();
  const [cart, setCart] = useState<string[]>([]);
  return <div data-testid="order" data-partner={partner.id} data-mount={String(++mounts)}>
    <button onClick={() => setCart(c => [...c, "item"])}>add</button><span data-testid="cart">{cart.length}</span></div>;
}
function renderPage(url: string) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[url]}><Routes>
    <Route path="/comercial/pedidos-b2b/novo" element={<ComercialNovoPedido />}><Route index element={<ProbeOrder />} /></Route>
  </Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { rpc.mockReset(); mounts = 0; auth.profile.organization_id = A; auth.authzEpoch = 1; auth.roles = ["gestor_comercial"]; });
afterEach(cleanup);

describe("leitor do contrato — espelha guards sem inventar owner", () => {
  it("fechado sem contrato, com contrato de compra própria ou reason inválido", () => {
    expect(readInternalOrderEntryCapability(undefined, A)).toEqual({ state: "blocked", reason: "invalid_response" });
    expect(readInternalOrderEntryCapability({ ...capA, contract: "C2_OWNER_ORDER_V1" }, A).state).toBe("blocked");
    expect(readInternalOrderEntryCapability({ ...capA, profile_ok: false }, A).state).toBe("blocked");
    expect(readInternalOrderEntryCapability({ ...capA, order_create: false, reason: "issuer_not_validated" }, A)).toEqual({ state: "blocked", reason: "issuer_not_validated" });
    expect(readInternalOrderEntryCapability({ ...capA, order_create: false, reason: "inventado" }, A)).toEqual({ state: "blocked", reason: "invalid_response" });
    expect(readOwnerOrderCapability(capA)).toBe(false);
  });
  it("owner ausente ou de outra empresa invalida tudo; resposta de A não serve para B", () => {
    expect(readInternalOrderEntryCapability({ ...capA, partners: [{ partner_id: PA, razao_social: "x" }] }, A).state).toBe("blocked");
    expect(readInternalOrderEntryCapability({ ...capA, partners: [{ partner_id: PB, razao_social: "x", commercial_owner_organization_id: B }] }, A).state).toBe("blocked");
    expect(readInternalOrderEntryCapability(capA, B).state).toBe("blocked");
    expect(resolveInternalOrderTarget(readInternalOrderEntryCapability(capA, A), PB)).toBeNull();
  });
});

describe("rota comercial real com transporte sintético", () => {
  it("contrato não instalado: motivo estruturado, sem pedido montado", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    renderPage(`/comercial/pedidos-b2b/novo?parceiro=${PA}`);
    expect((await screen.findByText(/não foi instalada/)).closest("[data-reason]")?.getAttribute("data-reason")).toBe("contract_not_installed");
    expect(screen.queryByTestId("order")).toBeNull();
  });
  it("contabilidade não validada: bloqueio exato do servidor, sem pedido", async () => {
    rpc.mockResolvedValue({ data: { ...capA, order_create: false, reason: "issuer_not_validated", partners: [] }, error: null });
    renderPage(`/comercial/pedidos-b2b/novo?parceiro=${PA}`);
    await screen.findByText(/validada pela contabilidade/);
    expect(screen.queryByTestId("order")).toBeNull();
  });
  it("interno A: parceiro de B na URL é recusado e nada monta", async () => {
    rpc.mockResolvedValue({ data: capA, error: null });
    renderPage(`/comercial/pedidos-b2b/novo?parceiro=${PB}`);
    await screen.findByRole("alert");
    expect(screen.queryByTestId("order")).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("c2_internal_order_entry_capability_v1");
  });
  it("interno A: alvo da carteira monta o pedido canônico; troca de época/perfil remonta e limpa carrinho", async () => {
    rpc.mockResolvedValue({ data: capA, error: null });
    const view = renderPage(`/comercial/pedidos-b2b/novo?parceiro=${PA}`);
    const order = await screen.findByTestId("order");
    expect(order.getAttribute("data-partner")).toBe(PA);
    fireEvent.click(screen.getByText("add"));
    expect(screen.getByTestId("cart").textContent).toBe("1");
    auth.authzEpoch = 2; // revogação/renovação de autoridade
    view.rerender(view.container.firstChild ? <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[`/comercial/pedidos-b2b/novo?parceiro=${PA}`]}><Routes>
      <Route path="/comercial/pedidos-b2b/novo" element={<ComercialNovoPedido />}><Route index element={<ProbeOrder />} /></Route></Routes></MemoryRouter></QueryClientProvider> : <></>);
    const again = await screen.findByTestId("order");
    expect(screen.getByTestId("cart").textContent).toBe("0");
    expect(Number(again.getAttribute("data-mount"))).toBeGreaterThan(Number(order.getAttribute("data-mount")));
  });
  it("revogado (actor_not_allowed): nenhum pedido e nenhum link no painel", async () => {
    rpc.mockResolvedValue({ data: { ...capA, order_create: false, profile_ok: false, reason: "actor_not_allowed", partners: [] }, error: null });
    renderPage(`/comercial/pedidos-b2b/novo?parceiro=${PA}`);
    await screen.findByText(/gestor comercial exclusivo/);
    expect(screen.queryByTestId("order")).toBeNull();
  });
});

describe("painel de Pedidos B2B", () => {
  it("só mostra 'Registrar venda' com contrato permitido", () => {
    const { rerender } = render(<MemoryRouter><CommercialOrderEntry /></MemoryRouter>);
    expect(screen.queryByRole("link")).toBeNull();
    rerender(<MemoryRouter><CommercialOrderEntry state={{ state: "blocked", reason: "catalog_reader_pending" }} /></MemoryRouter>);
    expect(screen.queryByRole("link")).toBeNull();
    rerender(<MemoryRouter><CommercialOrderEntry state={readInternalOrderEntryCapability(capA, A)} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Registrar venda/ }).getAttribute("href")).toBe("/comercial/pedidos-b2b/novo");
  });
});
