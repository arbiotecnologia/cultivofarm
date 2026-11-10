/**
 * B2B resale (revenda) adapter over the EXISTING atomic writers. Opens only with the exact read-only server
 * capability v2 (actor/tenant/OS/stock/operation, current pilot grant), probed immediately before dispatch.
 * The capability never authorizes: writers re-check everything (incl. post-wait receipt revalidation).
 * Reservation uses ONLY rpc_estoque_reservar_v1 with an immutable idempotency key. An uncertain result is
 * resolved exclusively by an explicit, user-initiated exact replay (same key, same args) whose receipt must
 * match exactly. No automatic retry, no aggregate-balance inference, never a new key while retained.
 */
import { RESALE_CAP_RPC, parseResaleCapability, probeResaleCapability, type ResaleCapability, type ResaleOperation } from "./deliveryOperationsFlow";
export { RESALE_CAP_RPC, parseResaleCapability, probeResaleCapability, type ResaleCapability, type ResaleOperation };
import { DELIVERY_OPERATION_BLOCK } from "./operationalContainment";
import { DEFINITIVE_REJECTION_CODES, GROUP_RPC, parseGroupAck, replayUncertain, runAtomicGroup, type GroupAck, type GroupInput, type Outcome, type RetrySnapshot, type Rpc } from "./deliveryOperationsFlow";

/** Batch writer with server idempotency key and receipt replay (never the legacy rpc_reservar_embalagem_entrega). */
export const RESERVE_RPC = "rpc_estoque_reservar_v1";
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keysExact = (v: Record<string, unknown>, k: string[]) => { const a = Object.keys(v).sort(); return a.length === k.length && [...k].sort().every((x, i) => x === a[i]); };

/** Group creation for B2B resale (runAtomicGroup branches on osOrigem "b2b" and probes delivery_create). */
export const runAtomicResaleGroup = (rpc: Rpc, input: Omit<GroupInput, "resale">, fence: () => void, onDispatch: (r: RetrySnapshot) => void = () => {}) =>
  runAtomicGroup(rpc, { ...input, osOrigem: "b2b" }, fence, onDispatch);

/** Exact replay (same request key/args) of an uncertain B2B group; requires the resale capability to still be open. */
export async function replayResaleGroup(rpc: Rpc, retry: RetrySnapshot, fence: () => void, onDispatch: (r: RetrySnapshot) => void = () => {}): Promise<Outcome<GroupAck>> {
  const itens = Array.isArray(retry.args.p_itens) ? (retry.args.p_itens as { item_id: string }[]).map(i => String(i.item_id)) : [];
  const resale = await probeResaleCapability(rpc, String(retry.osId), itens, retry.expectedOrg, "delivery_create");
  fence();
  if (!resale) return { status: "uncertain", retry };
  return replayUncertain(rpc, retry, d => parseGroupAck(d, String(retry.osId), Number(retry.count), retry.expectedOrg), fence, onDispatch);
}

/* ---------------- Reservation ---------------- */
export type ReserveAttempt = { key: string; actor: string; org: string; osId: string; stockId: string; qty: number; partnerId: string; partnerOrderId: string };
export type ReserveOutcome =
  | { status: "closed"; message: string }
  | { status: "confirmed"; reservedId: string; replay: boolean }
  | { status: "rejected"; code: string; message: string }
  | { status: "uncertain"; attempt: ReserveAttempt; replayRejected?: string }
  | { status: "stale" };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const RES_PREFIX = "cf:resale-reserve-uncertain:v2:";
export const reserveSlot = (actor: string, org: string, osId: string) => `${RES_PREFIX}${actor}:${org}:${osId}`;

export function loadReserveAttempt(store: Store, actor: string, org: string, osId: string): ReserveAttempt | "corrupt" | null {
  const raw = store.getItem(reserveSlot(actor, org, osId));
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw);
    if (!isObj(v) || !keysExact(v, ["key", "actor", "org", "osId", "stockId", "qty", "partnerId", "partnerOrderId"]) || v.actor !== actor || v.org !== org || v.osId !== osId || typeof v.key !== "string" || typeof v.qty !== "number") return "corrupt";
    return v as ReserveAttempt;
  } catch { return "corrupt"; }
}

