import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Transporte sintético controlado (não é JWT/RLS real). Cada leitura fica pendente até ser resolvida no teste.
const state = vi.hoisted(() => ({
  auth: { user: { id: "A" } as { id: string } | null,
    profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
    roles: ["gestor_comercial"], loading: false, authzReady: true, authzEpoch: 0 },
  reads: [] as Array<{ filters: Record<string, unknown>; resolve: (v: unknown) => void; signal?: AbortSignal }>,
  rpc: [] as Array<{ name: string; args: unknown; resolve: (v: unknown) => void }>,
  channels: [] as string[], removed: 0,
  rtHandlers: [] as Array<() => void>,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const entry: { filters: Record<string, unknown>; resolve: (v: unknown) => void; signal?: AbortSignal } = { filters: {}, resolve: () => {} };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain; chain.order = () => chain;
    chain.abortSignal = (s: AbortSignal) => { entry.signal = s; return chain; };
    for (const m of ["eq", "gte", "lte"]) chain[m] = (k: string, v: unknown) => { entry.filters[`${m}:${k}`] = v; return chain; };
    chain.maybeSingle = () => chain;
    chain.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) => new Promise(r => { entry.resolve = r; state.reads.push(entry); }).then(res, rej);
    return chain;
  },
  rpc: (name: string, args: unknown) => new Promise(resolve => state.rpc.push({ name, args, resolve })),
  channel: (name: string) => {
    state.channels.push(name);
    const ch = { on: (_e: unknown, _f: unknown, h: () => void) => { state.rtHandlers.push(h); return ch; }, subscribe: () => ch };
    return ch;
  },
  removeChannel: () => { state.removed += 1; },
} }));

import { usePartnerOrdersAdmin } from "@/hooks/usePartnerOrdersAdmin";
import { readCreatedOrderAccountingState, useCreatePartnerOrder } from "@/hooks/useCreatePartnerOrder";
import { usePromoteAccountingPendingOrder, promotionErrorReason } from "@/hooks/usePromoteAccountingPendingOrder";
import { toast } from "sonner";

const PENDING = { contract: "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1", accounting_validated: false };
const V1 = { contract: "C2_EXTERNAL_ORDER_ORIGIN_V1" };
const row = (id: string, org: string) => ({ id, numero: id, status: "em_analise_comercial", org });

