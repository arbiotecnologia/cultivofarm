// Bounded automatic recovery of a TRANSIENT monitor timeout (reviewed
// environmental scopes only). Pure policy: it only decides WHEN to call the
// same canonical revalidateAuthz used by the Retry button. It never grants
// authority, never extends the lease and never reopens anything by itself.

export const AUTO_RECOVERY_BACKOFF_MS = Object.freeze([1_500, 4_000] as const);
/** Budget is restored only after a valid view held this long (no reset per timeout). */
export const AUTO_RECOVERY_STABLE_RESET_MS = 60_000;

export type ExpireReason = "error" | "offline" | "timeout" | "ineligible";

export interface AutoRecoveryState {
  attempts: number;
  /** Monotonic time of the last valid confirmation start (null = never/after stop). */
  validSince: number | null;
  /** Permanently off until a stable valid period / new identity. */
  halted: boolean;
}

export const initialAutoRecovery = (): AutoRecoveryState => ({ attempts: 0, validSince: null, halted: false });

export function onValid(s: AutoRecoveryState, now: number): AutoRecoveryState {
  return s.validSince === null ? { ...s, validSince: now } : s;
}

/**
 * Returns the backoff (ms) for the next automatic attempt, or null when the
 * expiry must stay paused (manual Retry still works). Only "timeout" in an
 * eligible scope is recoverable; ineligible/error/offline halt the budget.
 */
export function onExpire(s: AutoRecoveryState, reason: ExpireReason, eligibleScope: boolean, now: number): { next: AutoRecoveryState; delayMs: number | null } {
  const stable = s.validSince !== null && now - s.validSince >= AUTO_RECOVERY_STABLE_RESET_MS;
  const base: AutoRecoveryState = stable ? { attempts: 0, validSince: null, halted: false } : { ...s, validSince: null };
  if (!eligibleScope || reason !== "timeout") return { next: { ...base, halted: true }, delayMs: null };
  if (base.halted || base.attempts >= AUTO_RECOVERY_BACKOFF_MS.length) return { next: base, delayMs: null };
  return { next: { ...base, attempts: base.attempts + 1 }, delayMs: AUTO_RECOVERY_BACKOFF_MS[base.attempts] };
}
