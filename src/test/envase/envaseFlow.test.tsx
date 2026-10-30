import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { classifyEnvaseError, parseEnvaseAck, ENVASE_RPC, saveEnvaseAttempt, clearEnvaseAttempt, loadEnvaseAttempts, type EnvaseAttempt } from "@/lib/envase/envaseFlow";

const t = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), auth: { user: { id: "a1" }, profile: { organization_id: "org-A" } } as any, toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: any[]) => t.rpc(...a), from: (...a: any[]) => t.from(...a) } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => t.auth }));
vi.mock("@/hooks/useCockpitQuery", () => ({ useCockpitQuery: () => ({ data: [] }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: t.toast }));
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";

const LOTE = "10000000-0000-4000-8000-0000000000aa";
const ack = { success: true, replay: false, estado: "completed", envases: 1, entradas_estoque: 1, volume_reservado_ml: 3000, volume_livre_ml: 0, pendente_os_ml: 0, saldo_restante_ml: 0, avanco: { success: true, replay: false, status: "pronto_entrega", status_anterior: "em_cq" }, message: "ok" };
const replayAck = { ...ack, replay: true };
const params = (k: string, q = 3) => ({ loteId: LOTE, osId: "os1", origem: "manual", programacaoId: "pp1", linhas: [{ tipo_embalagem: "frasco_1L", quantidade: q }], validade: "2027-01-01", idempotencyKey: k });
const envCalls = () => t.rpc.mock.calls.filter((c: any[]) => c[0] === ENVASE_RPC);
const slotK = (k: string, a = "a1", o = "org-A") => `cf:envase-uncertain:v2:${a}:${o}:${LOTE}:${k}`;
const slot = slotK("k-1");

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
  it("ACK rejects coerced/partial/extra envelopes", () => {
    expect(parseEnvaseAck(replayAck)).not.toBeNull();
    expect(parseEnvaseAck({ success: true, replay: false, estado: "completed", saldo_restante_ml: null })).toBeNull();
    for (const k of ["saldo_restante_ml", "envases", "volume_livre_ml", "pendente_os_ml"]) {
      expect(parseEnvaseAck({ ...ack, [k]: null })).toBeNull();
      expect(parseEnvaseAck({ ...ack, [k]: "0" })).toBeNull();
    }
    expect(parseEnvaseAck({ ...ack, volume_livre_ml: -1 })).toBeNull();
    expect(parseEnvaseAck({ ...ack, envases: 1.5 })).toBeNull();
    const { avanco: _a, ...noAv } = ack; expect(parseEnvaseAck(noAv)).toBeNull();
    expect(parseEnvaseAck({ ...ack, extra: 1 })).toBeNull();
    expect(parseEnvaseAck({ ...ack, avanco: { success: false, motivo: "COCKPIT_ENVASE_PARCIAL_NAO_AVANCA" } })).toBeNull();
    expect(parseEnvaseAck({ ...ack, pendente_os_ml: 10 })).toBeNull();
    const partial = { ...ack, estado: "partial", pendente_os_ml: 500, avanco: { success: false, motivo: "COCKPIT_ENVASE_PARCIAL_NAO_AVANCA" } };
    expect(parseEnvaseAck(partial)).not.toBeNull();
    expect(parseEnvaseAck({ ...partial, avanco: ack.avanco })).toBeNull();
    expect(parseEnvaseAck({ ...ack, avanco: { success: true, replay: true, status: "pronto_entrega" } })).not.toBeNull();
    expect(parseEnvaseAck({ ...ack, avanco: { success: true, replay: false, status: "pronto_entrega" } })).toBeNull();
  });
  it("interleaved X/Y attempts never overwrite each other; clear is conditional", () => {
    const mk = (k: string): EnvaseAttempt => ({ actorId: "a1", orgId: "org-A", args: { ...params(k), p_lote_id: LOTE, p_idempotency_key: k } as any });
    const X = mk("kx"), Y = mk("ky");
    saveEnvaseAttempt(localStorage, X);
    expect(() => saveEnvaseAttempt(localStorage, Y)).toThrow();
    // simulate another tab that wrote Y between our checks: both slots exist, neither overwritten
    localStorage.setItem(slotK("ky"), JSON.stringify(Y));
    expect(clearEnvaseAttempt(localStorage, mk("kz"))).toBe(false);
    expect(localStorage.getItem(slotK("kx"))).not.toBeNull();
    expect(clearEnvaseAttempt(localStorage, Y)).toBe(true);
    expect(localStorage.getItem(slotK("kx"))).toBe(JSON.stringify(X));
    expect((loadEnvaseAttempts(localStorage, "a1", "org-A", LOTE) as EnvaseAttempt[]).length).toBe(1);
  });
});

