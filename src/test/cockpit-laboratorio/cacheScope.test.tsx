import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { COCKPIT_QUERY_PREFIXES, useCockpitQuery, useCockpitScope } from "@/hooks/useCockpitQuery";
import { MemoryRouter } from "react-router-dom";
import CockpitLaboratorio from "@/pages/CockpitLaboratorio";

const { auth, from, rpc } = vi.hoisted(() => ({ auth: { current: {} as Record<string, unknown> }, from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth.current }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from, rpc } }));
function actor(user = "A", tenant = "AR") {
  return { user: { id: user }, profile: { user_id: user, organization_id: tenant, ativo: true }, roles: ["administrador"], loading: false };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
describe("Cockpit scopes: real QueryClient, simulated Auth", () => {
  beforeEach(() => { auth.current = actor(); vi.clearAllMocks(); });
  it("real Cockpit never mounts querying/dialog children and purges legacy caches while contained", async () => {
    const { client } = setup();
    for (const prefix of COCKPIT_QUERY_PREFIXES) client.setQueryData([prefix], [{ id: "A-secret" }]);
    const view = () => <QueryClientProvider client={client}><MemoryRouter><CockpitLaboratorio /></MemoryRouter></QueryClientProvider>;
    const mounted = render(view());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await waitFor(() => expect(client.getQueryCache().getAll().filter(q => COCKPIT_QUERY_PREFIXES.some(p => p === q.queryKey[0]))).toHaveLength(0));
    auth.current = actor("B", "FSF"); mounted.rerender(view());
    auth.current = { user: null, profile: null, roles: [], loading: false }; mounted.rerender(view());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
    mounted.unmount(); client.clear();
  });
  it.each(COCKPIT_QUERY_PREFIXES)("closed reader %s never executes, including refetch", async prefix => {
    const { client, wrapper } = setup();
    const request = vi.fn(async () => ["A-data"]);
    const hook = renderHook(() => useCockpitQuery({ queryKey: [prefix], queryFn: request }), { wrapper });
    await act(async () => { await hook.result.current.refetch(); });
    expect(request).not.toHaveBeenCalled();
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.available).toBe(false);
    hook.unmount(); client.clear();
  });
  it("cancels A→B delayed response and evicts A", async () => {
    const { client, wrapper } = setup();
    let finish: ((value: string) => void) | undefined;
    let oldSignal: AbortSignal | undefined;
    let oldAssert: ((signal: AbortSignal) => void) | undefined;
    const hook = renderHook(() => {
      // Disposable test reader: never flips the production flag or calls Supabase.
      const session = useCockpitScope("cockpit-laboratorio", true);
      const query = useQuery({ queryKey: ["cockpit-laboratorio", session.cacheScope], enabled: session.ready, retry: false,
        queryFn: async ({ signal }) => {
          const assert = session.fence(); assert(signal);
          if ((auth.current.user as { id: string }).id === "A") {
            oldSignal = signal; oldAssert = assert;
            const value = await new Promise<string>(resolve => { finish = resolve; });
            assert(signal); return value;
          }
          return "B-data";
        } });
      return { session, query };
    }, { wrapper });
    await waitFor(() => expect(finish).toBeDefined());
    const aKey = ["cockpit-laboratorio", hook.result.current.session.cacheScope];
    const assertA = oldAssert;
    auth.current = actor("B", "FSF"); hook.rerender();
    await waitFor(() => expect(hook.result.current.query.data).toBe("B-data"));
    expect(oldSignal?.aborted).toBe(true);
    expect(client.getQueryState(aKey)).toBeUndefined();
    await act(async () => { finish?.("A-secret"); });
    expect(hook.result.current.query.data).toBe("B-data");
    auth.current = actor(); hook.rerender();
    expect(() => assertA?.(new AbortController().signal)).toThrow();
    hook.unmount(); client.clear();
  });
  it.each(["logout", "loading", "inactive", "mismatch", "no-tenant", "roles-revoked", "disabled"])("clears cache on %s", async state => {
    const { client, wrapper } = setup();
    let enabled = true;
    const hook = renderHook(() => useCockpitScope("profiles-esteira", enabled), { wrapper });
    const key = ["profiles-esteira", hook.result.current.cacheScope];
    client.setQueryData(key, ["A-profile"]);
    if (state === "logout") auth.current = { user: null, profile: null, roles: [], loading: false };
    if (state === "loading") auth.current = { ...actor(), loading: true };
    if (state === "inactive") auth.current = { ...actor(), profile: { user_id: "A", organization_id: "AR", ativo: false } };
    if (state === "mismatch") auth.current = { ...actor(), user: { id: "B" } };
    if (state === "no-tenant") auth.current = actor("A", "");
    if (state === "roles-revoked") auth.current = { ...actor(), roles: [] };
    if (state === "disabled") enabled = false;
    hook.rerender();
    await waitFor(() => expect(client.getQueryState(key)).toBeUndefined());
    expect(hook.result.current.ready).toBe(false);
    hook.unmount(); client.clear();
  });
});
