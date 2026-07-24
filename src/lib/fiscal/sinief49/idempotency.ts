/**
 * Fase SINIEF 2 — Chave de idempotência determinística por operação/origem.
 *
 * Pura: sem Date.now, sem random. Mesmo input → mesma chave.
 * Hash FNV-1a de 32 bits em hex (8 chars). Colisão irrelevante para o uso
 * (a chave carrega também operação + origem em texto claro).
 */
import type { SinefOperationType } from "./types";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return "null";
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export interface IdempotencyOrigin {
  /** Ex: 'ORDER', 'INVOICE', 'STOCK_EVENT'. */
  source: string;
  /** Id do recurso de origem. */
  sourceId: string;
}

/**
 * Chave estável no formato:
 *   SINIEF49:{operation}:{source}:{sourceId}:{fnv1a32(canonical)}
 */
export function buildIdempotencyKey(
  operation: SinefOperationType,
  origin: IdempotencyOrigin,
  canonicalPayload: unknown,
): string {
  const hash = fnv1a32(stableStringify(canonicalPayload));
  return `SINIEF49:${operation}:${origin.source}:${origin.sourceId}:${hash}`;
}

// Exportado para testes de determinismo/serialização.
export const __internal = { stableStringify, fnv1a32 };
