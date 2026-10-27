import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSaveFiscalRascunho } from "@/hooks/useFiscalRascunho";
import { emptyRascunho } from "@/lib/fiscal/rascunhoWizardValidation";

const s = vi.hoisted(() => ({ rpc: vi.fn(), ready: true, actor: "A", epoch: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: s.rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: s.actor }, profile: { user_id: s.actor, organization_id: s.actor, ativo: true, senha_provisoria: false }, roles: ["administrador"], loading: false, authzReady: s.ready, authzEpoch: s.epoch, checkAuthzAccess: () => s.ready }) }));
beforeEach(() => { s.rpc.mockReset(); s.ready = true; s.actor = "A"; s.epoch = 0; });
function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const h = renderHook(() => useSaveFiscalRascunho(), { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
  const args = { invoiceId: "draft-A", expectedVersion: 2, values: { ...emptyRascunho(), notes: "edição não salva" }, companyCnpj: "" };
  return { h, args, invalidate };
}

describe("draft_save — hook real, Auth/transporte simulados, sem JWT positivo", () => {
  for (const version of [null, 0, -1, NaN, 1.5]) it(`update revisão ${version} não envia RPC nem altera draft`, async () => {
    const { h, args, invalidate } = setup(); const before = structuredClone(args.values);
    await act(async () => { await expect(h.result.current.mutateAsync({ ...args, expectedVersion: version })).rejects.toThrow("sem revisão válida"); });
    expect(s.rpc).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled(); expect(args.values).toEqual(before);
  });
  it("PT409 conserva payload/versão sem retry, invalidação ou sucesso", async () => {
    const { h, args, invalidate } = setup(); const before = structuredClone(args);
    s.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "conflict" } });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("alterado por outra pessoa"); });
    expect(args).toEqual(before); expect(invalidate).not.toHaveBeenCalled(); expect(s.rpc).toHaveBeenCalledTimes(1);
    expect(s.rpc.mock.calls[0]?.[1]?.p_expected_version).toBe(2);
  });
  it("403/404 uniformes não revelam existência nem reportam sucesso", async () => {
    const { h, args, invalidate } = setup(); const errors: string[] = [];
    for (const code of ["42501", "PT403", "PT404", "P0002"]) {
      s.rpc.mockResolvedValueOnce({ data: null, error: { code, message: "foreign UUID exists" } });
      await act(async () => { try { await h.result.current.mutateAsync(args); } catch (e) { errors.push((e as Error).message); } });
    }
    expect(new Set(errors).size).toBe(1); expect(errors).toHaveLength(4); expect(errors[0]).not.toContain("UUID"); expect(invalidate).not.toHaveBeenCalled();
  });
  for (const data of [null, {}, { id: "foreign", draft_version: 3, total_amount: 0 }, { id: "draft-A", draft_version: 2, total_amount: 0 }]) it(`resposta inválida ${JSON.stringify(data)} não é sucesso`, async () => {
    const { h, args, invalidate } = setup(); s.rpc.mockResolvedValue({ data, error: null });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("não confirmada"); });
    expect(invalidate).not.toHaveBeenCalled(); expect(s.rpc).toHaveBeenCalledTimes(1);
  });
  it("revogação em voo descarta retorno e não invalida", async () => {
    const { h, args, invalidate } = setup(); let finish: (v: unknown) => void = () => {};
    s.rpc.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    let pending: Promise<unknown> = Promise.resolve(); act(() => { pending = h.result.current.mutateAsync(args); });
    await act(async () => { await Promise.resolve(); });
    s.actor = "B"; s.ready = false; s.epoch++; h.rerender();
    await act(async () => { finish({ data: { id: "draft-A", draft_version: 3, total_amount: 0 }, error: null }); await expect(pending).rejects.toThrow("Verifique seu acesso"); });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("exceção libera trava; envio paralelo não duplica; retry é manual", async () => {
    const { h, args, invalidate } = setup(); let fail: (v: unknown) => void = () => {};
    s.rpc.mockImplementationOnce(() => new Promise((_, r) => { fail = r; }));
    let first: Promise<unknown> = Promise.resolve(); act(() => { first = h.result.current.mutateAsync(args); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("em andamento"); fail(new Error("network")); await expect(first).rejects.toThrow("network"); });
    expect(s.rpc).toHaveBeenCalledTimes(1); expect(invalidate).not.toHaveBeenCalled();
    s.rpc.mockResolvedValueOnce({ data: { id: "draft-A", draft_version: 3, total_amount: 0 }, error: null });
    await act(async () => { expect(await h.result.current.mutateAsync(args)).toEqual({ id: "draft-A", draft_version: 3, total_amount: 0 }); });
    expect(s.rpc).toHaveBeenCalledTimes(2);
  });
});