function asB() { state.auth.user = { id: "B" }; state.auth.profile.user_id = "B"; state.auth.profile.organization_id = "OB"; }
beforeEach(() => {
  state.auth.user = { id: "A" };
  Object.assign(state.auth.profile, { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false });
  state.auth.roles = ["gestor_comercial"]; state.auth.loading = false; state.auth.authzReady = true; state.auth.authzEpoch = 0;
  state.reads = []; state.rpc = []; state.channels = []; state.removed = 0; state.rtHandlers = [];
  vi.mocked(toast.success).mockClear(); vi.mocked(toast.warning).mockClear(); vi.mocked(toast.info).mockClear(); vi.mocked(toast.error).mockClear();
});
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const wrap = (c: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={c}>{children}</QueryClientProvider>;

describe("usePartnerOrdersAdmin — escopo canônico (transporte sintético)", () => {
  it("resposta tardia de A após troca para B nunca é adotada; B recebe somente a própria", async () => {
    const c = client();
    const h = renderHook(({ s }: { s?: string }) => usePartnerOrdersAdmin({ status: s }), { wrapper: wrap(c), initialProps: { s: "em_analise_comercial" } });
    await waitFor(() => expect(state.reads).toHaveLength(1));
    const readA = state.reads[0];
    asB(); h.rerender({ s: "em_analise_comercial" });
    expect(h.result.current.data).toBeUndefined();
    await waitFor(() => expect(state.reads).toHaveLength(2));
    await act(async () => { readA.resolve({ data: [row("a1", "OA")], error: null }); });
    expect(h.result.current.data).toBeUndefined();
    await act(async () => { state.reads[1].resolve({ data: [row("b1", "OB")], error: null }); });
    await waitFor(() => expect(h.result.current.data?.map(o => o.id)).toEqual(["b1"]));
    expect(c.getQueryCache().findAll({ queryKey: ["partner-orders-admin"] }).every(q => JSON.stringify(q.state.data ?? []).indexOf("a1") < 0)).toBe(true);
    h.unmount(); c.clear();
  });

  it("revogação durante a leitura oculta dados e descarta a resposta", async () => {
    const c = client();
    const h = renderHook(() => usePartnerOrdersAdmin(), { wrapper: wrap(c) });
    await waitFor(() => expect(state.reads).toHaveLength(1));
    state.auth.profile.ativo = false; h.rerender();
    await act(async () => { state.reads[0].resolve({ data: [row("a1", "OA")], error: null }); });
    expect(h.result.current.data).toBeUndefined();
    expect(h.result.current.actorReady).toBe(false);
    h.unmount(); c.clear();
  });

  it("refresh legítimo (realtime do mesmo escopo) preserva filtros", async () => {
    const c = client();
    const h = renderHook(() => usePartnerOrdersAdmin({ status: "aguardando_cotacao", partnerId: "P" }), { wrapper: wrap(c) });
    await waitFor(() => expect(state.reads).toHaveLength(1));
    await act(async () => { state.reads[0].resolve({ data: [row("a1", "OA")], error: null }); });
    await waitFor(() => expect(h.result.current.data).toHaveLength(1));
    expect(state.channels).toHaveLength(1);
    await act(async () => { state.rtHandlers.at(-1)!(); });
    await waitFor(() => expect(state.reads).toHaveLength(2));
    expect(state.reads[1].filters).toEqual({ "eq:status": "aguardando_cotacao", "eq:partner_id": "P" });
    expect(h.result.current.data?.map(o => o.id)).toEqual(["a1"]);
    h.unmount(); c.clear();
  });

  it("realtime de escopo antigo não invalida o novo e o canal é trocado por escopo", async () => {
    const c = client();
    const h = renderHook(() => usePartnerOrdersAdmin(), { wrapper: wrap(c) });
    await waitFor(() => expect(state.reads).toHaveLength(1));
    const oldHandler = state.rtHandlers.at(-1)!;
    asB(); h.rerender();
    await waitFor(() => expect(state.reads).toHaveLength(2));
    expect(state.removed).toBeGreaterThanOrEqual(1);
    expect(state.channels).toHaveLength(2);
    expect(new Set(state.channels).size).toBe(2);
    await act(async () => { oldHandler(); });
    expect(state.reads).toHaveLength(2);
    h.unmount(); c.clear();
  });
});

describe("useCreatePartnerOrder — estado contábil após criar", () => {
  const input = { partner_id: "P", items: [{ item_id: "i", item_tipo: "produto", product_id: null, nome: "x", quantidade: 1, preco_unitario: 1, desconto_percentual: 0, subtotal: 1, unidade_pedido: "litro" }] as any, expected_cart_hash: "h", idempotency_key: "k1" };
  async function run(readResult: unknown | "throw", mutateCtx?: () => void) {
    const c = client();
    const h = renderHook(() => useCreatePartnerOrder(), { wrapper: wrap(c) });
    act(() => { h.result.current.mutate(input); });
    await waitFor(() => expect(state.rpc).toHaveLength(1));
    await act(async () => { state.rpc[0].resolve({ data: { id: "o1", numero: "PB-1", total: 1 }, error: null }); });
    await waitFor(() => expect(state.reads).toHaveLength(1));
    mutateCtx?.(); if (mutateCtx) h.rerender();
    await act(async () => { readResult === "throw" ? state.reads[0].resolve(Promise.reject(new Error("net"))) : state.reads[0].resolve(readResult); });
    await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
    return { h, c };
  }
  it("pedido pendente → aviso de pendência, nunca sucesso validado", async () => {
    await run({ data: { id: "o1", c2_external_origin_snapshot: PENDING }, error: null });
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
    expect(state.rpc).toHaveLength(1);
    expect((state.rpc[0].args as any).p_idempotency_key).toBe("k1");
  });
  it("falha de leitura → estado desconhecido explícito, sem sucesso e sem reenvio", async () => {
    await run({ data: null, error: { message: "column does not exist" } });
    await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled(); expect(toast.warning).not.toHaveBeenCalled();
    expect(state.rpc).toHaveLength(1);
  });
  it("exceção de rede na leitura → desconhecido", async () => {
    await run("throw");
    await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
  });
  it("revogação/troca durante o await da leitura → nenhuma mensagem do contexto antigo", async () => {
    await run({ data: { id: "o1", c2_external_origin_snapshot: V1 }, error: null }, asB);
    expect(toast.success).not.toHaveBeenCalled(); expect(toast.info).not.toHaveBeenCalled(); expect(toast.warning).not.toHaveBeenCalled();
  });
  it("replay com a mesma chave devolve o mesmo pedido e reutiliza a chave", async () => {
    const c = client();
    const h = renderHook(() => useCreatePartnerOrder(), { wrapper: wrap(c) });
    for (let i = 0; i < 2; i++) {
      act(() => { h.result.current.mutate(input); });
      await waitFor(() => expect(state.rpc).toHaveLength(i + 1));
      await act(async () => { state.rpc[i].resolve({ data: { id: "o1", numero: "PB-1", total: 1 }, error: null }); });
      await waitFor(() => expect(state.reads).toHaveLength(i + 1));
      await act(async () => { state.reads[i].resolve({ data: { id: "o1", c2_external_origin_snapshot: V1 }, error: null }); });
      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(i + 1));
    }
    expect(state.rpc.map(r => (r.args as any).p_idempotency_key)).toEqual(["k1", "k1"]);
  });
  it("linha de outro id ou contrato desconhecido → desconhecido", async () => {
    expect(await readCreatedOrderAccountingState(undefined, () => true)).toBe("unknown");
  });
});

