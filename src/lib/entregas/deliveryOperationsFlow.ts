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

/** Fields the atomic contract persists. Anything else non-empty is rejected before dispatch (never silently dropped). */
const DATA_KEYS = ["data_saida", "motorista", "veiculo", "tipo_entrega", "endereco_origem"] as const;

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
  itens: { itemId: string; quantidade: number; observedUpdatedAt: string; status: string }[];
  dados: Record<string, unknown>;
};

export function buildGroupArgs(input: GroupInput): Record<string, unknown> {
  if (input.osTipo !== "padrao" || input.osOrigem !== "agronomica" || input.osPartnerOrderId !== null) {
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
    if (i.status !== "disponivel") throw new Error("Lote já reservado ou indisponível: o contrato atômico reserva apenas estoque disponível. Nenhuma alteração foi enviada.");
    seen.add(i.itemId);
  }
  const unsupported = Object.entries(input.dados).filter(([k, v]) => !(DATA_KEYS as readonly string[]).includes(k) && v !== null && v !== undefined && v !== "").map(([k]) => k);
  if (unsupported.length) throw new Error(`Campos ainda não gravados pelo contrato atômico (inclui destinatário/endereço detalhado): ${unsupported.sort().join(", ")}. Limpe-os ou aguarde o contrato; nada é descartado em silêncio. Nenhuma alteração foi enviada.`);
  const dados: Record<string, string | null> = {};
  for (const k of DATA_KEYS) {
    const v = input.dados[k];
    if (v === undefined) continue;
    if (v !== null && typeof v !== "string") throw new Error("Dados da entrega inválidos. Nenhuma alteração foi enviada.");
    dados[k] = v === "" ? null : (v as string | null);
  }
  return {
    p_os_id: input.osId,
    p_origem: "manual",
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

export type RetrySnapshot = { fn: string; args: Record<string, unknown>; expectedOrg: string; osId?: string; count?: number; entregaId?: string };

export type Outcome<T> =
  | { status: "closed"; message: string }
  | { status: "confirmed"; ack: T }
  /** Allowlisted server refusal of the single RPC transaction. */
  | { status: "rejected"; message: string; code: string }
  /** Transport failure, non-allowlisted error or non-exact ACK: may have committed; only an exact replay is allowed. */
  | { status: "uncertain"; retry: RetrySnapshot }
  /** Session/tenant changed while waiting: result is discarded for this scope (no confirmation, no rejection, no retry). */
  | { status: "stale" };

const freeze = (r: RetrySnapshot): RetrySnapshot => Object.freeze({ ...r, args: JSON.parse(JSON.stringify(r.args)) });

async function dispatchOnce<T>(rpc: Rpc, retry: RetrySnapshot, parse: (d: unknown) => T | null, fence: () => void, onDispatch: () => void): Promise<Outcome<T>> {
  fence();
  onDispatch();
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
export async function runAtomicGroup(rpc: Rpc, input: GroupInput, fence: () => void, onDispatch: () => void = () => {}): Promise<Outcome<GroupAck>> {
  const args = buildGroupArgs(input);
  const cap = await probeDeliveryCapability(rpc);
  fence();
  if (!cap.group) return { status: "closed", message: DELIVERY_OPERATION_BLOCK };
  const retry = freeze({ fn: GROUP_RPC, args, expectedOrg: input.expectedOrg, osId: input.osId, count: input.itens.length });
  return dispatchOnce(rpc, retry, d => parseGroupAck(d, input.osId, input.itens.length, input.expectedOrg), fence, onDispatch);
}

export async function runAtomicCancel(rpc: Rpc, entregaId: string, motivo: string, observedUpdatedAt: string, expectedOrg: string, fence: () => void, onDispatch: () => void = () => {}): Promise<Outcome<{ replay: boolean }>> {
  if (!UUID.test(entregaId) || !UUID.test(expectedOrg) || !motivo.trim() || !observedUpdatedAt) throw new Error("Cancelamento inválido: informe o motivo. Nenhuma alteração foi enviada.");
  const cap = await probeDeliveryCapability(rpc);
  fence();
  if (!cap.cancel) return { status: "closed", message: DELIVERY_CANCELLATION_BLOCK };
  const retry = freeze({ fn: CANCEL_RPC, args: { p_entrega_id: entregaId, p_motivo: motivo, p_observed: observedUpdatedAt }, expectedOrg, entregaId });
  return dispatchOnce(rpc, retry, d => parseCancelAck(d, entregaId, expectedOrg), fence, onDispatch);
}

/** Exact replay of an uncertain dispatch: same function, identical frozen args (same key, same observed CAS). */
export async function replayUncertain<T>(rpc: Rpc, retry: RetrySnapshot, parse: (d: unknown) => T | null, fence: () => void, onDispatch: () => void = () => {}): Promise<Outcome<T>> {
  const cap = await probeDeliveryCapability(rpc);
  fence();
  if (!(retry.fn === GROUP_RPC ? cap.group : retry.fn === CANCEL_RPC ? cap.cancel : false)) return { status: "uncertain", retry };
  return dispatchOnce(rpc, retry, parse, fence, onDispatch);
}

/* ---- Pending uncertain dispatch, bound to actor+tenant, survives remount/reload. ---- */
const PENDING_PREFIX = "cf:delivery-uncertain:v1:";
export const pendingKey = (actorId: string, orgId: string) => `${PENDING_PREFIX}${actorId}:${orgId}`;

export function loadPending(store: Pick<Storage, "getItem">, actorId: string, orgId: string): RetrySnapshot | "corrupt" | null {
  const raw = store.getItem(pendingKey(actorId, orgId));
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw);
    if (!isObj(v) || (v.fn !== GROUP_RPC && v.fn !== CANCEL_RPC) || !isObj(v.args) || v.expectedOrg !== orgId) return "corrupt";
    return freeze(v as RetrySnapshot);
  } catch {
    return "corrupt";
  }
}

/** Must succeed before dispatch; a storage failure keeps the operation closed. */
export function savePending(store: Pick<Storage, "setItem" | "getItem">, actorId: string, orgId: string, r: RetrySnapshot) {
  const key = pendingKey(actorId, orgId);
  const raw = JSON.stringify(r);
  store.setItem(key, raw);
  if (store.getItem(key) !== raw) throw new Error("Não foi possível reservar a recuperação local. Nenhuma alteração foi enviada.");
}

export function clearPending(store: Pick<Storage, "removeItem">, actorId: string, orgId: string) {
  store.removeItem(pendingKey(actorId, orgId));
}
