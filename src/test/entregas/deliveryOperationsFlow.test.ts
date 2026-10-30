import { describe, expect, it, vi } from "vitest";
import {
  CANCEL_RPC, CAPABILITY_RPC, GROUP_RPC, buildGroupArgs, parseCancelAck, parseCapability, parseGroupAck,
  probeDeliveryCapability, replayUncertain, runAtomicCancel, runAtomicGroup, type GroupInput, type Rpc,
} from "@/lib/entregas/deliveryOperationsFlow";

const ORG = "10000000-0000-4000-8000-000000000001";
const OS = "10000000-0000-4000-8000-000000000007";
const S = "10000000-0000-4000-8000-000000000013";
const E1 = "10000000-0000-4000-8000-000000000101";
const M1 = "10000000-0000-4000-8000-000000000201";
const input = (over: Partial<GroupInput> = {}): GroupInput => ({
  requestKey: "10000000-0000-4000-8000-000000000999", osId: OS, osTipo: "manual", osObservedUpdatedAt: "2026-10-30T10:00:00Z",
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

describe("capability gate", () => {
  it("stays closed when the capability RPC is not installed (current hosted state)", async () => {
    const rpc = rpcWith({});
    expect(await probeDeliveryCapability(rpc)).toEqual({ group: false, cancel: false });
    const out = await runAtomicGroup(rpc, input(), noop);
    expect(out.status).toBe("closed");
    expect((rpc as any).mock.calls.map((c: any[]) => c[0])).toEqual([CAPABILITY_RPC, CAPABILITY_RPC]);
  });
  it.each([null, {}, { ...cap, extra: 1 }, { ...cap, group: "true" }, { ...cap, capability: "x" }])("non-exact envelope %# is closed", (d) => {
    expect(parseCapability(d)).toEqual({ group: false, cancel: false });
  });
  it("throwing transport during probe is closed, zero writer calls", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: new Error("network") });
    expect((await runAtomicCancel(rpc, E1, "motivo", "2026-10-30T10:00:00Z", noop)).status).toBe("closed");
    expect((rpc as any).mock.calls.every((c: any[]) => c[0] === CAPABILITY_RPC)).toBe(true);
  });
  it("group-only capability keeps cancel closed", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: { ...cap, cancel: false }, error: null } });
    expect((await runAtomicCancel(rpc, E1, "m", "t", noop)).status).toBe("closed");
  });
});

describe("payload contract", () => {
  it("rejects unsupported non-empty fields instead of dropping them", () => {
    expect(() => buildGroupArgs(input({ dados: { destinatario_nome: "X", motorista_telefone: "1" } }))).toThrow(/destinatario_nome, motorista_telefone/);
  });
  it("rejects OnFarm, reserved lots, duplicates, NaN and zero", () => {
    expect(() => buildGroupArgs(input({ osTipo: "onfarm" }))).toThrow(/OnFarm/);
    expect(() => buildGroupArgs(input({ itens: [{ itemId: S, quantidade: 1, observedUpdatedAt: "t", status: "reservado" }] }))).toThrow(/reservado/);
    expect(() => buildGroupArgs(input({ itens: [input().itens[0], input().itens[0]] }))).toThrow();
    for (const q of [NaN, 0, -1, Infinity]) expect(() => buildGroupArgs(input({ itens: [{ ...input().itens[0], quantidade: q }] }))).toThrow();
  });
  it("sends only the five persisted keys with observed timestamps and manual origin", () => {
    const a = buildGroupArgs(input());
    expect(a).toEqual({ p_os_id: OS, p_origem: "manual", p_request_key: input().requestKey, p_os_observed: "2026-10-30T10:00:00Z",
      p_itens: [{ item_id: S, quantidade: 2, observed_updated_at: "2026-10-30T09:00:00Z" }], p_dados: { tipo_entrega: "motorista", motorista: null, endereco_origem: "cadastro" } });
  });
});

