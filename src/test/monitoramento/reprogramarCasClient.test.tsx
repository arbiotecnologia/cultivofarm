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
  return { h, invalidate, args: { id: "11111111-1111-4111-8111-111111111111", date: "2026-10-30", expectedUpdatedAt: "2026-10-27T00:00:00.123456+00:00" } };
}
const envelope = () => ({ success: true, alerta_id: "11111111-1111-4111-8111-111111111111", data_anterior: null, nova_data: "2026-10-30", registro_origem_id: null });
describe("reprogramar — hook real, Auth/transporte simulados, contrato instalado relatado", () => {
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
      s.rpc.mockResolvedValueOnce({ data: null, error: { code, message: "foreign UUID conflict" } });
      await act(async () => { try { await h.result.current.mutateAsync(args); } catch (e) { errors.push((e as Error).message); } });
    }
    expect(new Set(errors).size).toBe(1); expect(errors).toHaveLength(4); expect(invalidate).not.toHaveBeenCalled();
    s.ready = false; h.rerender(); await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("verifique seu acesso"); });
    expect(s.rpc).toHaveBeenCalledTimes(4);
  });
  it("40001 verdadeiro não vira sucesso/retry e mantém timestamp", async () => {
    const { h, args, invalidate } = setup(); const stamp = args.expectedUpdatedAt;
    s.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "serialization failure" } });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("data editada foi mantida"); });
    expect(s.rpc).toHaveBeenCalledTimes(1); expect(args.expectedUpdatedAt).toBe(stamp); expect(invalidate).not.toHaveBeenCalled();
  });
  for (const data of [null, {}, { success: false }, { id: "foreign" }]) it(`retorno ${JSON.stringify(data)} não é sucesso`, async () => {
    const { h, args, invalidate } = setup(); s.rpc.mockResolvedValue({ data, error: null });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("não confirmada"); }); expect(invalidate).not.toHaveBeenCalled();
  });
  for (const [name, data] of [
    ["apenas id correspondente", { id: envelope().alerta_id }],
    ["apenas alerta_id correspondente", { alerta_id: envelope().alerta_id }],
    ["success ausente", { ...envelope(), success: undefined }],
    ["success string", { ...envelope(), success: "true" }],
    ["success false", { ...envelope(), success: false }],
    ["alerta divergente", { ...envelope(), alerta_id: "22222222-2222-4222-8222-222222222222" }],
    ["data divergente", { ...envelope(), nova_data: "2026-10-31" }],
    ["data anterior ausente", { ...envelope(), data_anterior: undefined }],
    ["data anterior inválida", { ...envelope(), data_anterior: "2026-02-30" }],
    ["origem ausente", { ...envelope(), registro_origem_id: undefined }],
    ["origem inválida", { ...envelope(), registro_origem_id: "foreign" }],
    ["erro extra", { ...envelope(), error: "failed" }],
  ] as const) it(`envelope ${name} bloqueia sucesso/invalidação sem retry`, async () => {
    const { h, args, invalidate } = setup(); const original = { ...args };
    s.rpc.mockResolvedValue({ data, error: null });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("não confirmada"); });
    expect(s.rpc).toHaveBeenCalledTimes(1); expect(args).toEqual(original); expect(invalidate).not.toHaveBeenCalled();
  });
  for (const origin of [null, "33333333-3333-4333-8333-333333333333"]) it(`envelope completo confirma origem ${origin}`, async () => {
    const { h, args, invalidate } = setup();
    const data = { ...envelope(), data_anterior: origin ? "2026-10-29" : null, registro_origem_id: origin };
    s.rpc.mockResolvedValue({ data, error: null });
    await act(async () => { expect(await h.result.current.mutateAsync(args)).toEqual(data); });
    expect(s.rpc).toHaveBeenCalledTimes(1); expect(invalidate).toHaveBeenCalledTimes(1);
  });
  it("retorno após revogação não gera sucesso/invalidação", async () => {
    const { h, args, invalidate } = setup(); let finish: (v: unknown) => void = () => {};
    s.rpc.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    let pending: Promise<unknown> = Promise.resolve(); act(() => { pending = h.result.current.mutateAsync(args); });
    await act(async () => { await Promise.resolve(); });
    s.actor = "B"; s.ready = false; s.epoch++; h.rerender();
    await act(async () => { finish({ data: envelope(), error: null }); await expect(pending).rejects.toThrow("verifique seu acesso"); }); expect(invalidate).not.toHaveBeenCalled();
  });
  it("duplo envio/exceção não duplica e libera trava para retry manual", async () => {
    const { h, args } = setup(); let fail: (v: unknown) => void = () => {};
    s.rpc.mockImplementationOnce(() => new Promise((_, r) => { fail = r; }));
    let first: Promise<unknown> = Promise.resolve(); act(() => { first = h.result.current.mutateAsync(args); }); await act(async () => { await Promise.resolve(); });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("em andamento"); fail(new Error("network")); await expect(first).rejects.toThrow("network"); });
    expect(s.rpc).toHaveBeenCalledTimes(1);
    s.rpc.mockResolvedValueOnce({ data: envelope(), error: null });
    await act(async () => { expect(await h.result.current.mutateAsync(args)).toEqual(envelope()); }); expect(s.rpc).toHaveBeenCalledTimes(2);
  });
});