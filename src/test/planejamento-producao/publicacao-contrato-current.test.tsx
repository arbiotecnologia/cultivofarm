import { createElement, type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGenerateProductionOrders } from "@/hooks/useProductionPlanning";

const transport = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: transport }));
vi.mock("@/lib/b2bToast", () => ({ b2bToast: { promise: (p: Promise<unknown>) => p } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const planning = "11111111-1111-4111-8111-111111111111";
const vars = { planning_id: planning, partner_order_id: "22222222-2222-4222-8222-222222222222", idempotency_key: "current-planning-key" };

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidation = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client: qc }, children);
  return { ...renderHook(() => useGenerateProductionOrders(), { wrapper }), qc, invalidation };
}

describe("Publicação existente — contrato e lacunas, transporte simulado, sem JWT/SQL", () => {
  beforeEach(() => transport.rpc.mockReset());
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
  it("caracteriza lacuna: dois dispatches concorrentes dependem da idempotência servidor", async () => {
    const completions: Array<(v: unknown) => void> = [];
    transport.rpc.mockImplementation(() => new Promise(resolve => { completions.push(resolve); }));
    const h = mount();
    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    act(() => { first = h.result.current.mutateAsync(vars); second = h.result.current.mutateAsync(vars); });
    await act(async () => { await Promise.resolve(); });
    expect(transport.rpc).toHaveBeenCalledTimes(2);
    await act(async () => {
      for (const finish of completions) finish({ data: { ok: true, planning_id: planning, os_created: 0, replay: true }, error: null });
      await Promise.all([first, second]);
    });
    h.unmount(); h.qc.clear();
  });
  it("caracteriza lacuna: envelope ok:false ainda é aceito pelo consumidor atual", async () => {
    transport.rpc.mockResolvedValue({ data: { ok: false, planning_id: planning, os_created: 0 }, error: null });
    const h = mount();
    await act(async () => { expect(await h.result.current.mutateAsync(vars)).toEqual({ ok: false, planning_id: planning, os_created: 0 }); });
    expect(h.invalidation).toHaveBeenCalledTimes(3);
    h.unmount(); h.qc.clear();
  });
});