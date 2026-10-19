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
  const { data: org, error: orgError } = await rpc.call(supabase, "h15_actor_organization");
  if (orgError) throw new Error("internal_probe_unavailable");
  if (!userId || !organizationId || org !== organizationId) return deny();
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("user_id, organization_id, ativo, senha_provisoria").eq("user_id", userId).maybeSingle() as unknown as {
      data: { user_id?: unknown; organization_id?: unknown; ativo?: unknown; senha_provisoria?: unknown } | null;
      error: unknown;
    };
  if (profileError) throw new Error("internal_probe_unavailable");
  if (profile?.user_id !== userId || profile.organization_id !== organizationId ||
    profile.ativo !== true || profile.senha_provisoria !== false) return deny();
  const { data: roles, error: rolesError } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (rolesError) throw new Error("internal_probe_unavailable");
  // Do not adopt a new/mixed role using a cached principal. Pause until the
  // original role is restored, or a fresh login resolves the new RBAC context.
  if (!Array.isArray(roles) || roles.length !== sortedExpected.length) return deny();
  const actual = roles.map(row => row?.role);
  if (new Set(actual).size !== actual.length || !sortedExpected.every(role => actual.includes(role))) return deny();
  for (const role of sortedExpected) {
    const { data: roleAllowed, error: roleError } = await supabase.rpc("has_role", { _user_id: userId, _role: role as InternalSingleRole | "gestor" });
    if (roleError) throw new Error("internal_probe_unavailable");
    if (roleAllowed !== true) return deny();
  }
  const { data: finalOrg, error: finalError } = await rpc.call(supabase, "h15_actor_organization");
  if (finalError) throw new Error("internal_probe_unavailable");
  if (finalOrg !== organizationId) return deny();
  // No revision/budget fabrication: identical observation renews only the lease.
  // Separate statements cannot prove transient ABA/snapshot.
  return { eligible: true, fingerprint: JSON.stringify([userId, organizationId, sortedExpected]) };
}