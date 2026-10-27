import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAtualizarStatusAlerta } from "@/hooks/useAtualizarStatusAlerta";
const s = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), ready: true, actor: "A" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: s.rpc, from: s.from } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: s.actor }, profile: { user_id: s.actor, organization_id: s.actor, ativo: true, senha_provisoria: false }, roles: ["gestor"], loading: false, authzReady: s.ready, authzEpoch: 0, checkAuthzAccess: () => s.ready }) }));
beforeEach(() => { s.rpc.mockReset(); s.from.mockReset(); s.ready = true; s.actor = "A"; });
const ID = "33333333-3333-4333-8333-333333333333";
const STAMP = "2026-10-27T00:00:00.123456+00:00";
const NEW = "2026-10-27T00:05:00.654321+00:00";
const args = { id: ID, status: "monitoramento" as const, expectedUpdatedAt: STAMP };
const row = (o: Record<string, unknown> = {}) => [{ id: ID, status: "monitoramento", updated_at: NEW, registro_origem_id: null, ...o }];
function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } }); const invalidate = vi.spyOn(qc, "invalidateQueries");
  const h = renderHook(() => useAtualizarStatusAlerta(), { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
  return { h, invalidate };
}
describe("status de alerta agronômico — hook real, Auth/transporte simulados", () => {
  it("RPC canônica com timestamp exato; sem UPDATE direto", async () => {
    const { h, invalidate } = setup(); s.rpc.mockResolvedValue({ data: row(), error: null });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).resolves.toEqual({ id: ID, status: "monitoramento", updated_at: NEW }); });
    expect(s.rpc).toHaveBeenCalledExactlyOnceWith("rpc_atualizar_status_alerta_agronomico_v1", { p_alerta_id: ID, p_novo_status: "monitoramento", p_updated_at_esperado: STAMP });
    expect(s.from).not.toHaveBeenCalled(); expect(invalidate).toHaveBeenCalledTimes(1);
  });
  for (const stamp of ["", "2026-10-27", "x"]) it(`timestamp "${stamp}" bloqueia antes do RPC`, async () => {
    const { h } = setup();
    await act(async () => { await expect(h.result.current.mutateAsync({ ...args, expectedUpdatedAt: stamp })).rejects.toThrow("alterado"); });
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("PT409 vira conflito; sem retry/invalidação", async () => {
    const { h, invalidate } = setup(); s.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "stale" } });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("alterado por outra pessoa"); });
    expect(s.rpc).toHaveBeenCalledTimes(1); expect(invalidate).not.toHaveBeenCalled();
  });
  it("403/404 uniformes; 40001/rede sem retry", async () => {
    const { h } = setup(); const msgs: string[] = [];
    for (const code of ["42501", "PT403", "PT404", "P0002"]) {
      s.rpc.mockResolvedValueOnce({ data: null, error: { code, message: "foreign" } });
      await act(async () => { try { await h.result.current.mutateAsync(args); } catch (e) { msgs.push((e as Error).message); } });
    }
    expect(new Set(msgs).size).toBe(1);
    s.rpc.mockResolvedValueOnce({ data: null, error: { code: "40001", message: "x" } });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow(); });
    s.rpc.mockRejectedValueOnce(new Error("network"));
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow(); });
    expect(s.rpc).toHaveBeenCalledTimes(6);
  });
  for (const [name, data] of [
    ["null", null], ["vazio", []], ["objeto sem array", row()[0]], ["duas linhas", [...row(), ...row()]],
    ["id alheio", row({ id: "44444444-4444-4444-8444-444444444444" })], ["status diferente", row({ status: "ativo" })],
    ["updated_at ausente", row({ updated_at: undefined })], ["updated_at igual", row({ updated_at: STAMP })],
    ["updated_at anterior", row({ updated_at: "2026-10-26T00:00:00Z" })], ["updated_at inválido", row({ updated_at: "ontem" })],
  ] as const) it(`retorno ${name} não é sucesso`, async () => {
    const { h, invalidate } = setup(); s.rpc.mockResolvedValue({ data, error: null });
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("não confirmada"); });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("revogado não chama RPC; revogação em voo não confirma", async () => {
    const { h, invalidate } = setup(); s.ready = false; h.rerender();
    await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("verifique seu acesso"); });
    expect(s.rpc).not.toHaveBeenCalled(); s.ready = true; h.rerender();
    let resolve!: (v: unknown) => void; s.rpc.mockReturnValue(new Promise((r) => { resolve = r; }));
    let p!: Promise<unknown>; act(() => { p = h.result.current.mutateAsync(args); });
    await act(async () => { await Promise.resolve(); }); expect(s.rpc).toHaveBeenCalledTimes(1);
    s.ready = false; h.rerender(); resolve({ data: row(), error: null });
    await act(async () => { await expect(p).rejects.toThrow("verifique seu acesso"); }); expect(invalidate).not.toHaveBeenCalled();
  });
  it("troca de ator em voo não confirma", async () => {
    const { h, invalidate } = setup();
    let resolve!: (v: unknown) => void; s.rpc.mockReturnValue(new Promise((r) => { resolve = r; }));
    let p!: Promise<unknown>; act(() => { p = h.result.current.mutateAsync(args); });
    await act(async () => { await Promise.resolve(); });
    s.actor = "B"; h.rerender(); resolve({ data: row(), error: null });
    await act(async () => { await expect(p).rejects.toThrow(); }); expect(invalidate).not.toHaveBeenCalled();
  });
  it("duplo clique síncrono: uma RPC", async () => {
    const { h } = setup(); let resolve!: (v: unknown) => void; s.rpc.mockReturnValue(new Promise((r) => { resolve = r; }));
    let p1!: Promise<unknown>, p2!: Promise<unknown>;
    act(() => { p1 = h.result.current.mutateAsync(args); p2 = h.result.current.mutateAsync({ ...args, status: "encerrado" }); });
    await act(async () => { await expect(p2).rejects.toThrow("em andamento"); });
    resolve({ data: row(), error: null }); await act(async () => { await p1; });
    expect(s.rpc).toHaveBeenCalledTimes(1);
  });
  it("PainelAlertas sem UPDATE direto e mesmas ações", () => {
    const src = readFileSync("src/components/previsao/PainelAlertas.tsx", "utf8");
    expect(src).not.toMatch(/\.update\(/); expect(src).toContain("useAtualizarStatusAlerta");
    expect(src).toContain('alterarStatus(a, "monitoramento")'); expect(src.match(/alterarStatus\(a, "encerrado"\)/g)).toHaveLength(2);
  });
});
