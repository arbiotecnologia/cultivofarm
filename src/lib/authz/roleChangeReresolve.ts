// One automatic canonical re-resolution after an "ineligible" probe in the
// reviewed gestor/consultor pair/residual scopes. Pure policy: it only decides
// WHETHER to call the same canonical revalidateAuthz used by Retry (fresh
// profile+roles read, fenced loader, new monitor confirmation). It never grants
// authority, never restores a removed role, never extends the lease and never
// signs out. Budget: one attempt, re-armed only by a later valid confirmation.

export interface RoleChangeReresolveState { armed: boolean }
export const initialRoleChangeReresolve = (): RoleChangeReresolveState => ({ armed: true });

export function onValid(_s: RoleChangeReresolveState): RoleChangeReresolveState {
  return { armed: true };
}

export function onExpire(
  s: RoleChangeReresolveState,
  reason: "error" | "offline" | "timeout" | "ineligible",
  eligibleScope: boolean,
  online: boolean,
): { next: RoleChangeReresolveState; run: boolean } {
  if (reason !== "ineligible" || !eligibleScope || !online || !s.armed) return { next: s, run: false };
  return { next: { armed: false }, run: true };
}
