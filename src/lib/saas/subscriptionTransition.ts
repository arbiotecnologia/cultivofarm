export interface SubscriptionAction {
  organizationId: string;
  action: "start_trial" | "change_plan" | "mark_past_due" | "suspend" | "reactivate_manual" | "cancel" | "expire_trial";
  planVersionId: string | null;
  reason: string;
}

export class SubscriptionResultUnknown extends Error {
  constructor(readonly correlationId: string) {
    super("subscription_result_unknown");
  }
}

export interface TransitionIO {
  write: (value: SubscriptionAction, key: string, signal: AbortSignal) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
  committed: (org: string, key: string, signal: AbortSignal) => Promise<boolean>;
}

/** A deadline releases the UI even when auth-lock/fetch does not settle. Abort is not proof of rollback. */
export async function bounded<T>(run: (signal: AbortSignal) => PromiseLike<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => run(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("client_deadline")); }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createSubscriptionTransition(io: TransitionIO, rpcMs = 15_000, readMs = 4_000) {
  const keys = new Map<string, string>();
  const flights = new Map<string, Promise<{ correlationId: string; reconciled: boolean }>>();
  return (input: SubscriptionAction, verifying: () => void) => {
    const value = { ...input, reason: input.reason.trim() };
    const signature = JSON.stringify([value.organizationId, value.action, value.planVersionId, value.reason]);
    const existing = flights.get(signature);
    if (existing) return existing;
    const key = keys.get(signature) ?? crypto.randomUUID();
    const retry = keys.has(signature);
    keys.set(signature, key);
    const reconcile = async () => {
      verifying();
      for (let i = 0; i < 3; i++) {
        try {
          if (await bounded((signal) => io.committed(value.organizationId, key, signal), readMs)) return true;
        } catch { /* Unreadable is unknown, never proof of failure. */ }
      }
      return false;
    };
    const flight = (async () => {
      if (retry && await reconcile()) {
        keys.delete(signature);
        return { correlationId: key, reconciled: true };
      }
      try {
        const response = await bounded((signal) => io.write(value, key, signal), rpcMs);
        if (response.error) {
          // Explicit database rejections are definitive; transport/auth errors are not.
          if (response.error.code && /^(22|23|40|42|P0)/.test(response.error.code)) {
            throw Object.assign(new Error(response.error.message ?? "platform_rpc_error"), { definitive: true });
          }
          throw new Error("transport_result_unknown");
        }
        if (typeof response.data !== "string" || !/^[0-9a-f-]{36}$/i.test(response.data)) throw new Error("malformed_result");
        keys.delete(signature);
        return { correlationId: key, reconciled: false };
      } catch (error) {
        if (error instanceof Error && "definitive" in error) throw error;
        if (await reconcile()) {
          keys.delete(signature);
          return { correlationId: key, reconciled: true };
        }
        throw new SubscriptionResultUnknown(key);
      }
    })().finally(() => { flights.delete(signature); });
    flights.set(signature, flight);
    return flight;
  };
}