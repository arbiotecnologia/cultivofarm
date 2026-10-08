import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const state = vi.hoisted(() => ({
  auth: { user: { id: "U" } as { id: string } | null, profile: { user_id: "U", organization_id: "A", ativo: true, senha_provisoria: false }, roles: ["parceiro_b2b"], loading: false },
  rpc: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
import { useMyCommercialOrders } from "@/hooks/useMyCommercialOrders";
const payload = (partner_id = A, extra = {}) => ({ partner_id, orders: [{ id: A, numero: "OWN", status: "solicitado", created_at: "2026-10-08T21:00:00Z", ...extra }] });
beforeEach(() => {
  state.auth.user = { id: "U" }; state.auth.roles = ["parceiro_b2b"];
  Object.assign(state.auth.profile, { user_id: "U", organization_id: "A", ativo: true, senha_provisoria: false });
  state.rpc.mockReset().mockResolvedValue({ data: payload(), error: null });
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const h = renderHook(({ id }) => useMyCommercialOrders(id), { initialProps: { id: A }, wrapper });
  return { h, clean: () => { h.unmount(); client.clear(); } };
}
describe("own orders — mocked transport, real identity/cache fences", () => {
  it("reads parameter-free own projection", async () => { const { h, clean } = setup(); await waitFor(() => expect(h.result.current.data?.[0].numero).toBe("OWN")); expect(state.rpc).toHaveBeenCalledExactlyOnceWith("get_my_commercial_orders_projection"); clean(); });
  it.each([payload(B), payload(A, { total: 50 }), payload(A, { commercial_notes: "PRIVATE" })])("rejects sibling or unreviewed fields", async data => {
    state.rpc.mockResolvedValue({ data, error: null }); const { h, clean } = setup(); await waitFor(() => expect(h.result.current.isError).toBe(true)); expect(h.result.current.data).toBeUndefined(); clean();
  });
  it.each([{ roles: ["parceiro_b2b_tecnico"] }, { roles: ["administrador"] }, { roles: ["parceiro_b2b", "gestor"] }])("does not call for role %j", ({ roles }) => { state.auth.roles = roles; const { h, clean } = setup(); expect(state.rpc).not.toHaveBeenCalled(); expect(h.result.current.ready).toBe(false); clean(); });
  it("hides cache immediately on logout", async () => { const { h, clean } = setup(); await waitFor(() => expect(h.result.current.data).toHaveLength(1)); state.auth.user = null; h.rerender({ id: A }); expect(h.result.current.data).toBeUndefined(); clean(); });
  it("fences late response after identity change", async () => {
    let resolve: ((value: unknown) => void) | undefined;
    state.rpc.mockImplementation(() => new Promise(r => { resolve = r; }));
    const { h, clean } = setup(); await waitFor(() => expect(state.rpc).toHaveBeenCalledOnce());
    state.auth.user = { id: "NEW" }; h.rerender({ id: A });
    await act(async () => { resolve?.({ data: payload(), error: null }); });
    expect(h.result.current.data).toBeUndefined(); clean();
  });
  it("fences partner switch and removes old projection", async () => {
    const { h, clean } = setup(); await waitFor(() => expect(h.result.current.data).toHaveLength(1));
    state.rpc.mockResolvedValue({ data: payload(B), error: null }); h.rerender({ id: B });
    expect(h.result.current.data).toBeUndefined(); await waitFor(() => expect(h.result.current.data).toHaveLength(1)); clean();
  });
});