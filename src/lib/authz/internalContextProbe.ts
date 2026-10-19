import { supabase } from "@/integrations/supabase/client";
import type { AuthzFingerprintResult } from "./authzEpochMonitor";

export const MANAGER_CONSULTANT_ROLES = Object.freeze(["gestor", "consultor_tecnico"] as const);
type InternalSingleRole = "financeiro" | "administrador" | "consultor_tecnico" | "operador_onfarm";
export type InternalExpectedRoles = InternalSingleRole | typeof MANAGER_CONSULTANT_ROLES;

/** Scope selection only, never server authority; duplicates/subsets/supersets fail. */
export function isManagerConsultantScope(roles: readonly string[], organizationId: unknown): boolean {
  return typeof organizationId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId) &&
    roles.length === 2 && new Set(roles).size === 2 && MANAGER_CONSULTANT_ROLES.every(role => roles.includes(role));
}

/** Limited expected tenant principal observation. RLS/RBAC remain server-owned. */
export async function internalContextProbe(userId: string, organizationId: string, expectedRole: InternalExpectedRoles = "financeiro"): Promise<AuthzFingerprintResult> {
  const deny = () => ({ eligible: false, fingerprint: null });
  // Copy before any await; caller mutation cannot change the expected authority.
  const expected = typeof expectedRole === "string" ? [expectedRole] : Array.isArray(expectedRole) ? [...expectedRole] : [];
  const allowed = expected.length === 1
    ? ["financeiro", "administrador", "consultor_tecnico", "operador_onfarm"].includes(expected[0])
    : isManagerConsultantScope(expected, organizationId);
  const sortedExpected = Object.freeze([...expected].sort());
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId) ||
    !userId || !allowed) return deny();
  const rpc = supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>;
  // Latency: 2 sequential waves instead of 4+N round trips (no new RPC, no
  // grant change). Wave 1 reads org/profile/roles in parallel; reads grant
  // nothing and the decision is taken only after all arrive. Wave 2 runs only
  // after the exact set matched: has_role per role, a fresh roles re-read and
  // the final h15 bracket, in parallel — a change landing during wave 1 is
  // still observed. Any transport error fails closed as unavailable.
  const readRoles = () => supabase.from("user_roles").select("role").eq("user_id", userId) as unknown as Promise<{ data: unknown; error: unknown }>;
  const exactSet = (rows: unknown) => {
    if (!Array.isArray(rows) || rows.length !== sortedExpected.length) return false;
    const actual = rows.map(row => (row as { role?: unknown } | null)?.role);
    return new Set(actual).size === actual.length && sortedExpected.every(role => actual.includes(role));
  };
  const [orgResult, profileResult, rolesResult] = await Promise.all([
    rpc.call(supabase, "h15_actor_organization"),
    supabase.from("profiles").select("user_id, organization_id, ativo, senha_provisoria").eq("user_id", userId).maybeSingle() as unknown as Promise<{
      data: { user_id?: unknown; organization_id?: unknown; ativo?: unknown; senha_provisoria?: unknown } | null; error: unknown }>,
    readRoles(),
  ]);
  if (orgResult.error || profileResult.error || rolesResult.error) throw new Error("internal_probe_unavailable");
  if (orgResult.data !== organizationId) return deny();
  const profile = profileResult.data;
  if (profile?.user_id !== userId || profile.organization_id !== organizationId ||
    profile.ativo !== true || profile.senha_provisoria !== false) return deny();
  // Do not adopt a new/mixed role using a cached principal. Pause until the
  // original role is restored, or a fresh login resolves the new RBAC context.
  if (!exactSet(rolesResult.data)) return deny();
  const [finalResult, rolesAgain, ...roleChecks] = await Promise.all([
    rpc.call(supabase, "h15_actor_organization"),
    readRoles(),
    ...sortedExpected.map(role =>
      supabase.rpc("has_role", { _user_id: userId, _role: role as InternalSingleRole | "gestor" }) as unknown as Promise<{ data: unknown; error: unknown }>),
  ]);
  if (finalResult.error || rolesAgain.error || roleChecks.some(r => r.error)) throw new Error("internal_probe_unavailable");
  if (roleChecks.some(r => r.data !== true) || !exactSet(rolesAgain.data) || finalResult.data !== organizationId) return deny();
  // No revision/budget fabrication: identical observation renews only the lease.
  // Separate statements cannot prove transient ABA/snapshot.
  return { eligible: true, fingerprint: JSON.stringify([userId, organizationId, sortedExpected]) };
}