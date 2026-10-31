import { confirmationTimestamp } from './deliveryConfirmationFlow';
import type { SendAttempt } from './deliverySendFlow';

/**
 * Minimal durable retention of an uncertain Enviar attempt (client-side only).
 * Stores ONLY actor/tenant/entrega/OS UUIDs, the observed CAS revision and the request key.
 * Never stores JWT, password, files or PII. Persisted data never authorizes anything:
 * every reconciliation re-reads the fresh server capability and the server re-authorizes.
 */
export const SEND_PERSIST_PREFIX = 'cf:delivery-send:v1:';
export const SEND_PERSIST_SCHEMA = 'delivery_send_attempt';
export const SEND_PERSIST_VERSION = 1;
const FIELDS = ['v', 'schema', 'actor', 'org', 'entrega', 'os', 'observed', 'key'].sort().join();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL = '00000000-0000-0000-0000-000000000000';
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v) && v !== NIL;

export type SendStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
export type StoredSend = { actor: string; org: string; entrega: string; os: string; observed: string; key: string };
export type LoadedSends = { attempts: StoredSend[]; corrupt: string[] };

export const scopePrefix = (actor: string, org: string) => `${SEND_PERSIST_PREFIX}${actor}:${org}:`;
export const sendSlot = (actor: string, org: string, entrega: string) => `${scopePrefix(actor, org)}${entrega}`;

export function serializeSend(a: StoredSend): string {
  return JSON.stringify({ v: SEND_PERSIST_VERSION, schema: SEND_PERSIST_SCHEMA, actor: a.actor, org: a.org, entrega: a.entrega, os: a.os, observed: a.observed, key: a.key });
}

/** Strict parse: exact field set, version, schema, UUIDs, timezone-bearing timestamp and slot binding. */
export function parseSend(raw: string | null, slot: string): StoredSend | null {
  if (raw === null) return null;
  let o: unknown;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  if (Object.keys(r).sort().join() !== FIELDS || r.v !== SEND_PERSIST_VERSION || r.schema !== SEND_PERSIST_SCHEMA) return null;
  if (![r.actor, r.org, r.entrega, r.os, r.key].every(isId) || !confirmationTimestamp(r.observed)) return null;
  const s = { actor: r.actor, org: r.org, entrega: r.entrega, os: r.os, observed: r.observed, key: r.key } as StoredSend;
  if (sendSlot(s.actor, s.org, s.entrega) !== slot || serializeSend(s) !== raw) return null;
  return s;
}

/** Loads only the current actor+tenant records; foreign records are neither read nor removed. Throws if storage is unreadable. */
export function loadSends(store: SendStore, actor: string, org: string): LoadedSends {
  const prefix = scopePrefix(actor, org);
  const attempts: StoredSend[] = []; const corrupt: string[] = [];
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && k.startsWith(prefix)) keys.push(k); }
  for (const k of keys.sort()) {
    const s = parseSend(store.getItem(k), k);
    if (s && s.actor === actor && s.org === org) attempts.push(s); else corrupt.push(k);
  }
  return { attempts, corrupt };
}

export const toAttempt = (s: StoredSend, scope: string): SendAttempt & { slotScope: string } => ({ scope: { actor: s.actor, org: s.org, entrega: s.entrega }, os: s.os, observed: s.observed, key: s.key, slotScope: scope });
export const fromAttempt = (a: SendAttempt): StoredSend => ({ actor: a.scope.actor, org: a.scope.org, entrega: a.scope.entrega, os: a.os, observed: a.observed, key: a.key });

/**
 * Called synchronously immediately before the writer dispatch, while the cross-tab Web Lock is held.
 * Never overwrites a different stored attempt; verifies by read-back. Throws (no dispatch) on any failure.
 */
export function persistBeforeDispatch(store: SendStore, a: SendAttempt): void {
  const s = fromAttempt(a); const slot = sendSlot(s.actor, s.org, s.entrega); const raw = serializeSend(s);
  const existing = store.getItem(slot);
  if (existing !== null) {
    if (existing !== raw) throw new Error('Outra tentativa de envio está retida para esta entrega. Nenhuma alteração foi enviada.');
    return;
  }
  store.setItem(slot, raw);
  if (store.getItem(slot) !== raw) throw new Error('Registro local do envio não confirmado. Nenhuma alteração foi enviada.');
}

/** Removes only the exact record; returns false if absent/different (another tab) or removal failed. */
export function removeExactSend(store: SendStore, a: SendAttempt): boolean {
  const s = fromAttempt(a); const slot = sendSlot(s.actor, s.org, s.entrega);
  try {
    if (store.getItem(slot) !== serializeSend(s)) return false;
    store.removeItem(slot);
    return store.getItem(slot) === null;
  } catch { return false; }
}

export type LockManagerLike = { request: (name: string, options: { mode: 'exclusive'; ifAvailable: true }, cb: (lock: unknown) => Promise<unknown>) => Promise<unknown> };

/**
 * Real cross-tab mutual exclusion via the Web Locks API, held from preflight until the transport settles
 * (also past a UI timeout). Without Web Locks the send is refused before any call: localStorage check/set
 * is not atomic across tabs and is never treated as a lock.
 */
export async function withSendLock<T>(locks: LockManagerLike | undefined | null, actor: string, org: string, work: () => Promise<T>): Promise<T> {
  if (!locks || typeof locks.request !== 'function') throw new Error('Bloqueio entre abas indisponível neste navegador. Nenhuma alteração foi enviada.');
  let ran = false; let value: T | undefined;
  await locks.request(`cf:delivery-send-lock:${actor}:${org}`, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (!lock) return;
    ran = true; value = await work();
  });
  if (!ran) throw new Error('Envio de entrega em andamento em outra aba. Nenhuma alteração foi enviada.');
  return value as T;
}
