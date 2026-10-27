import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReprogramarMonitoramento } from "@/hooks/useReprogramarMonitoramento";
const s = vi.hoisted(() => ({ rpc: vi.fn(), ready: true, actor: "A", epoch: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: s.rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: s.actor }, profile: { user_id: s.actor, organization_id: s.actor, ativo: true, senha_provisoria: false }, roles: ["consultor_tecnico"], loading: false, authzReady: s.ready, authzEpoch: s.epoch, checkAuthzAccess: () => s.ready }) }));
beforeEach(() => { s.rpc.mockReset(); s.ready = true; s.actor = "A"; s.epoch = 0; });
function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } }); const invalidate = vi.spyOn(qc, "invalidateQueries");
  const h = renderHook(() => useReprogramarMonitoramento(), { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
  return { h, invalidate, args: { id: "alert-A", date: "2026-10-30", expectedUpdatedAt: "2026-10-27T00:00:00.123456+00:00" } };
}
describe("reprogramar — hook real, Auth/transporte simulados, contrato servidor ainda pendente", () => {
  for (const stamp of ["", "2026-10-27", "invalid"]) it(`timestamp ${stamp} bloqueia antes do RPC`, async () => {
    const { h, args, invalidate } = setup();
    await act(async () => { await expect(h.result.current.mutateAsync({ ...args, expectedUpdatedAt: stamp })).rejects.toThrow("alterado"); });
    expect(s.rpc).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled();
  });
  it("envia revisão exata microsegundos; PT409 preserva data e não repete", async () => {
    const { h, args, invalidate } = setup(); const original = { ...args };
    s.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "conflict" } });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("data editada foi mantida"); });
    expect(s.rpc).toHaveBeenCalledExactlyOnceWith("rpc_reprogramar_monitoramento_v1", { p_alerta_id: args.id, p_nova_data: args.date, p_expected_updated_at: args.expectedUpdatedAt });
    expect(args).toEqual(original); expect(invalidate).not.toHaveBeenCalled();
  });
  it("403/404 uniformes e signed-out sem RPC", async () => {
    const { h, args, invalidate } = setup(); const errors: string[] = [];
    for (const code of ["42501", "PT403", "PT404", "P0002"]) {
      s.rpc.mockResolvedValueOnce({ data: null, error: { code, message: "foreign UUID exists" } });
      await act(async () => { try { await h.result.current.mutateAsync(args); } catch (e) { errors.push((e as Error).message); } });
    }
    expect(new Set(errors).size).toBe(1); expect(errors).toHaveLength(4); expect(invalidate).not.toHaveBeenCalled();
    s.ready = false; h.rerender(); await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("verifique seu acesso"); });
    expect(s.rpc).toHaveBeenCalledTimes(4);
  });
  for (const data of [null, {}, { success: false }, { id: "foreign" }]) it(`retorno ${JSON.stringify(data)} não é sucesso`, async () => {
    const { h, args, invalidate } = setup(); s.rpc.mockResolvedValue({ data, error: null });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("não confirmada"); }); expect(invalidate).not.toHaveBeenCalled();
  });
  it("retorno após revogação não gera sucesso/invalidação", async () => {
    const { h, args, invalidate } = setup(); let finish: (v: unknown) => void = () => {};
    s.rpc.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    let pending: Promise<unknown> = Promise.resolve(); act(() => { pending = h.result.current.mutateAsync(args); });
    await act(async () => { await Promise.resolve(); });
    s.actor = "B"; s.ready = false; s.epoch++; h.rerender();
    await act(async () => { finish({ data: { id: args.id }, error: null }); await expect(pending).rejects.toThrow("verifique seu acesso"); }); expect(invalidate).not.toHaveBeenCalled();
  });
  it("duplo envio/exceção não duplica e libera trava para retry manual", async () => {
    const { h, args } = setup(); let fail: (v: unknown) => void = () => {};
    s.rpc.mockImplementationOnce(() => new Promise((_, r) => { fail = r; }));
    let first: Promise<unknown> = Promise.resolve(); act(() => { first = h.result.current.mutateAsync(args); }); await act(async () => { await Promise.resolve(); });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("em andamento"); fail(new Error("network")); await expect(first).rejects.toThrow("network"); });
    expect(s.rpc).toHaveBeenCalledTimes(1);
    s.rpc.mockResolvedValueOnce({ data: { id: args.id }, error: null });
    await act(async () => { expect(await h.result.current.mutateAsync(args)).toEqual({ id: args.id }); }); expect(s.rpc).toHaveBeenCalledTimes(2);
  });
});