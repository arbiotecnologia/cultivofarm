import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: { user: { id: "A" } as { id: string } | null,
    profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
    roles: ["financeiro"], loading: false },
  pending: false, calls: [] as string[], resolve: [] as Array<(value: unknown) => void>,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    state.calls.push(table);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "order", "eq", "gte", "lte", "maybeSingle"]) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => state.pending ? state.resolve.push(resolve) : resolve({ data: [], error: null });
    return chain;
  },
  rpc: (name: string) => {
    state.calls.push(name);
    return state.pending ? new Promise(resolve => state.resolve.push(resolve)) : Promise.resolve({ data: { own: 1 }, error: null });
  },
} }));
import { useB2BReceivables, useB2BFinancialKpis, usePortalPartnerFinancial } from "@/hooks/useB2BFinanceiro";

beforeEach(() => {
  state.auth.user = { id: "A" };
  Object.assign(state.auth.profile, { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false });
  state.auth.roles = ["financeiro"]; state.auth.loading = false;
  state.pending = false; state.calls = []; state.resolve = [];
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><StrictMode>{children}</StrictMode></QueryClientProvider>;
  const hook = renderHook(() => ({ list: useB2BReceivables(), kpi: useB2BFinancialKpis(), portal: usePortalPartnerFinancial("partner") }), { wrapper });
  return { hook, client };
}
describe("B2B financial session isolation — mocked server, real QueryClient", () => {
  it("returns current resolved requests without treating the fence as ownership authorization", async () => {
    const { hook, client } = setup();
    await waitFor(() => expect(hook.result.current.kpi.data).toEqual({ own: 1 }));
    expect(hook.result.current.list.data).toEqual([]);
    expect(state.calls).toContain("partner_orders");
    hook.unmount(); client.clear();
  });
  for (const change of ["identity", "tenant", "logout", "inactive", "mismatch", "loading", "roles", "provisional", "noorg"] as const) {
    it(`hides all previous financial caches immediately: ${change}`, async () => {
      const { hook, client } = setup();
      await waitFor(() => expect(hook.result.current.kpi.data).toEqual({ own: 1 }));
      state.pending = true;
      if (change === "identity") { state.auth.user = { id: "B" }; state.auth.profile.user_id = "B"; }
      if (change === "tenant") state.auth.profile.organization_id = "OB";
      if (change === "logout") state.auth.user = null;
      if (change === "inactive") state.auth.profile.ativo = false;
      if (change === "mismatch") state.auth.profile.user_id = "B";
      if (change === "loading") state.auth.loading = true;
      if (change === "roles") state.auth.roles = [];
      if (change === "provisional") state.auth.profile.senha_provisoria = true;
      if (change === "noorg") state.auth.profile.organization_id = "";
      hook.rerender();
      expect(hook.result.current.list.data).toBeUndefined();
      expect(hook.result.current.kpi.data).toBeUndefined();
      expect(hook.result.current.portal.data).toBeUndefined();
      expect(client.getQueryCache().getAll().every(q => q.queryKey.at(-1) === hook.result.current.kpi.scope)).toBe(true);
      hook.unmount(); client.clear();
    });
  }
  it("rejects a late A→B→A result even if scope text becomes equal", async () => {
    state.pending = true;
    const { hook, client } = setup();
    await waitFor(() => expect(state.resolve.length).toBeGreaterThanOrEqual(3));
    const old = [...state.resolve];
    state.auth.profile.organization_id = "OB"; hook.rerender();
    state.auth.profile.organization_id = "OA"; hook.rerender();
    await act(async () => old.forEach(resolve => resolve({ data: { secret: "OLD" }, error: null })));
    expect(hook.result.current.kpi.data).toBeUndefined();
    expect(hook.result.current.portal.data).toBeUndefined();
    expect(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data))).not.toContain("OLD");
    hook.unmount(); client.clear();
  });
  it("does not call the server while the actor is unresolved", () => {
    state.auth.loading = true;
    const { hook, client } = setup();
    expect(state.calls).toEqual([]);
    expect(hook.result.current.kpi.ready).toBe(false);
    hook.unmount(); client.clear();
  });
});