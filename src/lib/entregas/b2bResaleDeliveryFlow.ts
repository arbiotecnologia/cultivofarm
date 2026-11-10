/**
 * B2B resale (revenda) adapter over the EXISTING atomic writers. Opens only with the exact read-only server
 * capability `rpc_b2b_resale_delivery_capability_v1` (actor/tenant/OS/stock, current pilot grant), probed
 * immediately before dispatch; any error, absence or envelope drift keeps it closed. The capability never
 * authorizes: writers re-check everything. Uncertain reservation is reconciled read-only by the same attempt
 * key: exact server replay (same idempotency key) or read-only delta; never a new key/second reservation.
 */
import { DELIVERY_OPERATION_BLOCK } from "./operationalContainment";
import { RESALE_CAP_RPC, parseResaleCapability, probeResaleCapability, type ResaleCapability, type ResaleItemCap } from "./deliveryOperationsFlow";
export { RESALE_CAP_RPC, parseResaleCapability, probeResaleCapability, type ResaleCapability, type ResaleItemCap };
import { DEFINITIVE_REJECTION_CODES, GROUP_RPC, parseGroupAck, replayUncertain, runAtomicGroup, type GroupAck, type GroupInput, type Outcome, type RetrySnapshot, type Rpc } from "./deliveryOperationsFlow";

/** Batch writer with server idempotency key and receipt replay (never the legacy rpc_reservar_embalagem_entrega). */
export const RESERVE_RPC = "rpc_estoque_reservar_v1";
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keysExact = (v: Record<string, unknown>, k: string[]) => { const a = Object.keys(v).sort(); return a.length === k.length && [...k].sort().every((x, i) => x === a[i]); };

/** Group creation for B2B resale (delegates to runAtomicGroup, which branches on osOrigem "b2b"). */
export const runAtomicResaleGroup = (rpc: Rpc, input: Omit<GroupInput, "resale">, fence: () => void, onDispatch: (r: RetrySnapshot) => void = () => {}) => runAtomicGroup(rpc, { ...input, osOrigem: "b2b" }, fence, onDispatch);

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
    out = await dispatchReserve(rpc, attempt);
  } catch { out = { status: "uncertain", attempt }; }
  try { fence(); } catch { return { status: "stale" }; }
  if (out.status === "confirmed" || out.status === "rejected") { if (store.getItem(slot) === raw) store.removeItem(slot); }
  return out;
}


const reserveArgs = (a: ReserveAttempt) => ({ p_os_id: a.osId, p_origem: "b2b", p_itens: [{ item_id: a.stockId, quantidade: a.qty }], p_idempotency_key: a.key, p_dados: { partner_id: a.partnerId, partner_order_id: a.partnerOrderId } });
/** Exact receipt: {ok:true, replay:boolean, itens:[uuid]} (split target id), nothing else. */
export function parseReserveAck(data: unknown): string | null {
  if (!isObj(data) || !keysExact(data, ["ok", "replay", "itens"]) || data.ok !== true || typeof data.replay !== "boolean" || !Array.isArray(data.itens) || data.itens.length !== 1) return null;
  const id = data.itens[0];
  return typeof id === "string" && UUID.test(id) ? id : null;
}
async function dispatchReserve(rpc: Rpc, attempt: ReserveAttempt): Promise<ReserveOutcome> {
  const { data, error } = await rpc(RESERVE_RPC, reserveArgs(attempt));
  if (error) return typeof error.code === "string" && DEFINITIVE_REJECTION_CODES.has(error.code) ? { status: "rejected", code: error.code, message: error.message || "Reserva recusada." } : { status: "uncertain", attempt };
  const id = parseReserveAck(data);
  return id ? { status: "confirmed", reservedId: id, reconciled: false } : { status: "uncertain", attempt };
}

/**
 * Exact replay of an uncertain reservation with the SAME idempotency key and args. The server re-authorizes
 * actor/tenant/references/current grant after its wait before returning a receipt. A refusal of the replay
 * does not prove the original did not commit: the attempt stays retained (no clear, no new key).
 */
export async function replayResaleReservation(rpc: Rpc, store: Store, attempt: ReserveAttempt, fence: () => void): Promise<ReserveOutcome> {
  fence();
  let out: ReserveOutcome;
  try { out = await dispatchReserve(rpc, attempt); } catch { out = { status: "uncertain", attempt }; }
  try { fence(); } catch { return { status: "stale" }; }
  if (out.status === "confirmed") { const slot = reserveSlot(attempt.actor, attempt.org, attempt.osId); if (store.getItem(slot) === JSON.stringify(attempt)) store.removeItem(slot); return out; }
  return { status: "uncertain", attempt };
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
