import { describe, expect, it, vi } from "vitest";
import { parseResaleCapability, runAtomicResaleGroup, replayResaleGroup, runResaleReservation, reconcileResaleReservation, loadReserveAttempt, reserveSlot, RESALE_CAP_RPC, RESERVE_RPC } from "@/lib/entregas/b2bResaleDeliveryFlow";
import { buildGroupArgs, CAPABILITY_RPC, GROUP_RPC, type Rpc } from "@/lib/entregas/deliveryOperationsFlow";

const ORG = "11111111-1111-4111-8111-111111111111", OTHER = "99999999-9999-4999-8999-999999999999";
const ACTOR = "22222222-2222-4222-8222-222222222222", OS = "33333333-3333-4333-8333-333333333333";
const ST = "44444444-4444-4444-8444-444444444444", ST2 = "55555555-5555-4555-8555-555555555555";
const PA = "66666666-6666-4666-8666-666666666666", PO = "77777777-7777-4777-8777-777777777777";
const env = (items: object[], org: string | null = ORG) => ({ capability: "b2b_resale_delivery_v1", organization_id: org, os_id: OS, items });
const it1 = (o: Partial<{ reserve: boolean; delivery_create: boolean; reserved_for_os: number }> = {}, id = ST) => ({ stock_id: id, reserve: false, delivery_create: false, reserved_for_os: 0, ...o });
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };
const groupInput = { requestKey: "req-key-123456", expectedOrg: ORG, osId: OS, osTipo: "b2b", osOrigem: "b2b", osPartnerOrderId: PO, osObservedUpdatedAt: "2026-11-10T10:00:00Z",
  itens: [{ itemId: ST, quantidade: 2, observedUpdatedAt: "2026-11-10T10:00:00Z", status: "disponivel" }], dados: {} };
const fence = () => {};

function rpcWith(handlers: Record<string, (args?: Record<string, unknown>) => { data: unknown; error: { code?: string; message?: string } | null } | Promise<never>>) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => { calls.push({ fn, args }); const h = handlers[fn]; if (!h) return { data: null, error: { code: "PGRST202" } }; return h(args); };
  return { rpc, calls };
}

describe("capability parser (fail closed)", () => {
  it("aceita só envelope exato com a empresa da sessão", () => {
    expect(parseResaleCapability(env([it1({ reserve: true })]), OS, [ST], ORG)?.items.get(ST)?.reserve).toBe(true);
    expect(parseResaleCapability(env([it1()], OTHER), OS, [ST], ORG)).toBeNull();
    expect(parseResaleCapability(env([it1()], null), OS, [ST], ORG)).toBeNull(); // piloto/escopo ausente
    expect(parseResaleCapability({ ...env([it1()]), extra: 1 }, OS, [ST], ORG)).toBeNull();
    expect(parseResaleCapability(env([it1()]), OS, [ST, ST2], ORG)).toBeNull(); // item faltante
    expect(parseResaleCapability(env([{ ...it1(), x: 1 }]), OS, [ST], ORG)).toBeNull();
  });
});

