/**
 * Adapter for the installed atomic delivery contract (group creation and observed cancel).
 * Runtime opening requires an exact server capability envelope probed immediately before dispatch;
 * absence of the capability RPC, any error or any extra/missing key keeps the operation closed.
 * The capability is a release gate only: the server RPC still re-authorizes everything.
 */
import { DELIVERY_CANCELLATION_BLOCK, DELIVERY_OPERATION_BLOCK } from "./operationalContainment";

export type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
export type DeliveryCapability = { group: boolean; cancel: boolean };
export const CAPABILITY_RPC = "rpc_entrega_operacoes_capability_v1";
export const GROUP_RPC = "rpc_cockpit_criar_entrega_v1";
export const CANCEL_RPC = "rpc_entrega_cancelar_v1";
export const RESALE_CAP_RPC = "rpc_b2b_resale_delivery_capability_v1";
export const CLOSED: DeliveryCapability = Object.freeze({ group: false, cancel: false });

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exactKeys = (v: Record<string, unknown>, keys: string[]) => {
  const k = Object.keys(v).sort();
  return k.length === keys.length && [...keys].sort().every((x, i) => x === k[i]);
};

export function parseCapability(data: unknown): DeliveryCapability {
  if (!isObj(data) || !exactKeys(data, ["capability", "group", "cancel"])) return CLOSED;
  if (data.capability !== "delivery_operations_v1" || typeof data.group !== "boolean" || typeof data.cancel !== "boolean") return CLOSED;
  return { group: data.group, cancel: data.cancel };
}

export async function probeDeliveryCapability(rpc: Rpc): Promise<DeliveryCapability> {
  try {
    const { data, error } = await rpc(CAPABILITY_RPC);
    return error ? CLOSED : parseCapability(data);
  } catch {
    return CLOSED;
  }
}

/* ---- B2B resale capability (read-only, exact envelope, fail closed) ---- */
export type ResaleItemCap = { reserve: boolean; deliveryCreate: boolean; reservedForOs: number };
export type ResaleCapability = { osId: string; organizationId: string; items: ReadonlyMap<string, ResaleItemCap> };