const reserveArgs = (a: ReserveAttempt) => ({ p_os_id: a.osId, p_origem: "b2b", p_itens: [{ item_id: a.stockId, quantidade: a.qty }], p_idempotency_key: a.key, p_dados: { partner_id: a.partnerId, partner_order_id: a.partnerOrderId } });

/** Exact receipt: {ok:true, replay:boolean, itens:[uuid]} (split target id), nothing else. */
export function parseReserveAck(data: unknown): { id: string; replay: boolean } | null {
  if (!isObj(data) || !keysExact(data, ["ok", "replay", "itens"]) || data.ok !== true || typeof data.replay !== "boolean" || !Array.isArray(data.itens) || data.itens.length !== 1) return null;
  const id = data.itens[0];
  return typeof id === "string" && UUID.test(id) ? { id, replay: data.replay } : null;
}

async function dispatchReserve(rpc: Rpc, attempt: ReserveAttempt): Promise<ReserveOutcome> {
  try {
    const { data, error } = await rpc(RESERVE_RPC, reserveArgs(attempt));
    if (error) return typeof error.code === "string" && DEFINITIVE_REJECTION_CODES.has(error.code) ? { status: "rejected", code: error.code, message: error.message || "Reserva recusada." } : { status: "uncertain", attempt };
    const ack = parseReserveAck(data);
    return ack ? { status: "confirmed", reservedId: ack.id, replay: ack.replay } : { status: "uncertain", attempt };
  } catch { return { status: "uncertain", attempt }; }
}

const clearExact = (store: Store, a: ReserveAttempt) => { const slot = reserveSlot(a.actor, a.org, a.osId); if (store.getItem(slot) === JSON.stringify(a)) store.removeItem(slot); };

/** One dispatch after a fresh exact reserve capability; the attempt is persisted and verified BEFORE the writer call. */
export async function runResaleReservation(rpc: Rpc, store: Store, a: ReserveAttempt, fence: () => void, onDispatch: () => void = () => {}): Promise<ReserveOutcome> {
  if (![a.actor, a.org, a.osId, a.stockId, a.partnerId, a.partnerOrderId].every(x => UUID.test(x)) || !Number.isInteger(a.qty) || a.qty <= 0 || a.key.length < 8 || a.key.length > 200) throw new Error("Reserva inválida: somente embalagens inteiras. Nenhuma alteração foi enviada.");
  const prev = loadReserveAttempt(store, a.actor, a.org, a.osId);
  if (prev !== null) throw new Error(prev === "corrupt" ? "Registro local de reserva inválido. Nenhuma alteração foi enviada; consulte o estoque." : "Há uma reserva com resultado incerto para esta OS. Use “Consultar mesma reserva” antes de reservar novamente. Nenhuma alteração foi enviada.");
  const cap = await probeResaleCapability(rpc, a.osId, [a.stockId], a.org, "reserve");
  fence();
  if (!cap) return { status: "closed", message: DELIVERY_OPERATION_BLOCK };
  const raw = JSON.stringify(a), slot = reserveSlot(a.actor, a.org, a.osId);
  store.setItem(slot, raw);
  if (store.getItem(slot) !== raw) throw new Error("Não foi possível registrar a recuperação local. Nenhuma alteração foi enviada.");
  fence(); onDispatch();
  const out = await dispatchReserve(rpc, a);
  try { fence(); } catch { return { status: "stale" }; }
  if (out.status === "confirmed" || out.status === "rejected") clearExact(store, a);
  return out;
}

/**
 * Explicit exact replay of a retained attempt (same immutable key and args). The server revalidates authority
 * after its wait before returning the receipt. A refused replay does NOT prove the original failed: the attempt
 * stays retained and no new key is ever allowed until an exact receipt is obtained.
 */
export async function replayResaleReservation(rpc: Rpc, store: Store, attempt: ReserveAttempt, fence: () => void, onDispatch: () => void = () => {}): Promise<ReserveOutcome> {
  fence(); onDispatch();
  const out = await dispatchReserve(rpc, attempt);
  try { fence(); } catch { return { status: "stale" }; }
  if (out.status === "confirmed") { clearExact(store, attempt); return out; }
  return { status: "uncertain", attempt, replayRejected: out.status === "rejected" ? out.code : undefined };
}
