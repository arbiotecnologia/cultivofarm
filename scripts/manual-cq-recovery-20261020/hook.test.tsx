import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCQReferencia } from "/tmp/cq-review-validation/useCQReferencia";
const state = vi.hoisted(() => ({ ready: true, epoch: 0, monitor: true, from: vi.fn(), calls: [] as Array<{ filters: unknown[]; signal?: AbortSignal }>, answer: [] as unknown[], error: null as unknown, deferred: false, finish: undefined as undefined | ((value: unknown) => void) }));
// Real hook + real access-scope hook + real QueryClient. Only Auth transport and SDK boundary are fake.
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "actor-a" }, profile: { user_id: "actor-a", ativo: true, organization_id: "tenant-a" }, roles: ["administrador"], loading: false, authzReady: state.ready, authzEpoch: state.epoch, checkAuthzAccess: () => state.monitor }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from } }));
const row = { id: "ref-p", produto_id: "product", microrganismo_id: "unrelated", ativo: true, ph_min: 6, ph_max: 8, concentracao_min_ufc_ml: 100000000, aparencia_esperada: "Normal", odor_esperado: "Caracteristico", contaminacao_esperada: "Ausente" };
const clients: QueryClient[] = [];
const mount = (micro: string | null = null, product: string | null = "product") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return renderHook(({ micro, product }) => useCQReferencia(micro, product), { initialProps: { micro, product }, wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
};
beforeEach(() => {
  vi.clearAllMocks(); state.ready = true; state.epoch = 0; state.monitor = true; state.calls = []; state.answer = [row]; state.error = null; state.deferred = false;
  state.from.mockImplementation(() => {
    const call = { filters: [] as unknown[], signal: undefined as AbortSignal | undefined }; state.calls.push(call);
    const request = { select: () => request, eq: (k: string, v: unknown) => { call.filters.push(["eq", k, v]); return request; }, is: (k: string, v: unknown) => { call.filters.push(["is", k, v]); return request; }, limit: (n: number) => { call.filters.push(["limit", n]); return request; }, abortSignal: (signal: AbortSignal) => { call.signal = signal; return state.deferred ? new Promise(resolve => { state.finish = resolve; }) : Promise.resolve({ data: state.answer, error: state.error }); } };
    return request;
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); vi.useRealTimers(); });
describe("canonical CQ reference real hook", () => {
  it("reads product with no micro and no fabricated association", async () => { const h = mount(); await waitFor(() => expect(h.result.current.data?.id).toBe("ref-p")); expect(state.calls[0].filters).toEqual([["eq", "ativo", true], ["eq", "produto_id", "product"], ["limit", 2]]); });
  it("product wins even with different micro", async () => { const h = mount("other"); await waitFor(() => expect(h.result.current.data?.id).toBe("ref-p")); expect(state.calls[0].filters).not.toContainEqual(["eq", "microrganismo_id", "other"]); });
  it("absent product reference never falls back to micro", async () => { state.answer = []; const h = mount("micro"); await waitFor(() => expect(h.result.current.isSuccess).toBe(true)); expect(h.result.current.data).toBeNull(); expect(state.from).toHaveBeenCalledTimes(1); });
  it("micro-only requires null product and exact micro", async () => { state.answer = [{ ...row, produto_id: null, microrganismo_id: "micro" }]; const h = mount("micro", null); await waitFor(() => expect(h.result.current.data?.id).toBe("ref-p")); expect(state.calls[0].filters).toEqual([["eq", "ativo", true], ["is", "produto_id", null], ["eq", "microrganismo_id", "micro"], ["limit", 2]]); });
  for (const kind of ["ambiguous", "inactive", "wrong-product", "transport"]) it(`fails closed for ${kind}`, async () => { if (kind === "ambiguous") state.answer = [row, { ...row, id: "duplicate" }]; if (kind === "inactive") state.answer = [{ ...row, ativo: false }]; if (kind === "wrong-product") state.answer = [{ ...row, produto_id: "foreign" }]; if (kind === "transport") state.error = { message: "private" }; const h = mount(); await waitFor(() => expect(h.result.current.isError).toBe(true)); expect(h.result.current.data).toBeUndefined(); expect(state.from).toHaveBeenCalledTimes(1); });
  it("does not read without item or authorization", () => { state.ready = false; mount(); mount(null, null); expect(state.from).not.toHaveBeenCalled(); });
  it("revocation aborts and hides cached data immediately", async () => { const h = mount(); await waitFor(() => expect(h.result.current.data?.id).toBe("ref-p")); state.ready = false; state.epoch++; h.rerender({ micro: null, product: "product" }); expect(h.result.current.data).toBeUndefined(); expect(state.from).toHaveBeenCalledTimes(1); });
  it("pending epoch change aborts; late success never repopulates", async () => { state.deferred = true; const h = mount(); await waitFor(() => expect(state.calls).toHaveLength(1)); const finish = state.finish; state.ready = false; state.epoch++; h.rerender({ micro: null, product: "product" }); expect(state.calls[0].signal?.aborted).toBe(true); await act(async () => { finish?.({ data: [row], error: null }); }); expect(h.result.current.data).toBeUndefined(); });
  it("live monitor expiry rejects completion even before a render", async () => { state.deferred = true; const h = mount(); await waitFor(() => expect(state.calls).toHaveLength(1)); state.monitor = false; await act(async () => state.finish?.({ data: [row], error: null })); expect(h.result.current.data).toBeUndefined(); expect(state.from).toHaveBeenCalledTimes(1); });
  it("real deadline aborts hanging transport", async () => { vi.useFakeTimers(); state.deferred = true; const h = mount(); await act(async () => vi.advanceTimersByTimeAsync(12001)); expect(state.calls[0].signal?.aborted).toBe(true); await act(async () => vi.advanceTimersByTimeAsync(10)); expect(h.result.current.data).toBeUndefined(); expect(h.result.current.isError).toBe(true); });
});