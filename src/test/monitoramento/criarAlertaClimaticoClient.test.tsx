import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCriarAlertaClimatico } from "@/hooks/useCriarAlertaClimatico";
const s = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), ready: true, actor: "A" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: s.rpc, from: s.from } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: s.actor }, profile: { user_id: s.actor, organization_id: s.actor, ativo: true, senha_provisoria: false }, roles: ["consultor_tecnico"], loading: false, authzReady: s.ready, authzEpoch: 0, checkAuthzAccess: () => s.ready }) }));
beforeEach(() => { s.rpc.mockReset(); s.from.mockReset(); s.ready = true; s.actor = "A"; });
const ID = "22222222-2222-4222-8222-222222222222";
const args = { fazendaId: "ff35e2a0-8cdc-4913-b732-61875ebd1831", talhaoId: "a3144e03-dae2-4a05-9f07-f6943f3947f3", tipoAlerta: "praga" as const, nivelRisco: "alto" as const, descricao: "d" };
function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } }); const invalidate = vi.spyOn(qc, "invalidateQueries");
  const h = renderHook(() => useCriarAlertaClimatico(), { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
  return { h, invalidate };
}
describe("criar alerta climático — hook real, Auth/transporte simulados", () => {
  it("usa somente a RPC canônica com argumentos exatos; nunca INSERT direto", async () => {
    const { h, invalidate } = setup(); s.rpc.mockResolvedValue({ data: [{ id: ID, criado: true }], error: null });
    let r: unknown; await act(async () => { r = await h.result.current.mutateAsync(args); });
    expect(r).toEqual({ id: ID, criado: true });
    expect(s.rpc).toHaveBeenCalledExactlyOnceWith("rpc_criar_alerta_climatico_v1", { p_fazenda_id: args.fazendaId, p_talhao_id: args.talhaoId, p_tipo_alerta: "praga", p_nivel_risco: "alto", p_descricao: "d" });
    expect(s.from).not.toHaveBeenCalled(); expect(invalidate).toHaveBeenCalledTimes(1);
  });
  it("criado=false é deduplicação, não novo alerta", async () => {
    const { h } = setup(); s.rpc.mockResolvedValue({ data: [{ id: ID, criado: false }], error: null });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).resolves.toEqual({ id: ID, criado: false }); });
  });
  it("403/404 uniformes, sem retry nem invalidação", async () => {
    const { h, invalidate } = setup(); const msgs: string[] = [];
    for (const code of ["42501", "PT403", "PT404", "P0002"]) {
      s.rpc.mockResolvedValueOnce({ data: null, error: { code, message: "foreign" } });
      await act(async () => { try { await h.result.current.mutateAsync(args); } catch (e) { msgs.push((e as Error).message); } });
    }
    expect(new Set(msgs).size).toBe(1); expect(s.rpc).toHaveBeenCalledTimes(4); expect(invalidate).not.toHaveBeenCalled();
  });
  it("PT409/40001/erro de rede não repetem", async () => {
    const { h } = setup();
    for (const err of [{ code: "PT409", message: "x" }, { code: "40001", message: "x" }]) {
      s.rpc.mockResolvedValueOnce({ data: null, error: err });
      await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow(); });
    }
    s.rpc.mockRejectedValueOnce(new Error("network"));
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow(); });
    expect(s.rpc).toHaveBeenCalledTimes(3);
  });
  for (const data of [null, [], {}, [{ id: ID }], [{ criado: true }], [{ id: "x", criado: true }], [{ id: ID, criado: "true" }], [{ id: ID, criado: true, extra: 1 }], [{ id: ID, criado: true }, { id: ID, criado: true }], { id: ID, criado: true }]) {
    it(`retorno ${JSON.stringify(data)} não é sucesso`, async () => {
      const { h, invalidate } = setup(); s.rpc.mockResolvedValue({ data, error: null });
      await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("não confirmada"); });
      expect(invalidate).not.toHaveBeenCalled();
    });
  }
  it("signed-out/revogado não chama RPC; revogação durante voo não confirma", async () => {
    const { h, invalidate } = setup(); s.ready = false; h.rerender();
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("verifique seu acesso"); });
    expect(s.rpc).not.toHaveBeenCalled();
    s.ready = true; h.rerender();
    let resolve!: (v: unknown) => void; s.rpc.mockReturnValue(new Promise((r) => { resolve = r; }));
    let p!: Promise<unknown>; act(() => { p = h.result.current.mutateAsync(args); });
    s.ready = false; h.rerender(); resolve({ data: [{ id: ID, criado: true }], error: null });
    await act(async () => { await expect(p).rejects.toThrow("verifique seu acesso"); });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("troca de ator durante voo não confirma", async () => {
    const { h, invalidate } = setup();
    let resolve!: (v: unknown) => void; s.rpc.mockReturnValue(new Promise((r) => { resolve = r; }));
    let p!: Promise<unknown>; act(() => { p = h.result.current.mutateAsync(args); });
    s.actor = "B"; h.rerender(); resolve({ data: [{ id: ID, criado: true }], error: null });
    await act(async () => { await expect(p).rejects.toThrow(); }); expect(invalidate).not.toHaveBeenCalled();
  });
  it("duplo envio síncrono: uma RPC", async () => {
    const { h } = setup(); let resolve!: (v: unknown) => void; s.rpc.mockReturnValue(new Promise((r) => { resolve = r; }));
    let p1!: Promise<unknown>, p2!: Promise<unknown>;
    act(() => { p1 = h.result.current.mutateAsync(args); p2 = h.result.current.mutateAsync(args); });
    await act(async () => { await expect(p2).rejects.toThrow("em andamento"); });
    resolve({ data: [{ id: ID, criado: true }], error: null });
    await act(async () => { await p1; }); expect(s.rpc).toHaveBeenCalledTimes(1);
  });
  it("PrevisaoInteligente não grava diretamente em alertas_agronomicos", () => {
    const src = readFileSync("src/components/previsao/PrevisaoInteligente.tsx", "utf8");
    expect(src).not.toMatch(/from\("alertas_agronomicos"\)/); expect(src).toContain("useCriarAlertaClimatico");
  });
});