describe("usePromoteAccountingPendingOrder", () => {
  it("envia CAS e só confirma com contrato V1 do mesmo pedido", async () => {
    const c = client();
    const h = renderHook(() => usePromoteAccountingPendingOrder(), { wrapper: wrap(c) });
    let p!: Promise<unknown>;
    act(() => { p = h.result.current.mutateAsync({ order_id: "o1", expected_updated_at: "2026-10-26T00:00:00Z" }); });
    await waitFor(() => expect(state.rpc).toHaveLength(1));
    expect(state.rpc[0]).toMatchObject({ name: "c2_promote_accounting_pending_order_v1", args: { p_order_id: "o1", p_expected_updated_at: "2026-10-26T00:00:00Z" } });
    await act(async () => { state.rpc[0].resolve({ data: { order_id: "o2", contract: "C2_EXTERNAL_ORDER_ORIGIN_V1" }, error: null }); });
    await expect(p).rejects.toThrow("promotion_unconfirmed");
  });
  it("troca de empresa durante o await descarta o resultado", async () => {
    const c = client();
    const h = renderHook(() => usePromoteAccountingPendingOrder(), { wrapper: wrap(c) });
    let p!: Promise<unknown>;
    act(() => { p = h.result.current.mutateAsync({ order_id: "o1", expected_updated_at: "t" }); });
    await waitFor(() => expect(state.rpc).toHaveLength(1));
    state.auth.profile.organization_id = "OB"; h.rerender();
    await act(async () => { state.rpc[0].resolve({ data: { order_id: "o1", contract: "C2_EXTERNAL_ORDER_ORIGIN_V1" }, error: null }); });
    await expect(p).rejects.toThrow("context_changed");
  });
  it("mapeia erros do servidor sem inventar motivo", () => {
    expect(promotionErrorReason({ message: "C2_ACCOUNTING_PENDING" })).toBe("accounting_pending");
    expect(promotionErrorReason({ message: "C2AP_STALE" })).toBe("stale");
    expect(promotionErrorReason({ message: "C2AP_ORDER_DENIED" })).toBe("denied");
    expect(promotionErrorReason({ code: "PGRST202", message: "" })).toBe("not_installed");
    expect(promotionErrorReason({ message: "other" })).toBe("unknown");
  });
});
