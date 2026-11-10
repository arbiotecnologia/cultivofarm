/**
 * B2B resale (revenda) adapter over the EXISTING atomic writers. Opens only with the exact read-only server
 * capability `rpc_b2b_resale_delivery_capability_v1` (actor/tenant/OS/stock, current pilot grant), probed
 * immediately before dispatch; any error, absence or envelope drift keeps it closed. The capability never
 * authorizes: writers re-check everything. Uncertain reservation is reconciled read-only by the same attempt
 * key and is NEVER re-dispatched (no second reservation / stock movement).
 */
import { DELIVERY_OPERATION_BLOCK } from "./operationalContainment";
import { DEFINITIVE_REJECTION_CODES, GROUP_RPC, dispatchOnce, freeze, parseGroupAck, probeDeliveryCapability, replayUncertain, type GroupAck, type GroupInput, type Outcome, type RetrySnapshot, type Rpc } from "./deliveryOperationsFlow";

export const RESALE_CAP_RPC = "rpc_b2b_resale_delivery_capability_v1";
export const RESERVE_RPC = "reservar_estoque_item";
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keysExact = (v: Record<string, unknown>, k: string[]) => { const a = Object.keys(v).sort(); return a.length === k.length && [...k].sort().every((x, i) => x === a[i]); };

export type ResaleItemCap = { reserve: boolean; deliveryCreate: boolean; reservedForOs: number };
export type ResaleCapability = { osId: string; organizationId: string; items: ReadonlyMap<string, ResaleItemCap> };

/** Exact envelope for exactly the requested stock ids, echoing the session tenant; anything else => null (closed). */
export function parseResaleCapability(data: unknown, osId: string, stockIds: string[], expectedOrg: string): ResaleCapability | null {
  if (!isObj(data) || !keysExact(data, ["capability", "organization_id", "os_id", "items"])) return null;
  if (data.capability !== "b2b_resale_delivery_v1" || data.os_id !== osId || !UUID.test(expectedOrg) || data.organization_id !== expectedOrg || !Array.isArray(data.items)) return null;
  const want = new Set(stockIds);
  if (want.size !== stockIds.length || data.items.length !== want.size) return null;
  const items = new Map<string, ResaleItemCap>();
  for (const x of data.items) {
    if (!isObj(x) || !keysExact(x, ["stock_id", "reserve", "delivery_create", "reserved_for_os"])) return null;
    const id = x.stock_id, r = x.reserved_for_os;
    if (typeof id !== "string" || !want.has(id) || items.has(id) || typeof x.reserve !== "boolean" || typeof x.delivery_create !== "boolean" || typeof r !== "number" || !Number.isFinite(r) || r < 0) return null;
    items.set(id, { reserve: x.reserve, deliveryCreate: x.delivery_create, reservedForOs: r });
  }
  return { osId, organizationId: expectedOrg, items };
}

export async function probeResaleCapability(rpc: Rpc, osId: string, stockIds: string[], expectedOrg: string): Promise<ResaleCapability | null> {
  if (!UUID.test(osId) || stockIds.length < 1 || stockIds.length > 100 || !stockIds.every(s => UUID.test(s))) return null;
  try {
    const { data, error } = await rpc(RESALE_CAP_RPC, { p_os_id: osId, p_stock_ids: stockIds });
    return error ? null : parseResaleCapability(data, osId, stockIds, expectedOrg);
  } catch { return null; }
}

/** Group creation for B2B resale: generic group capability AND exact resale capability, then the single atomic writer. */
export async function runAtomicResaleGroup(rpc: Rpc, input: Omit<GroupInput, "resale">, fence: () => void, onDispatch: (r: RetrySnapshot) => void = () => {}): Promise<Outcome<GroupAck>> {
  const ids = input.itens.map(i => i.itemId);
  const [cap, resale] = await Promise.all([probeDeliveryCapability(rpc), probeResaleCapability(rpc, input.osId, ids, input.expectedOrg)]);
  fence();
  if (!cap.group || !resale || !ids.every(id => resale.items.get(id)?.deliveryCreate === true)) return { status: "closed", message: DELIVERY_OPERATION_BLOCK };
  const { buildGroupArgs } = await import("./deliveryOperationsFlow");
  const args = buildGroupArgs({ ...input, resale });
  const retry = freeze({ fn: GROUP_RPC, args, expectedOrg: input.expectedOrg, osId: input.osId, count: ids.length });
  return dispatchOnce(rpc, retry, d => parseGroupAck(d, input.osId, ids.length, input.expectedOrg), fence, onDispatch);
}

/** Exact replay (same request key/args) of an uncertain B2B group; requires the resale capability to still be open. */
export async function replayResaleGroup(rpc: Rpc, retry: RetrySnapshot, fence: () => void, onDispatch: (r: RetrySnapshot) => void = () => {}): Promise<Outcome<GroupAck>> {
  const itens = Array.isArray(retry.args.p_itens) ? (retry.args.p_itens as { item_id: string }[]).map(i => String(i.item_id)) : [];
  const resale = await probeResaleCapability(rpc, String(retry.osId), itens, retry.expectedOrg);
  fence();
  if (!resale || !itens.every(id => resale.items.get(id)?.deliveryCreate === true)) return { status: "uncertain", retry };
  return replayUncertain(rpc, retry, d => parseGroupAck(d, String(retry.osId), Number(retry.count), retry.expectedOrg), fence, onDispatch);
}