describe("useEsteiraLaboratorio envase (mounted hook)", () => {
  it("uncertain keeps the frozen attempt; next submit replays EXACT args (no new key); confirmation clears", async () => {
    t.rpc.mockResolvedValueOnce({ data: null, error: { code: "57014", message: "timeout" } });
    const { result } = renderHook(() => useEsteiraLaboratorio());
    await act(async () => { expect(await result.current.registrarEnvaseTransacional(params("k-1"))).toBeNull(); });
    expect(localStorage.getItem(slot)).not.toBeNull();
    t.rpc.mockResolvedValueOnce({ data: replayAck, error: null });
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
  it("malformed partial ACK keeps the pending attempt (uncertain)", async () => {
    t.rpc.mockResolvedValueOnce({ data: { success: true, replay: false, estado: "completed", saldo_restante_ml: null }, error: null });
    const { result } = renderHook(() => useEsteiraLaboratorio());
    await act(async () => { expect(await result.current.registrarEnvaseTransacional(params("k-1"))).toBeNull(); });
    expect(localStorage.getItem(slot)).not.toBeNull();
    expect(t.toast.success).not.toHaveBeenCalled();
  });
  it("two pending attempts for the lot (another tab) block dispatch", async () => {
    const mk = (k: string) => JSON.stringify({ actorId: "a1", orgId: "org-A", args: { ...params(k), p_lote_id: LOTE, p_idempotency_key: k } });
    localStorage.setItem(slotK("kx"), mk("kx")); localStorage.setItem(slotK("ky"), mk("ky"));
    const { result } = renderHook(() => useEsteiraLaboratorio());
    await act(async () => { expect(await result.current.registrarEnvaseTransacional(params("k-9"))).toBeNull(); });
    expect(envCalls()).toHaveLength(0);
    expect(localStorage.getItem(slotK("kx"))).not.toBeNull(); expect(localStorage.getItem(slotK("ky"))).not.toBeNull();
  });
  it("corrupt slot for the lot blocks new keys", async () => {
    localStorage.setItem(slotK("kx"), "{bad");
    const { result } = renderHook(() => useEsteiraLaboratorio());
    await act(async () => { await result.current.registrarEnvaseTransacional(params("k-9")); });
    expect(envCalls()).toHaveLength(0);
  });
  it("ABA actor/org: pending of org-A does not leak to org-B, and returns under org-A", async () => {
    t.rpc.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } });
    const { result, rerender } = renderHook(() => useEsteiraLaboratorio());
    await act(async () => { await result.current.registrarEnvaseTransacional(params("k-1")); });
    t.auth = { user: { id: "a1" }, profile: { organization_id: "org-B" } }; rerender();
    t.rpc.mockResolvedValueOnce({ data: ack, error: null });
    await act(async () => { await result.current.registrarEnvaseTransacional(params("k-b")); });
    expect(envCalls()[1][1].p_idempotency_key).toBe("k-b");
    expect(localStorage.getItem(slot)).not.toBeNull();
    t.auth = { user: { id: "a1" }, profile: { organization_id: "org-A" } }; rerender();
    t.rpc.mockResolvedValueOnce({ data: replayAck, error: null });
    await act(async () => { await result.current.registrarEnvaseTransacional(params("k-new")); });
    expect(envCalls()[2][1].p_idempotency_key).toBe("k-1");
    expect(localStorage.getItem(slot)).toBeNull();
  });
  it("manual OS stage buttons never call the legacy esteira advance", async () => {
    const { result } = renderHook(() => useEsteiraLaboratorio());
    await act(async () => {
      expect(await result.current.concluirEnvase("pp1", "os1", "manual")).toBe(false);
    });
    expect(t.rpc).not.toHaveBeenCalled();
  });
});
