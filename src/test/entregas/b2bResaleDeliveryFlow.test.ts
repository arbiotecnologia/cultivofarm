import { describe, expect, it } from "vitest";
import { parseResaleCapability, runAtomicResaleGroup, replayResaleGroup, runResaleReservation, replayResaleReservation, loadReserveAttempt, reserveSlot, parseReserveAck, RESALE_CAP_RPC, RESERVE_RPC } from "@/lib/entregas/b2bResaleDeliveryFlow";
import { buildGroupArgs, CAPABILITY_RPC, GROUP_RPC, type Rpc } from "@/lib/entregas/deliveryOperationsFlow";

const ORG = "11111111-1111-4111-8111-111111111111", OTHER = "99999999-9999-4999-8999-999999999999";
const ACTOR = "22222222-2222-4222-8222-222222222222", OS = "33333333-3333-4333-8333-333333333333";
const ST = "44444444-4444-4444-8444-444444444444", ST2 = "55555555-5555-4555-8555-555555555555";
const PA = "66666666-6666-4666-8666-666666666666", PO = "77777777-7777-4777-8777-777777777777";
const allowed = (op: string, ids = [ST], org: string = ORG) => ({ capability: "b2b_resale_delivery_v2", organization_id: org, os_id: OS, operation: op, allowed: true, stock_ids: ids });
const closedEnv = (op: string) => ({ capability: "b2b_resale_delivery_v2", organization_id: null, os_id: null, operation: op, allowed: false, stock_ids: [] });
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };
const groupInput = { requestKey: "req-key-123456", expectedOrg: ORG, osId: OS, osTipo: "padrao", osOrigem: "b2b", osPartnerOrderId: PO, osObservedUpdatedAt: "2026-11-10T10:00:00Z",
  itens: [{ itemId: ST, quantidade: 2, observedUpdatedAt: "2026-11-10T10:00:00Z", status: "reservado", reservadoParaOsId: OS, quantidadeReservada: 2, quantidadeTotal: 2 }], dados: {} };
const fence = () => {};
const genCap = { capability: "delivery_operations_v1", group: true, cancel: false };
function rpcWith(h: Record<string, (a?: any) => any>) {
  const calls: { fn: string; args?: any }[] = [];
  const rpc: Rpc = async (fn, args) => { calls.push({ fn, args }); const f = h[fn]; return f ? f(args) : { data: null, error: { code: "PGRST202" } }; };
  return { rpc, calls };
}

describe("capability v2 parser", () => {
  it("aceita só envelope exato, operação certa e ids exatos da sessão", () => {
    expect(parseResaleCapability(allowed("reserve"), OS, [ST], ORG, "reserve")?.stockIds.has(ST)).toBe(true);
    expect(parseResaleCapability(allowed("reserve"), OS, [ST], ORG, "delivery_create")).toBeNull();
    expect(parseResaleCapability(allowed("reserve", [ST], OTHER), OS, [ST], ORG, "reserve")).toBeNull();
    expect(parseResaleCapability(closedEnv("reserve"), OS, [ST], ORG, "reserve")).toBeNull();
    expect(parseResaleCapability({ ...allowed("reserve"), saldo: 3 }, OS, [ST], ORG, "reserve")).toBeNull();
    expect(parseResaleCapability(allowed("reserve", [ST]), OS, [ST, ST2], ORG, "reserve")).toBeNull();
  });
});