/** Exact envelope for exactly the requested stock ids, echoing the session tenant; anything else => null (closed). */
export function parseResaleCapability(data: unknown, osId: string, stockIds: string[], expectedOrg: string): ResaleCapability | null {
  if (!isObj(data) || !exactKeys(data, ["capability", "organization_id", "os_id", "items"])) return null;
  if (data.capability !== "b2b_resale_delivery_v1" || data.os_id !== osId || !UUID.test(expectedOrg) || data.organization_id !== expectedOrg || !Array.isArray(data.items)) return null;
  const want = new Set(stockIds);
  if (want.size !== stockIds.length || data.items.length !== want.size) return null;
  const items = new Map<string, ResaleItemCap>();
  for (const x of data.items) {
    if (!isObj(x) || !exactKeys(x, ["stock_id", "reserve", "delivery_create", "reserved_for_os"])) return null;
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


/** Fields the atomic contract persists. Anything else non-empty is rejected before dispatch (never silently dropped). */
export const DATA_KEYS = [
  "data_saida", "motorista", "veiculo", "tipo_entrega", "endereco_origem",
  "motorista_telefone", "motorista_documento", "veiculo_placa", "veiculo_tipo",
  "hora_saida_prevista", "data_chegada_prevista", "hora_chegada_prevista",
  "destinatario_nome", "destinatario_telefone", "destinatario_whatsapp",
  "endereco_logradouro", "endereco_numero", "endereco_complemento", "endereco_bairro",
  "endereco_cidade", "endereco_uf", "endereco_cep", "endereco_referencia",
] as const;
const DATE_KEYS = new Set(["data_saida", "data_chegada_prevista"]);
const TIME_KEYS = new Set(["hora_saida_prevista", "hora_chegada_prevista"]);
const validDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
/** Mirrors the server allowlist/validation (server remains authoritative). */
function metadataError(k: string, v: string): boolean {
  if (v.length > 300 || /[\u0000-\u001f\u007f]/.test(v) || v.trim() === "") return true;
  if (DATE_KEYS.has(k)) return !validDate(v);
  if (TIME_KEYS.has(k)) return !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v);
  if (k === "tipo_entrega") return v !== "motorista" && v !== "retirada";
  if (k === "endereco_origem") return v !== "cadastro" && v !== "personalizado";
  return false;
}

export type GroupInput = {
  requestKey: string;
  /** Tenant captured with the session; the ACK must echo exactly this organization. */
  expectedOrg: string;
  osId: string;
  osTipo: string;
  /** Snapshot observed at selection time (never re-read at submit). */
  osOrigem: string | null;
  osPartnerOrderId: string | null;
  osObservedUpdatedAt: string;
  /** Reserved rows are accepted only when wholly reserved for this same OS (server re-proves ownership). */
  itens: { itemId: string; quantidade: number; observedUpdatedAt: string; status: string; reservadoParaOsId?: string | null; quantidadeReservada?: number | null; quantidadeTotal?: number | null }[];
  dados: Record<string, unknown>;
  /** Parsed exact B2B resale capability (see b2bResaleDeliveryFlow); absent => B2B stays closed. */
  resale?: { osId: string; organizationId: string; items: ReadonlyMap<string, { reserve: boolean; deliveryCreate: boolean; reservedForOs: number }> };
};

export function buildGroupArgs(input: GroupInput): Record<string, unknown> {
  // B2B revenda abre SOMENTE com o envelope exato da capability de revenda (ator/empresa/OS/itens, concessão vigente).
  const resale = input.resale;
  const resaleOk = !!resale && input.osOrigem === "b2b" && input.osPartnerOrderId !== null && UUID.test(input.osPartnerOrderId)
    && resale.osId === input.osId && resale.organizationId === input.expectedOrg
    && input.itens.length > 0 && input.itens.every(i => resale.items.get(i.itemId)?.deliveryCreate === true);
  if (!resaleOk && (input.osTipo !== "padrao" || input.osOrigem !== "agronomica" || input.osPartnerOrderId !== null)) {
    throw new Error("Somente OS agronômica manual, sem pedido B2B, usa este contrato. OnFarm e B2B permanecem indisponíveis. Nenhuma alteração foi enviada.");
  }
  if (!UUID.test(input.osId) || !UUID.test(input.expectedOrg) || typeof input.requestKey !== "string" || input.requestKey.length < 8 || input.requestKey.length > 128 || !input.osObservedUpdatedAt) {
    throw new Error("Identificação da entrega inválida. Nenhuma alteração foi enviada.");
  }
  if (input.itens.length === 0 || input.itens.length > 100) throw new Error("Selecione de 1 a 100 itens. Nenhuma alteração foi enviada.");
  const seen = new Set<string>();
  for (const i of input.itens) {
    if (!UUID.test(i.itemId) || seen.has(i.itemId) || !Number.isFinite(i.quantidade) || i.quantidade <= 0 || !i.observedUpdatedAt) {
      throw new Error("Item ou quantidade inválidos. Nenhuma alteração foi enviada.");
    }
    const ownedReservation = i.status === "reservado" && i.reservadoParaOsId === input.osId
      && i.quantidadeReservada === i.quantidadeTotal && i.quantidadeTotal === i.quantidade;
    if (i.status !== "disponivel" && !ownedReservation) {
      throw new Error(i.status === "reservado"
        ? "Lote reservado para outra OS ou reserva parcial: só a reserva inteira desta OS pode ser entregue. Nenhuma alteração foi enviada."
        : "Lote indisponível para entrega. Nenhuma alteração foi enviada.");
    }
    seen.add(i.itemId);
  }
  const unsupported = Object.entries(input.dados).filter(([k, v]) => !(DATA_KEYS as readonly string[]).includes(k) && v !== null && v !== undefined && v !== "").map(([k]) => k);
  if (unsupported.length) throw new Error(`Campos não aceitos pelo contrato de entrega: ${unsupported.sort().join(", ")}. Nada é descartado em silêncio. Nenhuma alteração foi enviada.`);
  const dados: Record<string, string | null> = {};
  const invalid: string[] = [];
  for (const k of DATA_KEYS) {
    const v = input.dados[k];
    if (v === undefined) continue;
    if (v !== null && typeof v !== "string") { invalid.push(k); continue; }
    const value: string | null = v === null || (v as string).trim() === "" ? null : (v as string);
    if (value !== null && metadataError(k, value)) { invalid.push(k); continue; }
    dados[k] = value;
  }
  if (invalid.length) throw new Error(`Dados da entrega inválidos: ${invalid.join(", ")}. Corrija data (AAAA-MM-DD), horário (HH:MM) ou texto. Nenhuma alteração foi enviada.`);
  return {
    p_os_id: input.osId,
    p_origem: resaleOk ? "b2b" : "manual",
    p_itens: input.itens.map(i => ({ item_id: i.itemId, quantidade: i.quantidade, observed_updated_at: i.observedUpdatedAt })),
    p_request_key: input.requestKey,
    p_dados: dados,
    p_os_observed: input.osObservedUpdatedAt,
  };
}

export type GroupAck = { replay: boolean; osId: string; itens: { entregaId: string; estoqueProdutoId: string; movimentacaoId: string }[] };

export function parseGroupAck(data: unknown, osId: string, count: number, expectedOrg: string): GroupAck | null {
  if (!isObj(data) || data.success !== true || typeof data.replay !== "boolean" || data.os_id !== osId || !UUID.test(expectedOrg) || data.organization_id !== expectedOrg) return null;
  if (!exactKeys(data, ["success", "replay", "organization_id", "os_id", "itens"]) || !Array.isArray(data.itens) || data.itens.length !== count) return null;
  const itens: GroupAck["itens"] = [];
  const ids = new Set<string>();
  for (const x of data.itens) {
    if (!isObj(x) || !exactKeys(x, ["entrega_id", "estoque_produto_id", "movimentacao_id"])) return null;
    const [e, s, m] = [x.entrega_id, x.estoque_produto_id, x.movimentacao_id].map(String);
    if (![e, s, m].every(v => UUID.test(v)) || ids.has(e)) return null;
    ids.add(e);
    itens.push({ entregaId: e, estoqueProdutoId: s, movimentacaoId: m });
  }
  return { replay: data.replay, osId, itens };
}

export function parseCancelAck(data: unknown, entregaId: string, expectedOrg: string): { replay: boolean } | null {
  if (!isObj(data) || !exactKeys(data, ["success", "replay", "organization_id", "entrega_id", "estoque_estornado", "reserva_liberada"])) return null;
  if (data.success !== true || typeof data.replay !== "boolean" || data.entrega_id !== entregaId || data.estoque_estornado !== true || data.reserva_liberada !== true) return null;
  if (!UUID.test(expectedOrg) || data.organization_id !== expectedOrg) return null;
  return { replay: data.replay };
}

/**
 * Only SQLSTATEs explicitly raised by the reviewed writers as business/authorization/validation refusals
 * count as definitive. Timeouts, transport, proxy, PostgREST connection and any other code stay uncertain.
 */
export const DEFINITIVE_REJECTION_CODES: ReadonlySet<string> = new Set(["PT409", "42501", "22023"]);

export type RetrySnapshot = { fn: string; args: Record<string, unknown>; expectedOrg: string; osId?: string; count?: number; entregaId?: string; /** set when the exact replay was refused: original outcome still unknown */ replayRejected?: string };

export type Outcome<T> =
  | { status: "closed"; message: string }
  | { status: "confirmed"; ack: T }
  /** Allowlisted server refusal of the single RPC transaction. */
  | { status: "rejected"; message: string; code: string }
  /** Transport failure, non-allowlisted error or non-exact ACK: may have committed; only an exact replay is allowed. */
  | { status: "uncertain"; retry: RetrySnapshot }
  /** Session/tenant changed while waiting: result is discarded for this scope (no confirmation, no rejection, no retry). */
  | { status: "stale" };

export const freeze = (r: RetrySnapshot): RetrySnapshot => Object.freeze({ ...r, args: JSON.parse(JSON.stringify(r.args)) });

export async function dispatchOnce<T>(rpc: Rpc, retry: RetrySnapshot, parse: (d: unknown) => T | null, fence: () => void, onDispatch: (r: RetrySnapshot) => void): Promise<Outcome<T>> {
  fence();
  onDispatch(retry);
  fence();
  let outcome: Outcome<T>;
  try {
    const { data, error } = await rpc(retry.fn, retry.args);
    if (error) {
      outcome = typeof error.code === "string" && DEFINITIVE_REJECTION_CODES.has(error.code)
        ? { status: "rejected", message: error.message || "Operação recusada pelo servidor.", code: error.code }
        : { status: "uncertain", retry };
    } else {
      const ack = parse(data);
      outcome = ack ? { status: "confirmed", ack } : { status: "uncertain", retry };
    }
  } catch {
    outcome = { status: "uncertain", retry };
  }
  try { fence(); } catch { return { status: "stale" }; }
  return outcome;
}

export function parserFor(retry: RetrySnapshot): (d: unknown) => unknown {
  if (retry.fn === GROUP_RPC) return d => parseGroupAck(d, String(retry.osId), Number(retry.count), retry.expectedOrg);
  if (retry.fn === CANCEL_RPC) return d => parseCancelAck(d, String(retry.entregaId), retry.expectedOrg);
  return () => null;
}

/** Fresh capability probe, then one dispatch. `fence` must throw if scope/session changed. */
export async function runAtomicGroup(rpc: Rpc, input: GroupInput, fence: () => void, onDispatch: (r: RetrySnapshot) => void = () => {}): Promise<Outcome<GroupAck>> {
  if (input.osOrigem === "b2b") {
    // B2B resale: generic group capability AND the exact resale capability for this OS/items, probed now.
    const ids = input.itens.map(i => i.itemId);
    const [cap, resale] = await Promise.all([probeDeliveryCapability(rpc), probeResaleCapability(rpc, input.osId, ids, input.expectedOrg)]);
    fence();
    if (!cap.group || !resale || !ids.every(id => resale.items.get(id)?.deliveryCreate === true)) return { status: "closed", message: DELIVERY_OPERATION_BLOCK };
    const retry = freeze({ fn: GROUP_RPC, args: buildGroupArgs({ ...input, resale }), expectedOrg: input.expectedOrg, osId: input.osId, count: ids.length });
    return dispatchOnce(rpc, retry, d => parseGroupAck(d, input.osId, ids.length, input.expectedOrg), fence, onDispatch);
  }
  const args = buildGroupArgs({ ...input, resale: undefined });
  const cap = await probeDeliveryCapability(rpc);
  fence();
  if (!cap.group) return { status: "closed", message: DELIVERY_OPERATION_BLOCK };
  const retry = freeze({ fn: GROUP_RPC, args, expectedOrg: input.expectedOrg, osId: input.osId, count: input.itens.length });
  return dispatchOnce(rpc, retry, d => parseGroupAck(d, input.osId, input.itens.length, input.expectedOrg), fence, onDispatch);
}

export async function runAtomicCancel(rpc: Rpc, entregaId: string, motivo: string, observedUpdatedAt: string, expectedOrg: string, fence: () => void, onDispatch: (r: RetrySnapshot) => void = () => {}): Promise<Outcome<{ replay: boolean }>> {
  if (!UUID.test(entregaId) || !UUID.test(expectedOrg) || !motivo.trim() || !observedUpdatedAt) throw new Error("Cancelamento inválido: informe o motivo. Nenhuma alteração foi enviada.");
  const cap = await probeDeliveryCapability(rpc);
  fence();
  if (!cap.cancel) return { status: "closed", message: DELIVERY_CANCELLATION_BLOCK };
  const retry = freeze({ fn: CANCEL_RPC, args: { p_entrega_id: entregaId, p_motivo: motivo, p_observed: observedUpdatedAt }, expectedOrg, entregaId });
  return dispatchOnce(rpc, retry, d => parseCancelAck(d, entregaId, expectedOrg), fence, onDispatch);
}

/** Exact replay of an uncertain dispatch: same function, identical frozen args (same key, same observed CAS). */
export async function replayUncertain<T>(rpc: Rpc, retry: RetrySnapshot, parse: (d: unknown) => T | null, fence: () => void, onDispatch: (r: RetrySnapshot) => void = () => {}): Promise<Outcome<T>> {
  const cap = await probeDeliveryCapability(rpc);
  fence();
  if (!(retry.fn === GROUP_RPC ? cap.group : retry.fn === CANCEL_RPC ? cap.cancel : false)) return { status: "uncertain", retry };
  return dispatchOnce(rpc, retry, parse, fence, onDispatch);
}

/* ---- Pending uncertain dispatches: one slot PER ATTEMPT (actor+tenant+fn+key), survives remount/reload. ----
 * Several tabs/consumers share localStorage: a save never overwrites a distinct attempt and a clear only
 * removes the exact attempt it settled (compare-before-remove). Local storage is not a lock: two tabs may
 * each hold their own attempt; both are kept and both block new keys until settled. */
const PENDING_PREFIX = "cf:delivery-uncertain:v2:";
const scopePrefix = (actorId: string, orgId: string) => `${PENDING_PREFIX}${actorId}:${orgId}:`;
export const attemptId = (r: Pick<RetrySnapshot, "fn" | "args">) =>
  r.fn === GROUP_RPC ? `${r.fn}:${String(r.args.p_request_key)}` : `${r.fn}:${String(r.args.p_entrega_id)}:${String(r.args.p_observed)}`;
export const pendingKey = (actorId: string, orgId: string, r: Pick<RetrySnapshot, "fn" | "args">) => `${scopePrefix(actorId, orgId)}${attemptId(r)}`;
type PendingStore = Pick<Storage, "getItem" | "key" | "length">;

const parseSlot = (raw: string, orgId: string, slot: string, actorId: string): RetrySnapshot | "corrupt" => {
  try {
    const v = JSON.parse(raw);
    if (!isObj(v) || (v.fn !== GROUP_RPC && v.fn !== CANCEL_RPC) || !isObj(v.args) || v.expectedOrg !== orgId) return "corrupt";
    if (pendingKey(actorId, orgId, v as RetrySnapshot) !== slot) return "corrupt";
    return freeze(v as RetrySnapshot);
  } catch { return "corrupt"; }
};

/** All attempts of this actor+tenant, in stable key order; any unreadable slot is reported as corrupt (fail closed). */
export function loadAllPending(store: PendingStore, actorId: string, orgId: string): (RetrySnapshot | "corrupt")[] {
  const prefix = scopePrefix(actorId, orgId);
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && k.startsWith(prefix)) keys.push(k); }
  return keys.sort().map(k => { const raw = store.getItem(k); return raw === null ? "corrupt" : parseSlot(raw, orgId, k, actorId); });
}

