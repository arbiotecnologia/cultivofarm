import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ published: false, pending: false, aborts: 0, scope: "A", ready: true, late: [] as Array<() => void> }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => {
  const scope = state.scope;
  return { ready: state.ready, scope, capture: () => () => state.ready && state.scope === scope };
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (name: string) => {
  if (name === "rpc_cc_publish_assignment") { state.published = true; return Promise.resolve({ error: null }); }
  const status = state.published ? "published" : "draft";
  const data = [{ id: "48dcac7d-d4a0-4058-bdf4-5461fee89f45", status }];
  return { abortSignal: (signal: AbortSignal) => {
    if (!state.pending || state.published) return Promise.resolve({ data, error: null });
    return new Promise(resolve => {
      signal.addEventListener("abort", () => { state.aborts++; });
      state.late.push(() => resolve({ data, error: null }));
    });
  } };
} } }));
import { usePlanAssignments, usePublishAssignment } from "@/hooks/useCommercialConditions";
beforeEach(() => { state.published = false; state.pending = false; state.aborts = 0; state.scope = "A"; state.ready = true; state.late = []; });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => ({ list: usePlanAssignments(), publish: usePublishAssignment() }), { wrapper });
  return { client, hook };
}
describe("publicação com releitura canônica — servidor simulado", () => {
  it("substitui rascunho pela atribuição published confirmada", async () => {
    const { hook, client } = setup();
    await waitFor(() => expect(hook.result.current.list.data?.[0].status).toBe("draft"));
    await act(async () => hook.result.current.publish.mutateAsync({ id: "48dcac7d-d4a0-4058-bdf4-5461fee89f45" }));
    expect(hook.result.current.list.data?.[0].status).toBe("published");
    hook.unmount(); client.clear();
  });
  it("cancela rascunho em voo; resposta tardia não vence publicação", async () => {
    state.pending = true;
    const { hook, client } = setup();
    await waitFor(() => expect(state.late).toHaveLength(1));
    await act(async () => hook.result.current.publish.mutateAsync({ id: "48dcac7d-d4a0-4058-bdf4-5461fee89f45" }));
    await waitFor(() => expect(hook.result.current.list.data?.[0].status).toBe("published"));
    await act(async () => state.late.forEach(resolve => resolve()));
    expect(state.aborts).toBe(1);
    expect(hook.result.current.list.data?.[0].status).toBe("published");
    hook.unmount(); client.clear();
  });
  it("esconde cache ao mudar tenant/contexto", async () => {
    const { hook, client } = setup();
    await waitFor(() => expect(hook.result.current.list.data).toHaveLength(1));
    state.scope = "B"; state.pending = true; hook.rerender();
    expect(hook.result.current.list.data).toBeUndefined();
    hook.unmount(); client.clear();
  });
});