describe("criação de entrega B2B", () => {
  it("sem capability o builder mantém B2B fechado", () => { expect(() => buildGroupArgs(groupInput)).toThrow(/B2B permanecem indisponíveis/); });
  it("piloto ausente (envelope fechado): nenhum writer", async () => {
    const { rpc, calls } = rpcWith({ [CAPABILITY_RPC]: () => ({ data: genCap, error: null }), [RESALE_CAP_RPC]: (a) => ({ data: closedEnv(a.p_operation), error: null }) });
    expect((await runAtomicResaleGroup(rpc, groupInput, fence)).status).toBe("closed");
    expect(calls.some(c => c.fn === GROUP_RPC)).toBe(false);
  });
  it("timeout => incerto; replay exato com mesma chave", async () => {
    let n = 0;
    const { rpc, calls } = rpcWith({ [CAPABILITY_RPC]: () => ({ data: genCap, error: null }), [RESALE_CAP_RPC]: () => ({ data: allowed("delivery_create"), error: null }),
      [GROUP_RPC]: () => { n++; if (n === 1) throw new Error("timeout"); return { data: { success: true, replay: true, organization_id: ORG, os_id: OS, itens: [{ entrega_id: "88888888-8888-4888-8888-888888888888", estoque_produto_id: ST, movimentacao_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] }, error: null }; } });
    const first = await runAtomicResaleGroup(rpc, groupInput, fence);
    if (first.status !== "uncertain") throw new Error("esperado incerto");
    expect((await replayResaleGroup(rpc, first.retry, fence)).status).toBe("confirmed");
    const w = calls.filter(c => c.fn === GROUP_RPC); expect(w).toHaveLength(2); expect(w[0].args).toEqual(w[1].args); expect(w[0].args.p_origem).toBe("b2b");
  });
  it("revogado antes do replay: nenhum dispatch", async () => {
    const { rpc, calls } = rpcWith({ [CAPABILITY_RPC]: () => ({ data: genCap, error: null }), [RESALE_CAP_RPC]: (a) => ({ data: closedEnv(a.p_operation), error: null }) });
    expect((await replayResaleGroup(rpc, { fn: GROUP_RPC, args: { p_itens: [{ item_id: ST }] }, expectedOrg: ORG, osId: OS, count: 1 }, fence)).status).toBe("uncertain");
    expect(calls.some(c => c.fn === GROUP_RPC)).toBe(false);
  });
});

describe("reserva B2B: recibo exato da mesma chave", () => {
  const base = { key: "reserve-key-1", actor: ACTOR, org: ORG, osId: OS, stockId: ST, qty: 3, partnerId: PA, partnerOrderId: PO };
  it("usa somente rpc_estoque_reservar_v1 com chave; piloto ausente não chama writer", async () => {
    const s = mem(); const { rpc, calls } = rpcWith({ [RESALE_CAP_RPC]: (a) => ({ data: closedEnv(a.p_operation), error: null }) });
    expect((await runResaleReservation(rpc, s, base, fence)).status).toBe("closed");
    expect(calls.map(c => c.fn)).toEqual([RESALE_CAP_RPC]); expect(s.m.size).toBe(0);
  });
  it("timeout -> sem auto-retry; replay manual exato; recusa mantém; recibo exato confirma", async () => {
    const s = mem(); let n = 0;
    const { rpc, calls } = rpcWith({ [RESALE_CAP_RPC]: () => ({ data: allowed("reserve"), error: null }),
      [RESERVE_RPC]: () => { n++; if (n === 1) throw new Error("timeout"); if (n === 2) return { data: null, error: { code: "42501", message: "RESALE_PILOT_SCOPE_DENIED" } }; return { data: { ok: true, replay: true, itens: [ST2] }, error: null }; } });
    const out = await runResaleReservation(rpc, s, base, fence);
    expect(out.status).toBe("uncertain"); expect(calls.filter(c => c.fn === RESERVE_RPC)).toHaveLength(1);
    if (out.status !== "uncertain") return;
    await expect(runResaleReservation(rpc, s, { ...base, key: "reserve-key-2" }, fence)).rejects.toThrow(/incerto/);
    const rej = await replayResaleReservation(rpc, s, out.attempt, fence);
    expect(rej).toMatchObject({ status: "uncertain", replayRejected: "42501" }); expect(loadReserveAttempt(s, ACTOR, ORG, OS)).toEqual(base);
    expect(await replayResaleReservation(rpc, s, out.attempt, fence)).toEqual({ status: "confirmed", reservedId: ST2, replay: true });
    const w = calls.filter(c => c.fn === RESERVE_RPC); expect(w).toHaveLength(3);
    expect(w.every(c => JSON.stringify(c.args) === JSON.stringify(w[0].args))).toBe(true);
    expect(w[0].args.p_idempotency_key).toBe("reserve-key-1"); expect(w[0].args.p_origem).toBe("b2b");
    expect(s.getItem(reserveSlot(ACTOR, ORG, OS))).toBeNull();
  });
  it("recibo não exato nunca é adotado; fracionado recusado antes do envio", async () => {
    expect(parseReserveAck({ ok: true, replay: false, itens: [ST], saldo: 1 })).toBeNull();
    expect(parseReserveAck({ ok: true, replay: false, itens: [ST, ST2] })).toBeNull();
    const s = mem(); const { rpc } = rpcWith({ [RESALE_CAP_RPC]: () => ({ data: allowed("reserve"), error: null }), [RESERVE_RPC]: () => ({ data: { ok: true, itens: [ST] }, error: null }) });
    expect((await runResaleReservation(rpc, s, base, fence)).status).toBe("uncertain");
    await expect(runResaleReservation(rpc, mem(), { ...base, qty: 1.5 }, fence)).rejects.toThrow(/inteiras/);
  });
  it("troca de sessão durante envio: stale e tentativa retida", async () => {
    const s = mem(); let stale = false;
    const { rpc } = rpcWith({ [RESALE_CAP_RPC]: () => ({ data: allowed("reserve"), error: null }), [RESERVE_RPC]: () => { stale = true; return { data: { ok: true, replay: false, itens: [ST] }, error: null }; } });
    expect((await runResaleReservation(rpc, s, base, () => { if (stale) throw new Error("x"); })).status).toBe("stale");
    expect(s.getItem(reserveSlot(ACTOR, ORG, OS))).not.toBeNull();
  });
});
