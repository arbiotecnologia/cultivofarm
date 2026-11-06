// Tentativa de envio de pedido com resultado possivelmente incerto.
//
// Somente memória de processo (nunca storage persistente). Guarda: a chave de
// idempotência gerada pelo cliente; um resumo NÃO criptográfico (hash de 53
// bits) do payload enviado — o texto da observação e demais campos não ficam
// retidos em claro; e, após confirmação, apenas o NÚMERO do pedido para aviso
// ao mesmo ator. Nunca preço, cart_hash, tokens ou ID do pedido. Não autoriza
// nada: o servidor continua decidindo preço, escopo e idempotência.
//
// Chave: ator (usuário+empresa, SEM papéis e SEM época) + parceiro. Renovação,
// troca de papéis, saída/entrada ou tempo NÃO descartam uma tentativa incerta:
// o mesmo ator que voltar na mesma aba continua bloqueado; outro ator nunca a
// alcança. Só resposta conclusiva do servidor libera (pedido confirmado,
// rejeição com SQLSTATE de reversão, ou fechamento durável `closed`).
// LIMITE (documentado): memória da aba. Recarregar/fechar a aba ou outra aba/
// origem não herdam a tentativa — pendente até contrato durável fim a fim.

export interface OrderAttempt {
  key: string;
  fingerprint: string;
  /** Derivado: algum envio está em voo ou terminou sem resposta conclusiva. */
  ambiguous: boolean;
  /** Derivado: inflightCount > 0. */
  inflight: boolean;
  /** Envios desta chave ainda sem resposta (cliques no mesmo tick, remontagens). */
  inflightCount: number;
  /** Algum envio terminou sem resposta conclusiva: o servidor PODE ter commitado. */
  uncertain: boolean;
  /** Pedido confirmado pelo servidor (apenas o número, para aviso). */
  order: { numero: string | null } | null;
  /** Verificação/encerramento no servidor em andamento: bloqueia envios. */
  closing?: boolean;
}

function put(slot: string, next: Omit<OrderAttempt, "ambiguous" | "inflight">) {
  store.set(slot, { ...next, inflight: next.inflightCount > 0, ambiguous: next.inflightCount > 0 || next.uncertain });
  emit();
}

const store = new Map<string, OrderAttempt>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function orderAttemptSlot(actor: { userId?: string | null; organizationId?: string | null; roles: readonly string[] }, partnerId: string | null | undefined): string | null {
  if (!actor.userId || !actor.organizationId || !partnerId || actor.roles.length === 0) return null;
  // Papéis exigidos para haver slot, mas fora da chave: mudar papéis não escapa do bloqueio.
  return JSON.stringify([actor.userId, actor.organizationId, partnerId]);
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
  items: Array<{ item_id: string; item_tipo: string; quantidade: number; unidade_pedido: string; volume_ml?: number | null; packaging_id?: string | null }>;
}): string {
  // packaging_id só entra quando presente: impressões de linhas líquidas permanecem idênticas às já gravadas.
  const items = input.items.map(i => [i.item_id, i.item_tipo, Number(i.quantidade), i.unidade_pedido, i.volume_ml ?? null,
    ...(i.packaging_id ? [i.packaging_id] : [])])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return digest(JSON.stringify([input.partner_id, input.observacoes || null, input.requested_delivery_date || null,
    input.payment_plan_id ?? null, input.installment_count ?? null, input.first_due_date || null, items]));
}

export function readOrderAttempt(slot: string | null): OrderAttempt | null {
  return slot ? store.get(slot) ?? null : null;
}

export type PrepareResult = { ok: true; key: string } | { ok: false; reason: "ambiguous_changed" | "inflight_changed" | "closing" };

