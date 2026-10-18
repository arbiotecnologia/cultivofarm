import { supabase } from "@/integrations/supabase/client";
import type { AuthzFingerprintResult } from "./authzEpochMonitor";

/** Limited financial principal observation. RLS/RBAC remain server-owned. */
export async function internalContextProbe(userId: string, organizationId: string): Promise<AuthzFingerprintResult> {
  const deny = () => ({ eligible: false, fingerprint: null });
  const rpc = supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>;
  const { data: org, error: orgError } = await rpc.call(supabase, "h15_actor_organization");
  if (orgError) throw new Error("internal_probe_unavailable");
  if (!userId || !organizationId || org !== organizationId) return deny();
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("user_id, organization_id, ativo, senha_provisoria").eq("user_id", userId).maybeSingle();
  if (profileError) throw new Error("internal_probe_unavailable");
  if (profile?.user_id !== userId || profile.organization_id !== organizationId ||
    profile.ativo !== true || profile.senha_provisoria !== false) return deny();
  const { data: roles, error: rolesError } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (rolesError) throw new Error("internal_probe_unavailable");
  // Do not adopt a new/mixed role using a cached principal. Pause until the
  // original role is restored, or a fresh login resolves the new RBAC context.
  if (!Array.isArray(roles) || roles.length !== 1 || roles[0]?.role !== "financeiro") return deny();
  const { data: allowed, error: roleError } = await supabase.rpc("has_role", { _user_id: userId, _role: "financeiro" });
  if (roleError) throw new Error("internal_probe_unavailable");
  if (allowed !== true) return deny();
  const { data: finalOrg, error: finalError } = await rpc.call(supabase, "h15_actor_organization");
  if (finalError) throw new Error("internal_probe_unavailable");
  if (finalOrg !== organizationId) return deny();
  // No revision/budget fabrication: repeated confirmation refreshes existing
  // monitor caches. Separate statements cannot prove transient ABA/snapshot.
  return { eligible: true, fingerprint: JSON.stringify([userId, organizationId, ["financeiro"]]) };
}