describe("criação de entrega B2B", () => {
  it("sem capability de revenda o builder mantém B2B fechado", () => {
    expect(() => buildGroupArgs(groupInput)).toThrow(/B2B permanecem indisponíveis/);
  });
  it("piloto ausente: nenhuma chamada ao writer", async () => {
    const { rpc, calls } = rpcWith({ [CAPABILITY_RPC]: () => ({ data: { capability: "delivery_operations_v1", group: true, cancel: false }, error: null }), [RESALE_CAP_RPC]: () => ({ data: env([it1()]), error: null }) });
    expect((await runAtomicResaleGroup(rpc, groupInput, fence)).status).toBe("closed");
    expect(calls.some(c => c.fn === GROUP_RPC)).toBe(false);
  });
  it("concessão exata: writer com p_origem b2b e mesma chave; timeout => incerto e replay exato", async () => {
    let n = 0;
    const { rpc, calls } = rpcWith({
      [CAPABILITY_RPC]: () => ({ data: { capability: "delivery_operations_v1", group: true, cancel: false }, error: null }),
      [RESALE_CAP_RPC]: () => ({ data: env([it1({ delivery_create: true })]), error: null }),
      [GROUP_RPC]: () => { n++; if (n === 1) return Promise.reject(new Error("timeout")); return { data: { success: true, replay: true, organization_id: ORG, os_id: OS, itens: [{ entrega_id: "88888888-8888-4888-8888-888888888888", estoque_produto_id: ST, movimentacao_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] }, error: null }; },
    });
    const first = await runAtomicResaleGroup(rpc, groupInput, fence);
    expect(first.status).toBe("uncertain");
    if (first.status !== "uncertain") return;
    const again = await replayResaleGroup(rpc, first.retry, fence);
    expect(again.status).toBe("confirmed");
    const writes = calls.filter(c => c.fn === GROUP_RPC);
    expect(writes).toHaveLength(2);
    expect(writes[0].args).toEqual(writes[1].args);
    expect(writes[0].args?.p_origem).toBe("b2b");
    expect(writes[0].args?.p_request_key).toBe("req-key-123456");
  });
  it("revogação antes do replay: nenhum novo dispatch, permanece incerto", async () => {
    const { rpc, calls } = rpcWith({ [CAPABILITY_RPC]: () => ({ data: { capability: "delivery_operations_v1", group: true, cancel: false }, error: null }), [RESALE_CAP_RPC]: () => ({ data: env([it1({ delivery_create: false })]), error: null }) });
    const retry = { fn: GROUP_RPC, args: { p_itens: [{ item_id: ST }], p_origem: "b2b" }, expectedOrg: ORG, osId: OS, count: 1 };
    expect((await replayResaleGroup(rpc, retry, fence)).status).toBe("uncertain");
    expect(calls.some(c => c.fn === GROUP_RPC)).toBe(false);
  });
  it("ACK de outra empresa nunca é adotado", async () => {
    const { rpc } = rpcWith({
      [CAPABILITY_RPC]: () => ({ data: { capability: "delivery_operations_v1", group: true, cancel: false }, error: null }),
      [RESALE_CAP_RPC]: () => ({ data: env([it1({ delivery_create: true })]), error: null }),
      [GROUP_RPC]: () => ({ data: { success: true, replay: false, organization_id: OTHER, os_id: OS, itens: [] }, error: null }),
    });
    expect((await runAtomicResaleGroup(rpc, groupInput, fence)).status).toBe("uncertain");
  });
});

describe("reserva B2B com timeout incerto", () => {
  const base = { key: "reserve-key-1", actor: ACTOR, org: ORG, osId: OS, stockId: ST, qty: 3, partnerId: PA, partnerOrderId: PO };
  it("piloto ausente: fechado e sem writer", async () => {
    const s = mem(); const { rpc, calls } = rpcWith({ [RESALE_CAP_RPC]: () => ({ data: env([it1()]), error: null }) });
    expect((await runResaleReservation(rpc, s, base, fence)).status).toBe("closed");
    expect(calls.some(c => c.fn === RESERVE_RPC)).toBe(false);
    expect(s.m.size).toBe(0);
  });
  it("timeout => reconcilia pela mesma tentativa sem nova reserva; parcial acumulada", async () => {
    const s = mem(); let reserved = 0;
    const { rpc, calls } = rpcWith({
      [RESALE_CAP_RPC]: () => ({ data: env([it1({ reserve: true, reserved_for_os: reserved })]), error: null }),
      [RESERVE_RPC]: () => Promise.reject(new Error("timeout")),
    });
    reserved = 2; // reserva parcial anterior desta OS
    const out = await runResaleReservation(rpc, s, base, fence);
    expect(out.status).toBe("uncertain");
    if (out.status !== "uncertain") return;
    expect(out.attempt.baselineReservedForOs).toBe(2);
    // ainda em voo: delta 0 => continua incerto, bloqueia nova reserva
    expect((await reconcileResaleReservation(rpc, s, out.attempt, fence)).status).toBe("uncertain");
    await expect(runResaleReservation(rpc, s, { ...base, key: "reserve-key-2" }, fence)).rejects.toThrow(/incerto/);
    // servidor confirmou depois: 2 + 3
    reserved = 5;
    const rec = await reconcileResaleReservation(rpc, s, out.attempt, fence);
    expect(rec).toEqual({ status: "confirmed", reservedId: null, reconciled: true });
    expect(calls.filter(c => c.fn === RESERVE_RPC)).toHaveLength(1);
    expect(loadReserveAttempt(s, ACTOR, ORG, OS)).toBeNull();
  });
  it("delta divergente ou capability revogada mantém tentativa retida", async () => {
    const s = mem(); let reserved = 0, open = true;
    const { rpc } = rpcWith({ [RESALE_CAP_RPC]: () => open ? { data: env([it1({ reserve: true, reserved_for_os: reserved })]), error: null } : { data: null, error: { code: "42501" } }, [RESERVE_RPC]: () => ({ data: null, error: { code: "57014" } }) });
    const out = await runResaleReservation(rpc, s, base, fence);
    if (out.status !== "uncertain") throw new Error("esperado incerto");
    reserved = 1; expect((await reconcileResaleReservation(rpc, s, out.attempt, fence)).status).toBe("uncertain");
    open = false; expect((await reconcileResaleReservation(rpc, s, out.attempt, fence)).status).toBe("uncertain");
    expect(s.getItem(reserveSlot(ACTOR, ORG, OS))).not.toBeNull();
  });
  it("recusa definitiva limpa a tentativa; quantidade fracionada é recusada antes do envio", async () => {
    const s = mem(); const { rpc, calls } = rpcWith({ [RESALE_CAP_RPC]: () => ({ data: env([it1({ reserve: true })]), error: null }), [RESERVE_RPC]: () => ({ data: null, error: { code: "42501", message: "RESALE_PILOT_SCOPE_DENIED" } }) });
    expect((await runResaleReservation(rpc, s, base, fence)).status).toBe("rejected");
    expect(s.m.size).toBe(0);
    await expect(runResaleReservation(rpc, s, { ...base, qty: 1.5 }, fence)).rejects.toThrow(/inteiras/);
    expect(calls.filter(c => c.fn === RESERVE_RPC)).toHaveLength(1);
  });
  it("troca de sessão durante o envio: resultado não é adotado", async () => {
    const s = mem(); let stale = false;
    const { rpc } = rpcWith({ [RESALE_CAP_RPC]: () => ({ data: env([it1({ reserve: true })]), error: null }), [RESERVE_RPC]: () => { stale = true; return { data: ST, error: null }; } });
    const out = await runResaleReservation(rpc, s, base, () => { if (stale) throw new Error("stale"); });
    expect(out.status).toBe("stale");
    expect(s.getItem(reserveSlot(ACTOR, ORG, OS))).not.toBeNull();
  });
});
void vi;
