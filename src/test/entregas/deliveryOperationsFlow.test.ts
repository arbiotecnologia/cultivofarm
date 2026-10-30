import { describe, expect, it, vi } from "vitest";
import {
  CANCEL_RPC, CAPABILITY_RPC, GROUP_RPC, buildGroupArgs, clearPending, loadPending, parseCancelAck, parseCapability, parseGroupAck,
  parserFor, probeDeliveryCapability, replayUncertain, runAtomicCancel, runAtomicGroup, savePending, type GroupInput, type Rpc,
} from "@/lib/entregas/deliveryOperationsFlow";

const ORG = "10000000-0000-4000-8000-000000000001";
const OTHER_ORG = "20000000-0000-4000-8000-000000000002";
const ACTOR = "10000000-0000-4000-8000-000000000003";
const OS = "10000000-0000-4000-8000-000000000007";
const S = "10000000-0000-4000-8000-000000000013";
const E1 = "10000000-0000-4000-8000-000000000101";
const M1 = "10000000-0000-4000-8000-000000000201";
const input = (over: Partial<GroupInput> = {}): GroupInput => ({
  requestKey: "10000000-0000-4000-8000-000000000999", expectedOrg: ORG, osId: OS, osTipo: "padrao", osOrigem: "agronomica", osPartnerOrderId: null,
  osObservedUpdatedAt: "2026-10-30T10:00:00Z",
  itens: [{ itemId: S, quantidade: 2, observedUpdatedAt: "2026-10-30T09:00:00Z", status: "disponivel" }],
  dados: { tipo_entrega: "motorista", motorista: "", endereco_origem: "cadastro", motorista_telefone: "" }, ...over,
});
const cap = { capability: "delivery_operations_v1", group: true, cancel: true };
const groupAck = { success: true, replay: false, organization_id: ORG, os_id: OS, itens: [{ entrega_id: E1, estoque_produto_id: S, movimentacao_id: M1 }] };
const cancelAck = { success: true, replay: false, organization_id: ORG, entrega_id: E1, estoque_estornado: true, reserva_liberada: true };
function rpcWith(map: Record<string, unknown>) {
  return vi.fn(async (fn: string) => {
    const r = map[fn];
    if (r instanceof Error) throw r;
    return (r as any) ?? { data: null, error: { code: "PGRST202", message: "not found" } };
  }) as unknown as Rpc & ReturnType<typeof vi.fn>;
}
const noop = () => {};
const calls = (rpc: any) => rpc.mock.calls.map((c: any[]) => c[0]);

describe("capability gate", () => {
  it("stays closed when the capability RPC is not installed (current hosted state)", async () => {
    const rpc = rpcWith({});
    expect(await probeDeliveryCapability(rpc)).toEqual({ group: false, cancel: false });
    expect((await runAtomicGroup(rpc, input(), noop)).status).toBe("closed");
    expect(calls(rpc)).toEqual([CAPABILITY_RPC, CAPABILITY_RPC]);
  });
  it.each([null, {}, { ...cap, extra: 1 }, { ...cap, group: "true" }, { ...cap, capability: "x" }])("non-exact envelope %# is closed", (d) => {
    expect(parseCapability(d)).toEqual({ group: false, cancel: false });
  });
  it("throwing transport during probe is closed, zero writer calls", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: new Error("network") });
    expect((await runAtomicCancel(rpc, E1, "motivo", "2026-10-30T10:00:00Z", ORG, noop)).status).toBe("closed");
    expect(calls(rpc).every((c: string) => c === CAPABILITY_RPC)).toBe(true);
  });
  it("group-only capability keeps cancel closed", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: { ...cap, cancel: false }, error: null } });
    expect((await runAtomicCancel(rpc, E1, "m", "t", ORG, noop)).status).toBe("closed");
  });
});

