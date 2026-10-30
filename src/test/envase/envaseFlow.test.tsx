import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { classifyEnvaseError, parseEnvaseAck, ENVASE_RPC } from "@/lib/envase/envaseFlow";

const t = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), auth: { user: { id: "a1" }, profile: { organization_id: "org-A" } } as any, toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: any[]) => t.rpc(...a), from: (...a: any[]) => t.from(...a) } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => t.auth }));
vi.mock("@/hooks/useCockpitQuery", () => ({ useCockpitQuery: () => ({ data: [] }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: t.toast }));
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";

const LOTE = "10000000-0000-4000-8000-0000000000aa";
const ack = { success: true, replay: false, estado: "completed", saldo_restante_ml: 0, message: "ok" };
const params = (k: string, q = 3) => ({ loteId: LOTE, osId: "os1", origem: "manual", programacaoId: "pp1", linhas: [{ tipo_embalagem: "frasco_1L", quantidade: q }], validade: "2027-01-01", idempotencyKey: k });
const envCalls = () => t.rpc.mock.calls.filter((c: any[]) => c[0] === ENVASE_RPC);
const slot = "cf:envase-uncertain:v1:a1:org-A:" + LOTE;

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); t.auth = { user: { id: "a1" }, profile: { organization_id: "org-A" } }; });

describe("envase error/ACK contract", () => {
  it("only allowlisted business refusals are definitive", () => {
    expect(classifyEnvaseError({ code: "P0001", message: "COCKPIT_ENVASE_EXIGE_CQ_APROVADO" }).status).toBe("rejected");
    expect(classifyEnvaseError({ code: "42501", message: "permission denied for function rpc_cockpit_registrar_envase_v1" }).status).toBe("rejected");
    for (const e of [{ code: "P0001", message: "COCKPIT_IDEMPOTENCY_IN_PROGRESS" }, { code: "PT503", message: "STOCK_GATE_UNAVAILABLE" }, { code: "55P03", message: "lock timeout" }, { code: "57014", message: "timeout" }, { code: "PGRST001", message: "x" }, { message: "Failed to fetch" }, { code: "P0001", message: "OTHER" }])
      expect(classifyEnvaseError(e).status).toBe("uncertain");
  });
  it("ACK must be exact", () => {
    expect(parseEnvaseAck(ack)).not.toBeNull();
    expect(parseEnvaseAck({ ...ack, success: "true" })).toBeNull();
    expect(parseEnvaseAck({ ...ack, estado: "x" })).toBeNull();
    expect(parseEnvaseAck({ ...ack, saldo_restante_ml: "NaN" })).toBeNull();
  });
});

describe("useEsteiraLaboratorio envase (mounted hook)", () => {
  it("uncertain keeps the frozen attempt; next submit replays EXACT args (no new key); confirmation clears", async () => {
    t.rpc.mockResolvedValueOnce({ data: null, error: { code: "57014", message: "timeout" } });
    const { result } = renderHook(() => useEsteiraLaboratorio());
    await act(async () => { expect(await result.current.registrarEnvaseTransacional(params("k-1"))).toBeNull(); });
    expect(localStorage.getItem(slot)).not.toBeNull();
    t.rpc.mockResolvedValueOnce({ data: { ...ack, replay: true }, error: null });
    await act(async () => { await result.current.registrarEnvaseTransacional(params("k-2-new-key", 5)); });
    expect(envCalls()).toHaveLength(2);
    expect(envCalls()[1][1]).toEqual(envCalls()[0][1]);
    expect(envCalls()[1][1].p_idempotency_key).toBe("k-1");
    expect(localStorage.getItem(slot)).toBeNull();
  });
  it("replay refused (42501/PT409) is not proof of no-commit: kept, marked, lot blocked without dispatch", async () => {
    t.rpc.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } });
    const { result } = renderHook(() => useEsteiraLaboratorio());
    await act(async () => { await result.current.registrarEnvaseTransacional(params("k-1")); });
    t.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "ENVASE_TRANSITION_SCOPE_DENIED" } });
    await act(async () => { await result.current.registrarEnvaseTransacional(params("k-1")); });
    expect(JSON.parse(localStorage.getItem(slot) as string).replayRejected).toBe("ENVASE_TRANSITION_SCOPE_DENIED");
    await act(async () => { await result.current.registrarEnvaseTransacional(params("k-3")); });
    expect(envCalls()).toHaveLength(2);
    expect(t.toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/não prova que o envio original não foi gravado/));
  });
  it("first-dispatch definitive refusal clears only that attempt", async () => {
    t.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "COCKPIT_ENVASE_EXIGE_CQ_APROVADO" } });
    const { result } = renderHook(() => useEsteiraLaboratorio());
    await act(async () => { await result.current.registrarEnvaseTransacional(params("k-1")); });
    expect(localStorage.getItem(slot)).toBeNull();
  });
  it("late ACK after tenant switch is discarded (stale) and the attempt stays for the original session", async () => {
    let release!: (v: any) => void;
    t.rpc.mockImplementationOnce(() => new Promise(r => { release = r; }));
    const { result, rerender } = renderHook(() => useEsteiraLaboratorio());
    let p: Promise<any> = Promise.resolve();
    act(() => { p = result.current.registrarEnvaseTransacional(params("k-1")); });
    t.auth = { user: { id: "a1" }, profile: { organization_id: "org-B" } }; rerender();
    await act(async () => { release({ data: ack, error: null }); expect(await p).toBeNull(); });
    expect(t.toast.success).not.toHaveBeenCalled();
    expect(localStorage.getItem(slot)).not.toBeNull();
  });
  it("manual OS stage buttons never call the legacy esteira advance", async () => {
    const { result } = renderHook(() => useEsteiraLaboratorio());
    await act(async () => {
      expect(await result.current.concluirEnvase("pp1", "os1", "manual")).toBe(false);
    });
    expect(t.rpc).not.toHaveBeenCalled();
  });
});