/* ---------------- Reservation (no server idempotency key in the writer) ---------------- */
export type ReserveAttempt = { key: string; actor: string; org: string; osId: string; stockId: string; qty: number; partnerId: string; partnerOrderId: string; baselineReservedForOs: number };
export type ReserveOutcome =
  | { status: "closed"; message: string }
  | { status: "confirmed"; reservedId: string | null; reconciled: boolean }
  | { status: "rejected"; code: string; message: string }
  | { status: "uncertain"; attempt: ReserveAttempt }
  | { status: "stale" };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const RES_PREFIX = "cf:resale-reserve-uncertain:v1:";
export const reserveSlot = (actor: string, org: string, osId: string) => `${RES_PREFIX}${actor}:${org}:${osId}`;

export function loadReserveAttempt(store: Store, actor: string, org: string, osId: string): ReserveAttempt | "corrupt" | null {
  const raw = store.getItem(reserveSlot(actor, org, osId));
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw);
    if (!isObj(v) || v.actor !== actor || v.org !== org || v.osId !== osId || typeof v.key !== "string" || typeof v.qty !== "number" || typeof v.baselineReservedForOs !== "number") return "corrupt";
    return v as ReserveAttempt;
  } catch { return "corrupt"; }
}

/**
 * One dispatch. The attempt (with the server-read baseline) is persisted and verified BEFORE the writer call.
 * A retained attempt for the same actor/tenant/OS blocks any new reservation until reconciled.
 */
export async function runResaleReservation(rpc: Rpc, store: Store, a: Omit<ReserveAttempt, "baselineReservedForOs">, fence: () => void, onDispatch: () => void = () => {}): Promise<ReserveOutcome> {
  if (![a.actor, a.org, a.osId, a.stockId, a.partnerId, a.partnerOrderId].every(x => UUID.test(x)) || !Number.isInteger(a.qty) || a.qty <= 0 || a.key.length < 8) throw new Error("Reserva inválida: somente embalagens inteiras. Nenhuma alteração foi enviada.");
  const prev = loadReserveAttempt(store, a.actor, a.org, a.osId);
  if (prev !== null) throw new Error(prev === "corrupt" ? "Registro local de reserva inválido. Nenhuma alteração foi enviada; consulte o estoque." : "Há uma reserva com resultado incerto para esta OS. Reconcilie antes de reservar novamente. Nenhuma alteração foi enviada.");
  const cap = await probeResaleCapability(rpc, a.osId, [a.stockId], a.org);
  fence();
  const item = cap?.items.get(a.stockId);
  if (!cap || !item?.reserve) return { status: "closed", message: DELIVERY_OPERATION_BLOCK };
  const attempt: ReserveAttempt = { ...a, baselineReservedForOs: item.reservedForOs };
  const raw = JSON.stringify(attempt), slot = reserveSlot(a.actor, a.org, a.osId);
  store.setItem(slot, raw);
  if (store.getItem(slot) !== raw) throw new Error("Não foi possível registrar a recuperação local. Nenhuma alteração foi enviada.");
  fence(); onDispatch();
  let out: ReserveOutcome;
  try {
    const { data, error } = await rpc(RESERVE_RPC, { p_item_id: a.stockId, p_qty: a.qty, p_os_id: a.osId, p_os_tipo: "b2b", p_partner_id: a.partnerId, p_partner_order_id: a.partnerOrderId });
    if (error) out = typeof error.code === "string" && DEFINITIVE_REJECTION_CODES.has(error.code) ? { status: "rejected", code: error.code, message: error.message || "Reserva recusada." } : { status: "uncertain", attempt };
    else out = typeof data === "string" && UUID.test(data) ? { status: "confirmed", reservedId: data, reconciled: false } : { status: "uncertain", attempt };
  } catch { out = { status: "uncertain", attempt }; }
  try { fence(); } catch { return { status: "stale" }; }
  if (out.status === "confirmed" || out.status === "rejected") { if (store.getItem(slot) === raw) store.removeItem(slot); }
  return out;
}

/**
 * Read-only reconciliation by the SAME attempt: adopts only when the server shows exactly the requested
 * delta on this OS. Delta 0 (may still be in flight), other deltas or a closed capability keep the attempt
 * retained. Never dispatches the writer.
 */
export async function reconcileResaleReservation(rpc: Rpc, store: Store, attempt: ReserveAttempt, fence: () => void): Promise<ReserveOutcome> {
  const cap = await probeResaleCapability(rpc, attempt.osId, [attempt.stockId], attempt.org);
  fence();
  const item = cap?.items.get(attempt.stockId);
  if (!cap || !item) return { status: "uncertain", attempt };
  const delta = item.reservedForOs - attempt.baselineReservedForOs;
  if (Math.abs(delta - attempt.qty) < 1e-9) {
    const slot = reserveSlot(attempt.actor, attempt.org, attempt.osId);
    if (store.getItem(slot) === JSON.stringify(attempt)) store.removeItem(slot);
    return { status: "confirmed", reservedId: null, reconciled: true };
  }
  return { status: "uncertain", attempt };
}
