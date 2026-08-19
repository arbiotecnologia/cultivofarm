/**
 * Fase H7b — Chave de idempotência para `rpc_fiscal_event_manual`.
 *
 * A RPC canônica passou a EXIGIR `p_idempotency_key` (erro estável
 * `FISCAL_IDEMPOTENCY_REQUIRED`). A chave é derivada de forma determinística
 * do conteúdo material do evento, de modo que:
 *   - duplo clique / retry da MESMA tentativa lógica reutiliza a chave e o
 *     servidor devolve o MESMO event_id (replay, sem duplicar);
 *   - alteração material das notas gera outra chave (novo evento legítimo);
 *   - a mesma chave com payload diferente é rejeitada no servidor com
 *     `FISCAL_IDEMPOTENCY_CONFLICT`.
 *
 * Pura: sem Date.now, sem random.
 */

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Normaliza o payload material exatamente como o fingerprint do servidor. */
export function normalizeEventNotes(notes: string | null | undefined): string {
  return (notes ?? "").trim();
}

/**
 * Chave estável no formato:
 *   FISCEV:{eventType}:{invoiceId}:{fnv1a32(notas normalizadas)}
 */
export function buildFiscalEventIdempotencyKey(
  invoiceId: string,
  eventType: string,
  notes?: string | null,
): string {
  const normalized = normalizeEventNotes(notes);
  const hash = fnv1a32(`${eventType.trim().toUpperCase()}|${normalized}`);
  return `FISCEV:${eventType.trim().toUpperCase()}:${invoiceId}:${hash}`;
}

/** Erro estável devolvido pelo servidor quando a chave não é informada. */
export const FISCAL_IDEMPOTENCY_REQUIRED = "FISCAL_IDEMPOTENCY_REQUIRED";
/** Erro estável quando a mesma chave chega com payload diferente. */
export const FISCAL_IDEMPOTENCY_CONFLICT = "FISCAL_IDEMPOTENCY_CONFLICT";

export function isFiscalIdempotencyConflict(err: unknown): boolean {
  const m = (err as { message?: unknown } | null)?.message;
  return typeof m === "string" && m.includes(FISCAL_IDEMPOTENCY_CONFLICT);
}
