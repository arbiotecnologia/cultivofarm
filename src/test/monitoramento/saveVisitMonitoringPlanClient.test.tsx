import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { useSalvarPlanoMonitoramento } from "@/hooks/useSalvarPlanoMonitoramento";
const s = vi.hoisted(() => ({ rpc: vi.fn(), ready: true, actor: "A", epoch: 0, signal: null as AbortSignal | null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => ({ abortSignal: (signal: AbortSignal) => { s.signal = signal; return s.rpc(...args); } }) } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: s.actor }, profile: { user_id: s.actor, organization_id: s.actor, ativo: true }, roles: ["consultor_tecnico"], loading: false, authzReady: s.ready, authzEpoch: s.epoch, checkAuthzAccess: () => s.ready }) }));
const id = "11111111-1111-4111-8111-111111111111";
const args = { registroId: id, expectedVersion: 8, requestId: "22222222-2222-4222-8222-222222222222", plan: { items: ["Nutrição", "Estande"], frequency: "14", triggers: "Avaliar crescimento", next_date: "2026-11-01" } };
const result = () => ({ ok: true, registro_id: id, version: 9, request_id: args.requestId, aviso_id: "33333333-3333-4333-8333-333333333333", data_referencia: args.plan.next_date, plano: args.plan });
beforeEach(() => { s.rpc.mockReset(); s.actor = "A"; s.ready = true; s.epoch = 0; s.signal = null; });
function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } });
  return renderHook(() => useSalvarPlanoMonitoramento(id), { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
}
it("contrato objeto JSONB real mantém Nutrição/Estande e CAS observado sem outra leitura", async () => {
  const h = setup(); s.rpc.mockResolvedValue({ data: result(), error: null });
  await act(async () => { expect(await h.result.current.mutateAsync(args)).toEqual(result()); });
  expect(s.rpc).toHaveBeenCalledExactlyOnceWith("rpc_salvar_plano_monitoramento_visita_v1", { p_registro_id: id, p_expected_version: 8, p_plano: args.plan, p_request_id: args.requestId });
});
it.each([null, 0, -1, 1.5])("versão %s negada sem dispatch", async version => {
  const h = setup(); await act(async () => { await expect(h.result.current.mutateAsync({ ...args, expectedVersion: version as number })).rejects.toThrow("alterada"); }); expect(s.rpc).not.toHaveBeenCalled();
});
it.each([null, [], [result()], { ...result(), ok: false }, { ...result(), registro_id: args.requestId }, { ...result(), version: 8 }, { ...result(), request_id: id }, { ...result(), data_referencia: "2026-11-02" }, { ...result(), plano: { ...args.plan, items: ["Pragas"] } }])("retorno inválido %j não confirma", async data => {
  const h = setup(); s.rpc.mockResolvedValue({ data, error: null }); await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("não confirmada"); }); expect(s.rpc).toHaveBeenCalledTimes(1);
});
it.each(["PT409", "42501", "PT404", "40001", "PGRST202"])("erro %s preserva edição e não repete", async code => {
  const h = setup(); const before = structuredClone(args); s.rpc.mockResolvedValue({ data: null, error: { code } });
  await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow(); }); expect(args).toEqual(before); expect(s.rpc).toHaveBeenCalledTimes(1);
});
it("duplo envio bloqueia síncrono; exceção libera somente operação própria", async () => {
  const h = setup(); let fail: (v: Error) => void = () => {}; s.rpc.mockImplementation(() => new Promise((_, r) => { fail = r; }));
  let first: Promise<unknown> = Promise.resolve(); act(() => { first = h.result.current.mutateAsync(args); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("em andamento"); fail(new Error("network")); await expect(first).rejects.toThrow("network"); });
  expect(s.rpc).toHaveBeenCalledTimes(1); s.rpc.mockResolvedValue({ data: result(), error: null });
  await act(async () => { expect(await h.result.current.mutateAsync(args)).toEqual(result()); });
});
it.each(["revogação", "troca", "unmount"])("latência/%s aborta e rejeita resultado tardio", async mode => {
  const h = setup(); let finish: (v: unknown) => void = () => {}; s.rpc.mockImplementation(() => new Promise(r => { finish = r; }));
  let first: Promise<unknown> = Promise.resolve(); act(() => { first = h.result.current.mutateAsync(args); }); await act(async () => { await Promise.resolve(); });
  if (mode === "unmount") h.unmount(); else { s.epoch++; if (mode === "troca") s.actor = "B"; else s.ready = false; h.rerender(); }
  expect(s.signal?.aborted).toBe(true);
  await act(async () => { finish({ data: result(), error: null }); await expect(first).rejects.toThrow("acessar esta visita"); });
});