describe("ACK and outcomes", () => {
  it("confirms only the exact group ACK", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: groupAck, error: null } });
    const dispatched = vi.fn();
    const out = await runAtomicGroup(rpc, input(), noop, dispatched);
    expect(out).toEqual({ status: "confirmed", ack: { replay: false, osId: OS, itens: [{ entregaId: E1, estoqueProdutoId: S, movimentacaoId: M1 }] } });
    expect(dispatched).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...groupAck, success: false }, { ...groupAck, os_id: S }, { ...groupAck, itens: [] }, { ...groupAck, extra: 1 },
    { ...groupAck, itens: [{ entrega_id: E1, estoque_produto_id: S }] }, null,
  ])("invalid ACK %# is uncertain and keeps exact args", async (d) => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: d, error: null } });
    const out = await runAtomicGroup(rpc, input(), noop);
    expect(out.status).toBe("uncertain");
    if (out.status === "uncertain") expect(out.retry).toEqual({ fn: GROUP_RPC, args: buildGroupArgs(input()) });
  });
  it("server SQLSTATE is a definitive rejection; transport failure is uncertain", async () => {
    const rej = await runAtomicGroup(rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: null, error: { code: "PT409", message: "DELIVERY_OBSERVED_CONFLICT" } } }), input(), noop);
    expect(rej).toMatchObject({ status: "rejected", code: "PT409" });
    const unc = await runAtomicGroup(rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: new Error("reset") }), input(), noop);
    expect(unc.status).toBe("uncertain");
    const noCode = await runAtomicGroup(rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: null, error: { message: "Failed to fetch", code: "" } } }), input(), noop);
    expect(noCode.status).toBe("uncertain");
  });
  it("scope change between probe and dispatch sends no writer", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: groupAck, error: null } });
    let n = 0;
    const fence = () => { if (++n > 1) throw new Error("scope changed"); };
    await expect(runAtomicGroup(rpc, input(), fence)).rejects.toThrow("scope changed");
    expect((rpc as any).mock.calls.map((c: any[]) => c[0])).toEqual([CAPABILITY_RPC]);
  });
  it("exact replay reuses identical args and confirms the stored result", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [GROUP_RPC]: { data: { ...groupAck, replay: true }, error: null } });
    const retry = { fn: GROUP_RPC, args: buildGroupArgs(input()) };
    const out = await replayUncertain(rpc, retry, d => parseGroupAck(d, OS, 1), noop);
    expect(out).toMatchObject({ status: "confirmed", ack: { replay: true } });
    expect((rpc as any).mock.calls[1]).toEqual([GROUP_RPC, retry.args]);
  });
  it("replay with revoked capability stays uncertain without dispatch", async () => {
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: { ...cap, group: false }, error: null } });
    const retry = { fn: GROUP_RPC, args: buildGroupArgs(input()) };
    expect(await replayUncertain(rpc, retry, d => d, noop)).toEqual({ status: "uncertain", retry });
    expect((rpc as any).mock.calls).toHaveLength(1);
  });
  it("cancel ACK exact, with observed timestamp and reason required", async () => {
    expect(parseCancelAck(cancelAck, E1)).toEqual({ replay: false });
    expect(parseCancelAck({ ...cancelAck, reserva_liberada: false }, E1)).toBeNull();
    expect(parseCancelAck(cancelAck, S)).toBeNull();
    await expect(runAtomicCancel(rpcWith({}), E1, "  ", "t", noop)).rejects.toThrow(/motivo/);
    const rpc = rpcWith({ [CAPABILITY_RPC]: { data: cap, error: null }, [CANCEL_RPC]: { data: cancelAck, error: null } });
    expect(await runAtomicCancel(rpc, E1, "m", "2026-10-30T10:00:00Z", noop)).toEqual({ status: "confirmed", ack: { replay: false } });
    expect((rpc as any).mock.calls[1]).toEqual([CANCEL_RPC, { p_entrega_id: E1, p_motivo: "m", p_observed: "2026-10-30T10:00:00Z" }]);
  });
});
