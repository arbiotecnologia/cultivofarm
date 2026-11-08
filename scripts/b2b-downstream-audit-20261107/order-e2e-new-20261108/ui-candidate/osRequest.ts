export type OrderIntent = Readonly<{ orderId: string; itemId: string; observed: string }>;
export type Fence = Readonly<{ actor: string; tenant: string; epoch: number; ready: boolean }>;
export type Ack = { ok: true; replay: boolean; contract: 'B2B_RESALE_OS_V1'; os_id: string; order_id: string; order_item_id: string };
export type Rpc = (name: string, args: Record<string, string>) => Promise<{ data: unknown; error: unknown }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function createOsRequest(rpc: Rpc, current: () => Fence, key: () => string = () => crypto.randomUUID()) {
  let pending = false;
  let retained: { intent: OrderIntent; scope: Fence; requestKey: string } | undefined;
  return async (intent: OrderIntent): Promise<Ack> => {
    const scope = { ...current() };
    if (pending || !scope.ready || !scope.actor || !scope.tenant) throw new Error('Operação indisponível.');
    if (!uuid.test(intent.orderId) || !uuid.test(intent.itemId) || !timestamp.test(intent.observed) || !Number.isFinite(Date.parse(intent.observed))) throw new Error('Pedido sem versão válida.');
    const sameScope = (a: Fence, b: Fence) => a.actor === b.actor && a.tenant === b.tenant && a.epoch === b.epoch && b.ready;
    if (retained && (!sameScope(retained.scope, scope) || retained.intent.orderId !== intent.orderId || retained.intent.itemId !== intent.itemId || retained.intent.observed !== intent.observed)) throw new Error('Tentativa anterior ainda não reconciliada.');
    retained ??= { intent: { ...intent }, scope, requestKey: key() };
    const attempt = retained;
    pending = true;
    try {
      const { data, error } = await rpc('rpc_b2b_resale_os_create_v1', {
        p_order_id: attempt.intent.orderId, p_order_item_id: attempt.intent.itemId,
        p_expected_updated_at: attempt.intent.observed, p_request_key: attempt.requestKey,
      });
      if (!sameScope(scope, current())) throw new Error('Sessão alterada; resultado não adotado.');
      if (error || !data || typeof data !== 'object') throw new Error('Não foi possível confirmar a OS.');
      const ack = data as Partial<Ack>;
      if (ack.ok !== true || typeof ack.replay !== 'boolean' || ack.contract !== 'B2B_RESALE_OS_V1' || ack.order_id !== intent.orderId || ack.order_item_id !== intent.itemId || !ack.os_id || !uuid.test(ack.os_id)) throw new Error('Resposta não confirmada.');
      return ack as Ack;
    } finally { pending = false; }
  };
}