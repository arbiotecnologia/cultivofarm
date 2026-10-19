import { describe, expect, it } from 'vitest';
import { initialAutoRecovery, onExpire, onValid, AUTO_RECOVERY_BACKOFF_MS, AUTO_RECOVERY_STABLE_RESET_MS } from '@/lib/authz/transientTimeoutRecovery';

describe('transient timeout recovery policy', () => {
  it('only timeout in eligible scope schedules, max 2 with growing backoff', () => {
    let s = initialAutoRecovery();
    const a = onExpire(s, 'timeout', true, 0); expect(a.delayMs).toBe(AUTO_RECOVERY_BACKOFF_MS[0]); s = a.next;
    const b = onExpire(s, 'timeout', true, 1); expect(b.delayMs).toBe(AUTO_RECOVERY_BACKOFF_MS[1]); s = b.next;
    expect(onExpire(s, 'timeout', true, 2).delayMs).toBeNull();
  });
  it.each(['ineligible', 'error', 'offline'] as const)('%s never schedules and halts', r => {
    const x = onExpire(initialAutoRecovery(), r, true, 0);
    expect(x.delayMs).toBeNull();
    expect(onExpire(x.next, 'timeout', true, 1).delayMs).toBeNull();
  });
  it('unreviewed scope never schedules', () => expect(onExpire(initialAutoRecovery(), 'timeout', false, 0).delayMs).toBeNull());
  it('short valid does not reset budget; 60 s stable does', () => {
    let s = onExpire(onExpire(initialAutoRecovery(), 'timeout', true, 0).next, 'timeout', true, 1).next;
    s = onValid(s, 10);
    expect(onExpire(s, 'timeout', true, 10 + AUTO_RECOVERY_STABLE_RESET_MS - 1).delayMs).toBeNull();
    s = onValid(onExpire(s, 'timeout', true, 0).next, 100);
    expect(onExpire(s, 'timeout', true, 100 + AUTO_RECOVERY_STABLE_RESET_MS).delayMs).toBe(AUTO_RECOVERY_BACKOFF_MS[0]);
  });
});
