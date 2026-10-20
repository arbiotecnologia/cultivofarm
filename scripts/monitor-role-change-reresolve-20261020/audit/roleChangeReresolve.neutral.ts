// Audit-only stub: same API, policy never runs. Used to prove the candidate differs from baseline ONLY by the policy.
export interface RoleChangeReresolveState { armed: boolean }
export const initialRoleChangeReresolve = (): RoleChangeReresolveState => ({ armed: false });
export const onValid = (s: RoleChangeReresolveState) => s;
export const onExpire = (s: RoleChangeReresolveState) => ({ next: s, run: false });