describe("payload contract", () => {
  it("rejects unsupported non-empty fields (recipient/address) instead of dropping them", () => {
    expect(() => buildGroupArgs(input({ dados: { destinatario_nome: "X", motorista_telefone: "1", endereco_cidade: "Paracatu" } })))
      .toThrow(/destinatario_nome, endereco_cidade, motorista_telefone/);
  });
  it.each([
    { osTipo: "onfarm" }, { osTipo: "manual" }, { osTipo: "" }, { osOrigem: "b2b" }, { osOrigem: null },
    { osPartnerOrderId: "30000000-0000-4000-8000-000000000003" },
  ])("non-manual OS input %# is denied before any call", (over) => {
    expect(() => buildGroupArgs(input(over as Partial<GroupInput>))).toThrow(/OS agronômica manual/);
  });
  it("rejects reserved lots, duplicates, NaN/zero and invalid tenant", () => {
    expect(() => buildGroupArgs(input({ itens: [{ itemId: S, quantidade: 1, observedUpdatedAt: "t", status: "reservado" }] }))).toThrow(/reservado/);
    expect(() => buildGroupArgs(input({ itens: [input().itens[0], input().itens[0]] }))).toThrow();
    for (const q of [NaN, 0, -1, Infinity]) expect(() => buildGroupArgs(input({ itens: [{ ...input().itens[0], quantidade: q }] }))).toThrow();
    expect(() => buildGroupArgs(input({ expectedOrg: "x" }))).toThrow();
  });
  it("accepts only a reservation wholly owned by this OS", () => {
    const own = { itemId: S, quantidade: 2, observedUpdatedAt: "t", status: "reservado", reservadoParaOsId: OS, quantidadeReservada: 2, quantidadeTotal: 2 };
    expect(() => buildGroupArgs(input({ itens: [own] }))).not.toThrow();
    expect(() => buildGroupArgs(input({ itens: [{ ...own, reservadoParaOsId: S }] }))).toThrow(/outra OS/);
    expect(() => buildGroupArgs(input({ itens: [{ ...own, quantidade: 1 }] }))).toThrow(/reserva parcial/);
    expect(() => buildGroupArgs(input({ itens: [{ ...own, quantidadeReservada: 1 }] }))).toThrow(/reserva parcial/);
    expect(() => buildGroupArgs(input({ itens: [{ ...own, status: "expedido" }] }))).toThrow(/indisponível/);
  });
  it("sends only the five persisted keys with observed timestamps and manual origin", () => {
    expect(buildGroupArgs(input())).toEqual({ p_os_id: OS, p_origem: "manual", p_request_key: input().requestKey, p_os_observed: "2026-10-30T10:00:00Z",
      p_itens: [{ item_id: S, quantidade: 2, observed_updated_at: "2026-10-30T09:00:00Z" }], p_dados: { tipo_entrega: "motorista", motorista: null, endereco_origem: "cadastro" } });
  });
});