/** Reutiliza a chave para payload idêntico; nunca gera chave nova cegamente após incerteza. */
export function prepareOrderAttempt(slot: string, fingerprint: string, newKey: () => string): PrepareResult {
  const current = store.get(slot);
  if (current?.closing) return { ok: false, reason: "closing" };
  if (current && current.fingerprint === fingerprint) return { ok: true, key: current.key };
  if (current && !current.order) {
    if (current.inflight) return { ok: false, reason: "inflight_changed" };
    if (current.ambiguous) return { ok: false, reason: "ambiguous_changed" };
  }
  const key = newKey();
  put(slot, { key, fingerprint, inflightCount: 0, uncertain: false, order: null });
  return { ok: true, key };
}

/**
 * Reserva SÍNCRONA do envio (antes de qualquer await): contabiliza cada envio
 * em voo da mesma chave. Resultados fora de ordem nunca descartam a entrada
 * enquanto houver outro envio pendente ou incerteza anterior.
 */
export function markOrderAttemptSending(slot: string, key: string): { wasAmbiguous: boolean } {
  const current = store.get(slot);
  if (!current || current.key !== key || current.closing) return { wasAmbiguous: true };
  const wasAmbiguous = current.ambiguous;
  put(slot, { ...current, inflightCount: current.inflightCount + 1 });
  return { wasAmbiguous };
}

const release = (c: OrderAttempt) => Math.max(0, c.inflightCount - 1);

/** Servidor confirmou o pedido para esta chave. */
export function markOrderAttemptCommitted(slot: string, key: string, order: { numero: string | null }) {
  const current = store.get(slot);
  if (!current || current.key !== key) return;
  put(slot, { ...current, inflightCount: release(current), order });
}

/**
 * Rejeição conclusiva (SQLSTATE de reversão). Só descarta quando NENHUM outro
 * envio da chave está em voo, nenhum terminou incerto e nenhum confirmou.
 * O 3º parâmetro é mantido por compatibilidade e não decide sozinho.
 */
export function markOrderAttemptRejected(slot: string, key: string, _wasAmbiguous?: boolean) {
  const current = store.get(slot);
  if (!current || current.key !== key) return;
  const inflightCount = release(current);
  if (inflightCount === 0 && !current.uncertain && !current.order) { store.delete(slot); emit(); return; }
  put(slot, { ...current, inflightCount });
}

/** Sem resposta conclusiva (rede, contexto alterado, exceção): permanece incerto. */
export function markOrderAttemptUnresolved(slot: string, key: string) {
  const current = store.get(slot);
  if (!current || current.key !== key) return;
  put(slot, { ...current, inflightCount: release(current), uncertain: true });
}

/** Descarte permitido apenas quando o resultado é conhecido (pedido confirmado). */
export function settleOrderAttempt(slot: string | null, key?: string) {
  if (!slot) return;
  const current = store.get(slot);
  if (!current || (key && current.key !== key) || current.inflightCount > 0 || !current.order) return;
  store.delete(slot);
  emit();
}

/**
 * Início SÍNCRONO de verificação/encerramento: só para tentativa incerta, sem
 * envio em voo, sem pedido confirmado e sem outra verificação em curso.
 */
export function beginOrderAttemptClose(slot: string, key: string): boolean {
  const c = store.get(slot);
  if (!c || c.key !== key || c.inflightCount > 0 || c.order || !c.uncertain || c.closing) return false;
  put(slot, { ...c, closing: true });
  return true;
}

/**
 * Desfecho da verificação. `closed` (validado, mesmo escopo) remove a tentativa e
 * libera nova chave; `committed` registra o número; qualquer outro mantém incerto.
 */
export function finishOrderAttemptClose(slot: string, key: string, outcome:
  { state: "closed" } | { state: "committed"; numero: string } | { state: "unresolved" }) {
  const c = store.get(slot);
  if (!c || c.key !== key) return;
  if (outcome.state === "closed" && c.inflightCount === 0 && !c.order) { store.delete(slot); emit(); return; }
  if (outcome.state === "committed") { put(slot, { ...c, closing: false, order: { numero: outcome.numero } }); return; }
  put(slot, { ...c, closing: false });
}

/** Uso exclusivo de testes: a aplicação nunca descarta tentativas em logout/papéis/TTL. */
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
