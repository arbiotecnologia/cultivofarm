import type { ResaleOsIntent } from "@/lib/comercial/resaleOsRequest";
import { validResaleOsTimestamp, validResaleOsUuid } from "@/lib/comercial/resaleOsRequest";

/** Uma tentativa incerta por aba; ids + CAS + chave, nunca token, preço ou autoridade. */
export const RESALE_OS_ATTEMPT_KEY = "cf:b2b-resale-os-attempt:v1";
export const RESALE_OS_ATTEMPT_TTL_MS = 8 * 60 * 60 * 1000;

export type ResaleOsAttemptScope = { scope: string; actor: string; tenant: string };
export type RetainedResaleOsAttempt = ResaleOsAttemptScope & ResaleOsIntent & {
  requestKey: string;
  savedAt: number;
  expiresAt: number;
};

function storage(): Storage | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}
function drop(st: Storage) { try { st.removeItem(RESALE_OS_ATTEMPT_KEY); } catch { /* sem retenção */ } }
function validScope(scope: ResaleOsAttemptScope): boolean {
  return validResaleOsUuid(scope.actor) && validResaleOsUuid(scope.tenant) && scope.scope.length > 0 && scope.scope.length < 2048;
}
function decode(raw: string | null, now: number): RetainedResaleOsAttempt | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const r = value as Record<string, unknown>;
    if (Object.keys(r).sort().join(",") !== "actor,expiresAt,itemId,observed,orderId,requestKey,savedAt,scope,tenant,v" ||
        r.v !== 1 || typeof r.scope !== "string" || typeof r.actor !== "string" || typeof r.tenant !== "string" ||
        !validResaleOsUuid(r.orderId) || !validResaleOsUuid(r.itemId) || !validResaleOsTimestamp(r.observed) ||
        typeof r.requestKey !== "string" || r.requestKey.trim().length < 8 || r.requestKey.length > 128 ||
        typeof r.savedAt !== "number" || typeof r.expiresAt !== "number" || r.savedAt > now + 60_000 ||
        r.expiresAt <= now || r.expiresAt - r.savedAt > RESALE_OS_ATTEMPT_TTL_MS) return null;
    return {
      scope: r.scope, actor: r.actor, tenant: r.tenant,
      orderId: r.orderId, itemId: r.itemId, observed: r.observed,
      requestKey: r.requestKey, savedAt: r.savedAt, expiresAt: r.expiresAt,
    };
  } catch { return null; }
}

/** Escopo divergente/expirado/corrompido é apagado e nunca adotado. */
export function loadResaleOsAttempt(scope: ResaleOsAttemptScope, now = Date.now()): RetainedResaleOsAttempt | null {
  const st = storage(); if (!st || !validScope(scope)) return null;
  let raw: string | null = null;
  try { raw = st.getItem(RESALE_OS_ATTEMPT_KEY); } catch { return null; }
  const record = decode(raw, now);
  if (!record || record.scope !== scope.scope || record.actor !== scope.actor || record.tenant !== scope.tenant) {
    if (raw) drop(st);
    return null;
  }
  return record;
}

/** Não sobrescreve uma tentativa incerta diferente; falha de storage bloqueia o dispatch. */
export function retainResaleOsAttempt(scope: ResaleOsAttemptScope, intent: ResaleOsIntent, requestKey: string, now = Date.now()): RetainedResaleOsAttempt | null {
  const st = storage(); if (!st || !validScope(scope)) return null;
  const previous = loadResaleOsAttempt(scope, now);
  if (previous) {
    return previous.orderId === intent.orderId && previous.itemId === intent.itemId && previous.observed === intent.observed
      ? previous : null;
  }
  if (requestKey.trim().length < 8 || requestKey.length > 128) return null;
  const record: RetainedResaleOsAttempt = {
    ...scope, ...intent, requestKey, savedAt: now, expiresAt: now + RESALE_OS_ATTEMPT_TTL_MS,
  };
  try {
    st.setItem(RESALE_OS_ATTEMPT_KEY, JSON.stringify({ v: 1, ...record }));
    return loadResaleOsAttempt(scope, now)?.requestKey === requestKey ? record : null;
  } catch { return null; }
}

export function clearResaleOsAttempt(scope: ResaleOsAttemptScope, requestKey?: string): void {
  const st = storage(); if (!st) return;
  if (requestKey) {
    const current = loadResaleOsAttempt(scope);
    if (!current || current.requestKey !== requestKey) return;
  }
  drop(st);
}
