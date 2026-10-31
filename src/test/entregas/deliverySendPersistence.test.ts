import { describe, expect, it, vi } from 'vitest';
import { loadSends, parseSend, persistBeforeDispatch, removeExactSend, sendSlot, serializeSend, withSendLock } from '@/lib/entregas/deliverySendPersistence';

const A = '10000000-0000-4000-8000-000000000003', O = '10000000-0000-4000-8000-000000000001', E = '10000000-0000-4000-8000-000000000101', OS = '10000000-0000-4000-8000-000000000007', K = '40000000-0000-4000-8000-000000000001', B = '20000000-0000-4000-8000-000000000002';
const attempt = { scope: { actor: A, org: O, entrega: E }, os: OS, observed: '2026-10-30T10:00:00Z', key: K };
const mem = () => { const m = new Map<string, string>(); return { m, get length() { return m.size; }, key: (i: number) => Array.from(m.keys())[i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }; };

describe('Enviar persisted attempt (strict, never authority)', () => {
  it('stores only ids/CAS/key and round-trips strictly', () => {
    const s = mem(); persistBeforeDispatch(s, attempt); const raw = s.getItem(sendSlot(A, O, E))!;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['actor', 'entrega', 'key', 'observed', 'org', 'os', 'schema', 'v']);
    expect(loadSends(s, A, O)).toEqual({ attempts: [{ actor: A, org: O, entrega: E, os: OS, observed: attempt.observed, key: K }], corrupt: [] });
  });
  it('never overwrites a different attempt in the same slot', () => {
    const s = mem(); persistBeforeDispatch(s, { ...attempt, key: B });
    expect(() => persistBeforeDispatch(s, attempt)).toThrow('Outra tentativa'); expect(JSON.parse(s.getItem(sendSlot(A, O, E))!).key).toBe(B);
  });
  it('read-back mismatch and setItem failure throw before dispatch', () => {
    const s = mem(); const bad = { ...s, setItem: () => {} };
    expect(() => persistBeforeDispatch(bad as any, attempt)).toThrow('não confirmado');
    expect(() => persistBeforeDispatch({ ...s, setItem: () => { throw new Error('quota'); } } as any, attempt)).toThrow('quota');
  });
  it.each([['{', 'malformed'], [serializeSend({ actor: A, org: O, entrega: E, os: OS, observed: attempt.observed, key: K }).replace('"v":1', '"v":2'), 'version'], [serializeSend({ actor: A, org: O, entrega: B, os: OS, observed: attempt.observed, key: K }), 'slot'], [serializeSend({ actor: A, org: O, entrega: E, os: OS, observed: '2026-10-30', key: K }), 'ts'], [JSON.stringify({ v: 1, schema: 'delivery_send_attempt', actor: A, org: O, entrega: E, os: OS, observed: attempt.observed, key: K, token: 'x' }), 'extra']])('rejects %s (%s)', (raw) => {
    expect(parseSend(raw, sendSlot(A, O, E))).toBeNull();
    const s = mem(); s.setItem(sendSlot(A, O, E), raw); expect(loadSends(s, A, O).corrupt).toEqual([sendSlot(A, O, E)]); expect(s.getItem(sendSlot(A, O, E))).toBe(raw);
  });
  it('foreign actor/tenant records are invisible and untouched', () => {
    const s = mem(); persistBeforeDispatch(s, { ...attempt, scope: { ...attempt.scope, org: B } });
    expect(loadSends(s, A, O)).toEqual({ attempts: [], corrupt: [] }); expect(s.m.size).toBe(1);
  });
  it('removes only the exact record', () => {
    const s = mem(); persistBeforeDispatch(s, { ...attempt, key: B });
    expect(removeExactSend(s, attempt)).toBe(false); expect(s.m.size).toBe(1);
    expect(removeExactSend(s, { ...attempt, key: B })).toBe(true); expect(s.m.size).toBe(0);
    expect(removeExactSend({ ...s, getItem: () => { throw new Error('x'); } } as any, attempt)).toBe(false);
  });
  it('lock: unavailable API or held lock refuses without running work', async () => {
    const work = vi.fn(async () => 1);
    await expect(withSendLock(undefined, A, O, work)).rejects.toThrow('indisponível');
    await expect(withSendLock({ request: async (_n, _o, cb) => cb(null) }, A, O, work)).rejects.toThrow('outra aba');
    expect(work).not.toHaveBeenCalled();
    await expect(withSendLock({ request: async (_n, _o, cb) => cb({}) }, A, O, work)).resolves.toBe(1);
  });
});
