import { supabase } from "@/integrations/supabase/client";
import type { AuthzFingerprintResult } from "./authzEpochMonitor";

export const MANAGER_CONSULTANT_ROLES = Object.freeze(["gestor", "consultor_tecnico"] as const);
// "gestor" single is only requested by the residual scope after a monitored pair.
type InternalSingleRole = "financeiro" | "administrador" | "consultor_tecnico" | "operador_onfarm" | "gestor";
export type InternalExpectedRoles = InternalSingleRole | typeof MANAGER_CONSULTANT_ROLES;

/** Server observation RPC (scripts/monitor-single-rtt-probe). Read-only, own auth.uid() only. */
export const INTERNAL_ACTOR_CONTEXT_RPC = "internal_actor_context_v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Scope selection only, never server authority; duplicates/subsets/supersets fail. */
export function isManagerConsultantScope(roles: readonly string[], organizationId: unknown): boolean {
  return typeof organizationId === "string" && UUID_RE.test(organizationId) &&
    roles.length === 2 && new Set(roles).size === 2 && MANAGER_CONSULTANT_ROLES.every(role => roles.includes(role));
}

/**
 * Limited expected tenant principal observation. RLS/RBAC remain server-owned.
 *
 * One round trip: `internal_actor_context_v1()` evaluates, in ONE statement
 * (one snapshot), h15_actor_organization(), the caller's own profile and
 * user_roles rows and has_role() for every row, all for auth.uid() only. The
 * client still demands the exact expected set; it never fills gaps from cache.
 * RPC missing/not granted/transport error => "internal_probe_unavailable"
 * (monitor fails closed). There is deliberately NO fallback to the previous
 * multi-request observation: an uninstalled RPC pauses, never widens.
 */
export async function internalContextProbe(userId: string, organizationId: string, expectedRole: InternalExpectedRoles = "financeiro"): Promise<AuthzFingerprintResult> {
  const deny = () => ({ eligible: false, fingerprint: null });
  // Copy before any await; caller mutation cannot change the expected authority.
  const expected = typeof expectedRole === "string" ? [expectedRole] : Array.isArray(expectedRole) ? [...expectedRole] : [];
  // A single role is accepted only as a string; one-element arrays fail.
  const allowed = typeof expectedRole === "string"
    ? ["financeiro", "administrador", "consultor_tecnico", "operador_onfarm", "gestor"].includes(expected[0])
    : isManagerConsultantScope(expected, organizationId);
  const sortedExpected = Object.freeze([...expected].sort());
  if (typeof organizationId !== "string" || !UUID_RE.test(organizationId) ||
    typeof userId !== "string" || !UUID_RE.test(userId) || !allowed) return deny();
  const rpc = supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>;
  const result = await rpc.call(supabase, INTERNAL_ACTOR_CONTEXT_RPC);
  if (!result || result.error) throw new Error("internal_probe_unavailable");
  return evaluateInternalActorContext(result.data, userId, organizationId, sortedExpected) ? {
    eligible: true,
    // No revision/budget fabrication: identical observation renews only the lease.
    fingerprint: JSON.stringify([userId, organizationId, sortedExpected]),
  } : deny();
}

/** Pure decision over the RPC payload; exported for tests. Any unknown shape denies. */
export function evaluateInternalActorContext(data: unknown, userId: string, organizationId: string, sortedExpected: readonly string[]): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  if (d.v !== 1 || d.user_id !== userId || d.organization_id !== organizationId) return false;
  const p = d.profile as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== "object" || p.user_id !== userId || p.organization_id !== organizationId ||
    p.ativo !== true || p.senha_provisoria !== false) return false;
  // Do not adopt a new/mixed role using a cached principal. Pause until the
  // original role is restored, or a fresh resolution selects the new scope.
  if (d.roles_confirmed !== true || !Array.isArray(d.roles) || d.roles.length !== sortedExpected.length) return false;
  const actual = d.roles as unknown[];
  if (actual.some(r => typeof r !== "string") || new Set(actual).size !== actual.length) return false;
  return sortedExpected.every(role => actual.includes(role));
}
