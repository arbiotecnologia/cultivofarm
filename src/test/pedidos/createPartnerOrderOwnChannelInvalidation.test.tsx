// Invalidação escopada do canal próprio (MeusPedidos) após sucesso canônico.
// Transporte sintético; Auth simulada — não é prova JWT/RLS hosted.
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: {
    user: { id: "A" } as { id: string } | null,
    profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
    roles: ["parceiro_b2b"], loading: false,
  },
  pending: [] as Array<(v: unknown) => void>,
}));
const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("sonner", () => ({ toast: notices }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn((name:string) => name==='partner_order_journal_capability_v1'
      ? Promise.resolve({data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}})
      : new Promise((resolve) => state.pending.push(resolve))),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "stub" } }) }) }) }),
  },
}));
import { useCreatePartnerOrder } from "@/hooks/useCreatePartnerOrder";

const PARTNER = "33333333-3333-4333-8333-333333333333";
const INPUT = {
  partner_id: PARTNER,
  items: [{ item_id: "i1", item_tipo: "produto" as const, product_id: "p1", nome: "INS4", quantidade: 1, preco_unitario: 1, desconto_percentual: 0, subtotal: 1, unidade_pedido: "litro" as const }],
  expected_cart_hash: "hash-ok",
  idempotency_key: "idem-1",
  requested_delivery_date: "2026-11-05",
};
// Escopo do canal próprio para o ator A (mesma forma de useStorageAccessScope).
const scopeA = JSON.stringify([true, "A", "OA", ["parceiro_b2b"], "commercial-orders:" + PARTNER, 0]);
const scopeB = JSON.stringify([true, "B", "OB", ["parceiro_b2b"], "commercial-orders:" + PARTNER, 0]);

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, invalidate, wrapper };
}
const matchedKeys = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.flatMap(([filters]) => {
    const f = filters as { queryKey?: unknown[]; predicate?: (q: { queryKey: readonly unknown[] }) => boolean };
    if (f.queryKey) return [JSON.stringify(f.queryKey)];
    if (f.predicate) return [["commercial-own-orders", scopeA], ["commercial-own-orders", scopeB], ["outra", scopeA]]
      .filter((k) => f.predicate!({ queryKey: k })).map((k) => JSON.stringify(k));
    return [];
  });

describe("useCreatePartnerOrder — invalidação do canal próprio", () => {
  beforeEach(() => {
    state.auth = { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["parceiro_b2b"], loading: false };
    state.pending = []; vi.clearAllMocks();
  });

  it("cache quente: lista com 1 pedido é invalidada após sucesso canônico (lista relê e mostra 2)", async () => {
    const { qc, invalidate, wrapper } = setup();
    qc.setQueryData(["commercial-own-orders", scopeA], [{ id: "old", numero: "PB-001029", status: "em_analise_comercial", created_at: "2026-10-26T15:00:00+00:00" }]);
    const h = renderHook(() => useCreatePartnerOrder(), { wrapper });
    let done: Promise<unknown> = Promise.resolve();
    await act(async () => { done = h.result.current.mutateAsync(INPUT).catch(() => undefined); });
    expect(state.pending).toHaveLength(1);
    await act(async () => { state.pending[0]({ data: { id: "405ff73f-1667-43a3-a41c-56d9500dfd8b", numero: "PB-001030", total: 1 }, error: null }); await done; });
    const keys = matchedKeys(invalidate);
    expect(keys).toContain(JSON.stringify(["partner-orders"]));
    expect(keys).toContain(JSON.stringify(["commercial-own-orders", scopeA]));
    expect(keys).not.toContain(JSON.stringify(["commercial-own-orders", scopeB]));
    expect(keys).not.toContain(JSON.stringify(["outra", scopeA]));
    h.unmount(); qc.clear();
  });

  it.each(["switch", "logout", "revoked", "unmount"])("escopo muda antes da resposta (%s): nenhuma invalidação, nenhum toast", async (mode) => {
    const { qc, invalidate, wrapper } = setup();
    qc.setQueryData(["commercial-own-orders", scopeB], [{ id: "b1" }]);
    const h = renderHook(() => useCreatePartnerOrder(), { wrapper });
    let done: Promise<unknown> = Promise.resolve();
    await act(async () => { done = h.result.current.mutateAsync(INPUT).catch(() => undefined); });
    expect(state.pending).toHaveLength(1);
    if (mode === "switch") { state.auth = { ...state.auth, user: { id: "B" }, profile: { ...state.auth.profile, user_id: "B", organization_id: "OB" } }; h.rerender(); }
    else if (mode === "logout") { state.auth.user = null; h.rerender(); }
    else if (mode === "revoked") { state.auth.profile.ativo = false; h.rerender(); }
    else h.unmount();
    await act(async () => { state.pending[0]({ data: { id: "x", numero: "PB-X", total: 1 }, error: null }); await done; });
    expect(invalidate).not.toHaveBeenCalled();
    expect(notices.success).not.toHaveBeenCalled(); expect(notices.info).not.toHaveBeenCalled(); expect(notices.warning).not.toHaveBeenCalled();
    expect(qc.getQueryData(["commercial-own-orders", scopeB])).toEqual([{ id: "b1" }]);
    h.unmount(); qc.clear();
  });

  it("sucesso do ator A nunca invalida a chave de outro ator (B) nem canais estranhos", async () => {
    const { qc, invalidate, wrapper } = setup();
    const h = renderHook(() => useCreatePartnerOrder(), { wrapper });
    let done: Promise<unknown> = Promise.resolve();
    await act(async () => { done = h.result.current.mutateAsync(INPUT).catch(() => undefined); });
    await act(async () => { state.pending[0]({ data: { id: "x", numero: "PB-X", total: 1 }, error: null }); await done; });
    const keys = matchedKeys(invalidate);
    expect(keys.filter((k) => k.includes("commercial-own-orders"))).toEqual([JSON.stringify(["commercial-own-orders", scopeA])]);
    h.unmount(); qc.clear();
  });
});
