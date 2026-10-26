// Tentativa de envio de pedido com resultado possivelmente incerto.
//
// Somente memória de processo (nunca storage persistente). Guarda: a chave de
// idempotência gerada pelo cliente; um resumo NÃO criptográfico (hash de 53
// bits) do payload enviado — o texto da observação e demais campos não ficam
// retidos em claro; e, após confirmação, apenas o NÚMERO do pedido para aviso
// ao mesmo ator. Nunca preço, cart_hash, tokens ou ID do pedido. Não autoriza
// nada: o servidor continua decidindo preço, escopo e idempotência.
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
  order: { numero: string | null } | null;
}

const store = new Map<string, OrderAttempt>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function orderAttemptSlot(actor: { userId?: string | null; organizationId?: string | null; roles: readonly string[] }, partnerId: string | null | undefined): string | null {
  if (!actor.userId || !actor.organizationId || !partnerId || actor.roles.length === 0) return null;
  return JSON.stringify([actor.userId, actor.organizationId, [...actor.roles].sort(), partnerId]);
}

// cyrb53: resumo determinístico não reversível em claro; colisão apenas
// reaproveitaria a chave e o servidor recusaria (idempotency_conflict → incerto).
function digest(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Inclui first_due_date (o servidor também o considera); exclui cart_hash. */
export function orderAttemptFingerprint(input: {
  partner_id: string; observacoes?: string | null; requested_delivery_date?: string | null;
  payment_plan_id?: string | null; installment_count?: number | null; first_due_date?: string | null;
  items: Array<{ item_id: string; item_tipo: string; quantidade: number; unidade_pedido: string; volume_ml?: number | null }>;
}): string {
  const items = input.items.map(i => [i.item_id, i.item_tipo, Number(i.quantidade), i.unidade_pedido, i.volume_ml ?? null])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return digest(JSON.stringify([input.partner_id, input.observacoes || null, input.requested_delivery_date || null,
    input.payment_plan_id ?? null, input.installment_count ?? null, input.first_due_date || null, items]));
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
export function markOrderAttemptCommitted(slot: string, key: string, order: { numero: string | null }) {
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

// Classes SQLSTATE cuja resposta do PostgREST prova que a transação da RPC foi
// revertida (dado/constraint/regra/raise da função/serialização-deadlock).
// Códigos PGRST*, gateway, rede, vazio, 08/53/57/58/XX ou desconhecidos => incerto.
const CONCLUSIVE_SQLSTATE_CLASSES = new Set(["22", "23", "40", "42", "P0"]);
export function isConclusiveRejection(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!error) return false;
  const code = typeof error.code === "string" ? error.code : "";
  if (!/^[0-9A-Z]{5}$/.test(code)) return false;
  if (String(error.message ?? "").includes("idempotency_conflict")) return false;
  return CONCLUSIVE_SQLSTATE_CLASSES.has(code.slice(0, 2));
}