export function loadPending(store: PendingStore, actorId: string, orgId: string): RetrySnapshot | "corrupt" | null {
  const all = loadAllPending(store, actorId, orgId);
  if (all.includes("corrupt")) return "corrupt";
  return all[0] ?? null;
}

/** Must succeed before dispatch; storage failure or a DISTINCT attempt already in this slot keeps the operation closed. */
export function savePending(store: Pick<Storage, "setItem" | "getItem">, actorId: string, orgId: string, r: RetrySnapshot) {
  const key = pendingKey(actorId, orgId, r);
  const raw = JSON.stringify(r);
  const prev = store.getItem(key);
  if (prev !== null && prev !== raw) throw new Error("Já existe uma tentativa diferente registrada para esta chave. Nenhuma alteração foi enviada.");
  store.setItem(key, raw);
  if (store.getItem(key) !== raw) throw new Error("Não foi possível reservar a recuperação local. Nenhuma alteração foi enviada.");
}

/** Conditional: removes only if the slot still holds exactly this attempt. Returns whether it removed. */
export function clearPending(store: Pick<Storage, "removeItem" | "getItem">, actorId: string, orgId: string, r: RetrySnapshot): boolean {
  const key = pendingKey(actorId, orgId, r);
  const { replayRejected: _ignored, ...base } = r;
  const cur = store.getItem(key);
  if (cur === null) return false;
  try {
    const v = JSON.parse(cur);
    const { replayRejected: _x, ...vb } = isObj(v) ? v : {} as Record<string, unknown>;
    if (JSON.stringify(vb) !== JSON.stringify(base)) return false;
  } catch { return false; }
  store.removeItem(key);
  return true;
}

/**
 * A refusal of the REPLAY (e.g. 42501 after revocation, PT409 after a CAS change) does not prove the original
 * uncertain dispatch did not commit. Keep the attempt, mark it as needing authorized reconciliation, never clear
 * it and never allow a new key. No rollback is inferred.
 */
export function markReplayRejected(store: Pick<Storage, "setItem" | "getItem">, actorId: string, orgId: string, r: RetrySnapshot, code: string): RetrySnapshot {
  const key = pendingKey(actorId, orgId, r);
  const cur = store.getItem(key);
  const { replayRejected: _ignored, ...base } = r;
  const marked = freeze({ ...base, replayRejected: code });
  if (cur !== null) {
    try {
      const v = JSON.parse(cur); const { replayRejected: _x, ...vb } = isObj(v) ? v : {} as Record<string, unknown>;
      if (JSON.stringify(vb) !== JSON.stringify(base)) return r; // distinct attempt: never overwrite
    } catch { return r; }
  }
  store.setItem(key, JSON.stringify(marked));
  return marked;
}
