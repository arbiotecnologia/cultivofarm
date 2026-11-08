export type ResaleOsIntent = Readonly<{ orderId: string; itemId: string; observed: string }>;
export type ResaleOsFence = Readonly<{ actor: string; tenant: string; epoch: number; ready: boolean }>;
export type ResaleOsAck = {
  ok: true;
  replay: boolean;
  contract: "B2B_RESALE_OS_V1";
  os_id: string;
  order_id: string;
  order_item_id: string;
};
export type ResaleOsAvailabilityItem = {
  order_item_id: string;
  os_id: string | null;
  create_available: boolean;
};
export type ResaleOsAvailability = {
  contract: "B2B_RESALE_OS_AVAILABILITY_V1";
  order_id: string;
  actor_id: string;
  organization_id: string;
  observed_updated_at: string;
  available: boolean;
  items: ResaleOsAvailabilityItem[];
};
export type ResaleOsRpc = (name: string, args: Record<string, string>) => Promise<{ data: unknown; error: unknown }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export const validResaleOsTimestamp = (value: unknown): value is string =>
  typeof value === "string" && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
export const validResaleOsUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** Strict server envelope; a local boolean or a URL id never creates availability. */
export function decodeResaleOsAvailability(raw: unknown, expected: { orderId: string; actor: string; tenant: string }): ResaleOsAvailability {
  const row = object(raw);
  if (!row || row.contract !== "B2B_RESALE_OS_AVAILABILITY_V1" || row.order_id !== expected.orderId ||
      row.actor_id !== expected.actor || row.organization_id !== expected.tenant ||
      !validResaleOsTimestamp(row.observed_updated_at) || typeof row.available !== "boolean" || !Array.isArray(row.items)) {
    throw new Error("Disponibilidade da OS não confirmada.");
  }
  const seen = new Set<string>();
  const items = row.items.map((value): ResaleOsAvailabilityItem => {
    const item = object(value);
    if (!item || !validResaleOsUuid(item.order_item_id) || seen.has(item.order_item_id) ||
        !(item.os_id === null || validResaleOsUuid(item.os_id)) || typeof item.create_available !== "boolean" ||
        (item.os_id !== null && item.create_available) || (!row.available && item.create_available)) {
      throw new Error("Item da OS não confirmado.");
    }
    seen.add(item.order_item_id);
    return { order_item_id: item.order_item_id, os_id: item.os_id, create_available: item.create_available };
  });
  return {
    contract: "B2B_RESALE_OS_AVAILABILITY_V1", order_id: row.order_id,
    actor_id: row.actor_id, organization_id: row.organization_id,
    observed_updated_at: row.observed_updated_at, available: row.available, items,
  };
}

export function createResaleOsRequest(rpc: ResaleOsRpc, current: () => ResaleOsFence, key: () => string = () => crypto.randomUUID()) {
  let pending = false;
  let retained: { intent: ResaleOsIntent; scope: ResaleOsFence; requestKey: string } | undefined;
  return async (intent: ResaleOsIntent): Promise<ResaleOsAck> => {
    const scope = { ...current() };
    if (pending || !scope.ready || !scope.actor || !scope.tenant) throw new Error("Operação indisponível.");
    if (!validResaleOsUuid(intent.orderId) || !validResaleOsUuid(intent.itemId) || !validResaleOsTimestamp(intent.observed)) {
      throw new Error("Pedido sem versão válida.");
    }
    const sameScope = (a: ResaleOsFence, b: ResaleOsFence) =>
      a.actor === b.actor && a.tenant === b.tenant && a.epoch === b.epoch && b.ready;
    if (retained && (!sameScope(retained.scope, scope) || retained.intent.orderId !== intent.orderId ||
        retained.intent.itemId !== intent.itemId || retained.intent.observed !== intent.observed)) {
      throw new Error("Tentativa anterior ainda não reconciliada.");
    }
    retained ??= { intent: { ...intent }, scope, requestKey: key() };
    const attempt = retained;
    pending = true;
    try {
      const { data, error } = await rpc("rpc_b2b_resale_os_create_v1", {
        p_order_id: attempt.intent.orderId,
        p_order_item_id: attempt.intent.itemId,
        p_expected_updated_at: attempt.intent.observed,
        p_request_key: attempt.requestKey,
      });
      if (!sameScope(scope, current())) throw new Error("Sessão alterada; resultado não adotado.");
      if (error || !data || typeof data !== "object") throw new Error("Não foi possível confirmar a OS.");
      const ack = data as Partial<ResaleOsAck>;
      if (ack.ok !== true || typeof ack.replay !== "boolean" || ack.contract !== "B2B_RESALE_OS_V1" ||
          ack.order_id !== intent.orderId || ack.order_item_id !== intent.itemId || !validResaleOsUuid(ack.os_id)) {
        throw new Error("Resposta não confirmada.");
      }
      retained = undefined;
      return ack as ResaleOsAck;
    } finally {
      pending = false;
    }
  };
}