describe("ACK, tenant and outcomes", () => {
  it("confirms only the exact group ACK of the captured tenant", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: groupAck, error: null } });
    const dispatched = vi.fn();
    const out = await runAtomicGroup(rpc, input(), noop, dispatched);
    expect(out).toEqual({ status: "confirmed", ack: { replay: false, osId: OS, itens: [{ entregaId: E1, estoqueProdutoId: S, movimentacaoId: M1 }] } });
    expect(dispatched).toHaveBeenCalledTimes(1);
    expect(dispatched.mock.calls[0][0]).toMatchObject({ fn: GROUP_RPC, expectedOrg: ORG, osId: OS, count: 1 });
  });
  it("ACK from another organization is never confirmed", async () => {
    expect(parseGroupAck({ ...groupAck, organization_id: OTHER_ORG }, OS, 1, ORG)).toBeNull();
    expect(parseCancelAck({ ...cancelAck, organization_id: OTHER_ORG }, E1, ORG)).toBeNull();
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: { ...groupAck, organization_id: OTHER_ORG }, error: null } });
    expect((await runAtomicGroup(rpc, input(), noop)).status).toBe("uncertain");
  });
  it.each([
    { ...groupAck, success: false }, { ...groupAck, os_id: S }, { ...groupAck, itens: [] }, { ...groupAck, extra: 1 },
    { ...groupAck, itens: [{ entrega_id: E1, estoque_produto_id: S }] }, null,
  ])("invalid ACK %# is uncertain and keeps exact frozen args", async (d) => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: d, error: null } });
    const out = await runAtomicGroup(rpc, input(), noop);
    expect(out.status).toBe("uncertain");
    if (out.status === "uncertain") {
      expect(out.retry).toMatchObject({ fn: GROUP_RPC, args: buildGroupArgs(input()), expectedOrg: ORG });
      expect(Object.isFrozen(out.retry)).toBe(true);
    }
  });
  it.each(["PT409", "42501", "22023"])("allowlisted %s is a definitive rejection", async (code) => {
    const rej = await runAtomicGroup(rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: null, error: { code, message: "X" } } }), input(), noop);
    expect(rej).toMatchObject({ status: "rejected", code });
  });
  it.each(["57014", "08006", "PGRST000", "PGRST001", "PGRST002", "504", "502", "40001", "55P03", "PT503", "", "XX000"])("code %j is ambiguous (uncertain, never 'nothing saved')", async (code) => {
    const out = await runAtomicGroup(rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: null, error: { code, message: "timeout/proxy" } } }), input(), noop);
    expect(out.status).toBe("uncertain");
  });
  it("transport throw is uncertain", async () => {
    expect((await runAtomicGroup(rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: new Error("reset") }), input(), noop)).status).toBe("uncertain");
  });
  it("scope change between probe and dispatch sends no writer", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: groupAck, error: null } });
    let n = 0;
    await expect(runAtomicGroup(rpc, input(), () => { if (++n > 1) throw new Error("scope changed"); })).rejects.toThrow("scope changed");
    expect(calls(rpc)).toEqual([CAPABILITY_RPC]);
  });
  it.each([
    ["confirmed ACK", { data: groupAck, error: null }],
    ["rejection", { data: null, error: { code: "PT409", message: "X" } }],
    ["invalid ACK", { data: null, error: null }],
  ])("late %s after session change is stale: no confirm/reject/retry exposed", async (_n, response) => {
    let alive = true;
    const rpc = vi.fn(async (fn: string) => {
      if (fn === CAPABILITY_RPC) return { data: cap, error: null };
      alive = false; // session/tenant switched while the writer was in flight
      return response;
    }) as unknown as Rpc;
    const out = await runAtomicGroup(rpc, input(), () => { if (!alive) throw new Error("scope"); });
    expect(out).toEqual({ status: "stale" });
  });
  it("exact replay reuses identical args and confirms the stored result; late replay is stale", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: { ...groupAck, replay: true }, error: null } });
    const retry = { fn: GROUP_RPC, args: buildGroupArgs(input()), expectedOrg: ORG, osId: OS, count: 1 };
    const out = await replayUncertain(rpc, retry, parserFor(retry), noop);
    expect(out).toMatchObject({ status: "confirmed", ack: { replay: true } });
    expect((rpc as any).mock.calls[1]).toEqual([GROUP_RPC, retry.args]);
    let n = 0;
    expect(await replayUncertain(rpc, retry, parserFor(retry), () => { if (++n > 3) throw new Error("scope"); })).toEqual({ status: "stale" });
  });
  it("replay with revoked capability stays uncertain without dispatch", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: { ...cap, group: false }, error: null } });
    const retry = { fn: GROUP_RPC, args: buildGroupArgs(input()), expectedOrg: ORG, osId: OS, count: 1 };
    expect(await replayUncertain(rpc, retry, d => d, noop)).toEqual({ status: "uncertain", retry });
    expect((rpc as any).mock.calls).toHaveLength(1);
  });
  it("cancel ACK exact, with observed timestamp, tenant and reason required", async () => {
    expect(parseCancelAck(cancelAck, E1, ORG)).toEqual({ replay: false });
    expect(parseCancelAck({ ...cancelAck, reserva_liberada: false }, E1, ORG)).toBeNull();
    expect(parseCancelAck(cancelAck, S, ORG)).toBeNull();
    await expect(runAtomicCancel(rpcWith({}), E1, "  ", "t", ORG, noop)).rejects.toThrow(/motivo/);
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [CANCEL_RPC]: { data: cancelAck, error: null } });
    expect(await runAtomicCancel(rpc, E1, "m", "2026-10-30T10:00:00Z", ORG, noop)).toEqual({ status: "confirmed", ack: { replay: false } });
    expect((rpc as any).mock.calls[1]).toEqual([CANCEL_RPC, { p_entrega_id: E1, p_motivo: "m", p_observed: "2026-10-30T10:00:00Z" }]);
  });
});

describe("pending uncertain store (actor+tenant bound)", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };
  it("round-trips the frozen snapshot only for the same actor and tenant", () => {
    const s = mem();
    const r = { fn: GROUP_RPC, args: buildGroupArgs(input()), expectedOrg: ORG, osId: OS, count: 1 };
    savePending(s, ACTOR, ORG, r);
    expect(loadPending(s, ACTOR, ORG)).toEqual(r);
    expect(loadPending(s, ACTOR, OTHER_ORG)).toBeNull();
    clearPending(s, ACTOR, ORG);
    expect(loadPending(s, ACTOR, ORG)).toBeNull();
  });
  it("corrupt or cross-tenant record is reported corrupt (fail-closed)", () => {
    const s = mem();
    s.setItem(`cf:delivery-uncertain:v1:${ACTOR}:${ORG}`, "{bad");
    expect(loadPending(s, ACTOR, ORG)).toBe("corrupt");
    s.setItem(`cf:delivery-uncertain:v1:${ACTOR}:${ORG}`, JSON.stringify({ fn: GROUP_RPC, args: {}, expectedOrg: OTHER_ORG }));
    expect(loadPending(s, ACTOR, ORG)).toBe("corrupt");
  });
  it("storage write failure aborts before dispatch", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: groupAck, error: null } });
    const broken = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    await expect(runAtomicGroup(rpc, input(), noop, (r) => savePending(broken, ACTOR, ORG, r))).rejects.toThrow("quota");
    expect(calls(rpc)).toEqual([CAPABILITY_RPC]);
  });
});
