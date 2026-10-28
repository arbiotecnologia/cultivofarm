import { createElement, type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGenerateProductionOrders } from "@/hooks/useProductionPlanning";

const transport = vi.hoisted(() => ({ rpc: vi.fn(), auth: {} as any }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => transport.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: transport }));
vi.mock("@/lib/b2bToast", () => ({ b2bToast: { promise: (p: Promise<unknown>) => p } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const planning = "11111111-1111-4111-8111-111111111111";
const vars = { planning_id: planning, partner_order_id: "22222222-2222-4222-8222-222222222222", idempotency_key: "current-planning-key" };

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } });
  const invalidation = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client: qc }, children);
  return { ...renderHook(() => useGenerateProductionOrders(), { wrapper }), qc, invalidation };
}

describe("Publicação existente — contrato e lacunas, transporte simulado, sem JWT/SQL", () => {
  beforeEach(() => {
    transport.rpc.mockReset();
    transport.auth = { user: { id: "33333333-3333-4333-8333-333333333333" }, profile: { user_id: "33333333-3333-4333-8333-333333333333", organization_id: "44444444-4444-4444-8444-444444444444", ativo: true }, roles: ["producao"], loading: false, authzReady: true, authzEpoch: 0 };
  });
  it("envia somente planejamento/chave e invalida os consumidores após ACK", async () => {
    transport.rpc.mockResolvedValue({ data: { ok: true, planning_id: planning, os_created: 2, replay: true }, error: null });
    const h = mount();
    await act(async () => { await h.result.current.mutateAsync(vars); });
    expect(transport.rpc).toHaveBeenCalledExactlyOnceWith("rpc_planejamento_publicar_v1", { p_planning_id: planning, p_idempotency_key: "current-planning-key" });
    expect(h.invalidation).toHaveBeenCalledWith({ queryKey: ["production-planning"] });
    expect(h.invalidation).toHaveBeenCalledWith({ queryKey: ["production-planning-detail"] });
    expect(h.invalidation).toHaveBeenCalledWith({ queryKey: ["cockpit-laboratorio"] });
    h.unmount(); h.qc.clear();
  });
  it.each(["PT409", "42501", "55P03"])("%s não tenta legado, não repete e não invalida", async (code) => {
    transport.rpc.mockResolvedValue({ data: null, error: { code, message: code } });
    const h = mount();
    await act(async () => { await expect(h.result.current.mutateAsync(vars)).rejects.toThrow(); });
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    expect(h.invalidation).not.toHaveBeenCalled();
    h.unmount(); h.qc.clear();
  });
  it("dupla submissão envia uma RPC e rejeita a segunda sem retry", async () => {
    const completions: Array<(v: unknown) => void> = [];
    transport.rpc.mockImplementation(() => new Promise(resolve => { completions.push(resolve); }));
    const h = mount();
    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    act(() => { first = h.result.current.mutateAsync(vars); second = h.result.current.mutateAsync(vars).catch(e => e); });
    await act(async () => { await Promise.resolve(); });
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    await act(async () => {
      for (const finish of completions) finish({ data: { ok: true, planning_id: planning, os_created: 0, replay: true }, error: null });
      await Promise.all([first, second]);
    });
    expect(await second).toBeInstanceOf(Error);
    h.unmount(); h.qc.clear();
  });
  it.each([{ ok: false, planning_id: planning, os_created: 0 }, null,
    { ok: true, planning_id: vars.partner_order_id, os_created: 1 },
    { ok: true, planning_id: planning, os_created: -1 },
    { ok: true, planning_id: planning, os_created: "1" },
    { ok: true, planning_id: planning, os_created: 1, replay: "true" }])("envelope inválido não vira sucesso nem invalida: %j", async (data) => {
    transport.rpc.mockResolvedValue({ data, error: null });
    const h = mount();
    await act(async () => { await expect(h.result.current.mutateAsync(vars)).rejects.toThrow(); });
    expect(h.invalidation).not.toHaveBeenCalled(); expect(transport.rpc).toHaveBeenCalledTimes(1);
    h.unmount(); h.qc.clear();
  });
  it.each(["tenant", "actor", "epoch", "inactive"])("ACK tardio após %s não adota resultado", async (change) => {
    let finish: ((v: unknown) => void) | undefined;
    transport.rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const h = mount(); let request: Promise<unknown> | undefined;
    act(() => { request = h.result.current.mutateAsync(vars).catch(e => e); });
    await act(async () => { await Promise.resolve(); });
    if (change === "tenant") transport.auth.profile.organization_id = vars.partner_order_id;
    if (change === "actor") transport.auth.user.id = vars.partner_order_id;
    if (change === "epoch") transport.auth.authzEpoch++;
    if (change === "inactive") transport.auth.profile.ativo = false;
    h.rerender();
    await act(async () => { finish?.({ data: { ok: true, planning_id: planning, os_created: 1 }, error: null }); await request; });
    expect(await request).toBeInstanceOf(Error); expect(h.invalidation).not.toHaveBeenCalled();
    expect(transport.rpc).toHaveBeenCalledTimes(1); h.unmount(); h.qc.clear();
  });
  it.each(["PGRST202", "42883", "404"])("ausência %s nunca chama legado", async (code) => {
    transport.rpc.mockResolvedValue({ data: null, error: { code, message: "function does not exist" } });
    const h = mount();
    await act(async () => { await expect(h.result.current.mutateAsync(vars)).rejects.toThrow(); });
    expect(transport.rpc).toHaveBeenCalledTimes(1); expect(h.invalidation).not.toHaveBeenCalled();
    h.unmount(); h.qc.clear();
  });
});