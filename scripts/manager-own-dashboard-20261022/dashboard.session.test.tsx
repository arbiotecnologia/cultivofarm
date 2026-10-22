import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const state = vi.hoisted(() => ({
  auth: { user: { id: "U" } as { id: string } | null, profile: { user_id: "U", organization_id: "A", ativo: true, senha_provisoria: false }, roles: ["parceiro_b2b"], loading: false },
  rpc: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
import { CommercialOwnOrders } from "./CommercialOwnOrders";
const payload = (partner_id = A) => ({ partner_id, orders: [{ id: A, numero: "OWN-A", status: "solicitado", created_at: "2026-10-08T21:00:00Z" }] });
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const view = (id: string) => <QueryClientProvider client={client}><CommercialOwnOrders partnerId={id} /></QueryClientProvider>;
  return { ...render(view(A)), view };
}
beforeEach(() => {
  state.auth.user = { id: "U" }; state.auth.roles = ["parceiro_b2b"];
  Object.assign(state.auth.profile, { user_id: "U", organization_id: "A", ativo: true });
  state.rpc.mockReset().mockResolvedValue({ data: payload(), error: null });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
describe("candidate UI with canonical hook, synthetic Auth/transport", () => {
  it("shows own row and observed counts through a single RPC without financial queries", async () => {
    mount(); await screen.findByText("OWN-A");
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("get_my_commercial_orders_projection");
  });
  it.each(["parceiro_b2b_tecnico", "cliente_produtor", "gestor", "administrador"])("denies role %s without querying", role => {
    state.auth.roles = [role]; mount(); expect(state.rpc).not.toHaveBeenCalled(); expect(screen.queryByText("OWN-A")).toBeNull();
  });
  it("does not publish stale indicators after failed refetch; controlled retry recovers", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    render(<QueryClientProvider client={client}><CommercialOwnOrders partnerId={A} /></QueryClientProvider>);
    await screen.findByText("OWN-A"); state.rpc.mockResolvedValue({ data: null, error: new Error("forbidden") });
    await act(async () => { await client.invalidateQueries({ queryKey: ["commercial-own-orders"] }); });
    await screen.findByRole("alert"); expect(screen.queryByText("OWN-A")).toBeNull();
    state.rpc.mockResolvedValue({ data: payload(), error: null });
    await act(async () => { screen.getByRole("button", { name: "Tentar novamente" }).click(); });
    await screen.findByText("OWN-A");
  });
  it.each(["logout", "tenant", "revocation"])("hides previously observed rows on %s", async kind => {
    const h = mount(); await screen.findByText("OWN-A");
    if (kind === "logout") state.auth.user = null;
    if (kind === "tenant") { state.auth.profile.organization_id = "B"; state.rpc.mockResolvedValue({ data: null, error: new Error("forbidden") }); }
    if (kind === "revocation") state.auth.roles = [];
    h.rerender(h.view(A)); expect(screen.queryByText("OWN-A")).toBeNull();
  });
  it("rejects cross-partner projection", async () => {
    state.rpc.mockResolvedValue({ data: payload(B), error: null }); mount();
    await screen.findByRole("alert"); expect(screen.queryByText("OWN-A")).toBeNull();
  });
  it("late response cannot publish for a different actor", async () => {
    let resolve: ((result: unknown) => void) | undefined;
    state.rpc.mockImplementation(() => new Promise(r => { resolve = r; }));
    const h = mount(); await waitFor(() => expect(state.rpc).toHaveBeenCalledOnce());
    state.auth.user = { id: "NEW" }; state.auth.roles = ["parceiro_b2b_tecnico"]; h.rerender(h.view(A));
    await act(async () => { resolve?.({ data: payload(), error: null }); });
    expect(screen.queryByText("OWN-A")).toBeNull();
  });
});