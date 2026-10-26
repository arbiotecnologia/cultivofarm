// Tentativa de envio de pedido com resultado possivelmente incerto.
//
// Somente memória de processo (nunca storage persistente). Guarda apenas a
// chave de idempotência gerada pelo cliente e uma impressão digital das
// ESCOLHAS do usuário (itens/quantidades/plano/data/observação) — nunca preço,
// cart_hash, tokens ou recibos. Não autoriza nada: o servidor continua
// decidindo preço, escopo e idempotência.
//
// Chave: ator (usuário+empresa+papéis, SEM época — renovação natural não pode
// esquecer uma tentativa incerta) + parceiro. Troca de identidade/saída limpa
// tudo via clearAllPauseStates (useAuth). Remoção de papel torna a entrada
// inalcançável (fail-closed) sem liberá-la para outro ator.

export interface OrderAttempt {
  key: string;
  fingerprint: string;
  /** Envio já saiu sem resposta conclusiva: o servidor PODE ter commitado. */
  ambiguous: boolean;
  inflight: boolean;
  /** Pedido confirmado pelo servidor mas ainda não entregue à tela. */
  order: { id: string; numero: string | null } | null;
}

const store = new Map<string, OrderAttempt>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function orderAttemptSlot(actor: { userId?: string | null; organizationId?: string | null; roles: readonly string[] }, partnerId: string | null | undefined): string | null {
  if (!actor.userId || !actor.organizationId || !partnerId || actor.roles.length === 0) return null;
  return JSON.stringify([actor.userId, actor.organizationId, [...actor.roles].sort(), partnerId]);
}

export function orderAttemptFingerprint(input: {
  partner_id: string; observacoes?: string | null; requested_delivery_date?: string | null;
  payment_plan_id?: string | null; installment_count?: number | null;
  items: Array<{ item_id: string; item_tipo: string; quantidade: number; unidade_pedido: string; volume_ml?: number | null }>;
}): string {
  const items = input.items.map(i => [i.item_id, i.item_tipo, Number(i.quantidade), i.unidade_pedido, i.volume_ml ?? null])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([input.partner_id, input.observacoes || null, input.requested_delivery_date || null,
    input.payment_plan_id ?? null, input.installment_count ?? null, items]);
}

export function readOrderAttempt(slot: string | null): OrderAttempt | null {
  return slot ? store.get(slot) ?? null : null;
}

export type PrepareResult = { ok: true; key: string } | { ok: false; reason: "ambiguous_changed" | "inflight_changed" };

/** Reutiliza a chave para payload idêntico; nunca gera chave nova cegamente após incerteza. */
export function prepareOrderAttempt(slot: string, fingerprint: string, newKey: () => string): PrepareResult {
  const current = store.get(slot);
  if (current && current.fingerprint === fingerprint) return { ok: true, key: current.key };
  if (current && !current.order) {
    if (current.inflight) return { ok: false, reason: "inflight_changed" };
    if (current.ambiguous) return { ok: false, reason: "ambiguous_changed" };
  }
  const key = newKey();
  store.set(slot, { key, fingerprint, ambiguous: false, inflight: false, order: null });
  emit();
  return { ok: true, key };
}

/** Marca o envio como saindo: a partir daqui o resultado é incerto até resposta. */
export function markOrderAttemptSending(slot: string, key: string): { wasAmbiguous: boolean } {
  const current = store.get(slot);
  if (!current || current.key !== key) return { wasAmbiguous: true };
  const wasAmbiguous = current.ambiguous;
  store.set(slot, { ...current, inflight: true, ambiguous: true });
  emit();
  return { wasAmbiguous };
}

/** Servidor confirmou o pedido para esta chave. */
export function markOrderAttemptCommitted(slot: string, key: string, order: { id: string; numero: string | null }) {
  const current = store.get(slot);
  if (!current || current.key !== key) return;
  store.set(slot, { ...current, inflight: false, ambiguous: false, order });
  emit();
}

/**
 * Resposta conclusiva de rejeição (erro com SQLSTATE: transação revertida).
 * Só descarta se a chave nunca esteve incerta antes deste envio; caso
 * contrário um envio anterior pode ter commitado e a incerteza permanece.
 */
export function markOrderAttemptRejected(slot: string, key: string, wasAmbiguous: boolean) {
  const current = store.get(slot);
  if (!current || current.key !== key) return;
  if (wasAmbiguous) store.set(slot, { ...current, inflight: false });
  else store.delete(slot);
  emit();
}

/** Sem resposta conclusiva (rede, contexto alterado, exceção): permanece incerto. */
export function markOrderAttemptUnresolved(slot: string, key: string) {
  const current = store.get(slot);
  if (!current || current.key !== key) return;
  store.set(slot, { ...current, inflight: false, ambiguous: true });
  emit();
}

/** Descarte permitido apenas quando o resultado é conhecido (pedido confirmado). */
export function settleOrderAttempt(slot: string | null, key?: string) {
  if (!slot) return;
  const current = store.get(slot);
  if (!current || (key && current.key !== key) || (!current.order && current.ambiguous)) return;
  store.delete(slot);
  emit();
}

export function clearAllOrderAttempts() {
  if (store.size === 0) return;
  store.clear();
  emit();
}

export function subscribeOrderAttempts(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
