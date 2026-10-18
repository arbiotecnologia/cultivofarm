import { supabase } from "@/integrations/supabase/client";
import type { AuthzFingerprintResult } from "./authzEpochMonitor";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Observation of existing self/h15/RLS contracts, NOT a new authorizer. */
export async function producerContextProbe(userId: string, organizationId: string): Promise<AuthzFingerprintResult> {
  const deny = () => ({ eligible: false, fingerprint: null });
  const rpc = supabase.rpc as unknown as (name: string, args?: Record<string, string>) => Promise<{ data: unknown; error: unknown }>;
  const { data: org, error: orgError } = await rpc.call(supabase, "h15_actor_organization");
  if (orgError) throw new Error("producer_probe_unavailable");
  if (org !== organizationId || !uuid.test(organizationId) || !uuid.test(userId)) return deny();
  const { data: ids, error: idsError } = await rpc.call(supabase, "get_cliente_ids_for_user", { _user_id: userId });
  if (idsError || !Array.isArray(ids) || ids.some(id => typeof id !== "string" || !uuid.test(id))) {
    throw new Error("producer_probe_invalid");
  }
  if (!ids.length) return deny();
  // Generic membership IDs alone are never authority. RLS includes restrictive
  // h15 tenant isolation and current can_user_access_cliente; no profile fallback.
  // Generated client types predate organization_id; validate unknown response
  // instead of regenerating bindings or widening the canonical client.
  const { data: rows, error } = await supabase.from("clientes").select("id, organization_id")
    .in("id", [...new Set(ids)]).filter("organization_id", "eq", organizationId).eq("status_cliente", "ativo") as unknown as { data: unknown; error: unknown };
  if (error || !Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || typeof row.id !== "string" || !uuid.test(row.id) || row.organization_id !== organizationId || !ids.includes(row.id))) {
    throw new Error("producer_probe_invalid");
  }
  const { data: finalOrg, error: finalError } = await rpc.call(supabase, "h15_actor_organization");
  if (finalError) throw new Error("producer_probe_unavailable");
  if (finalOrg !== organizationId || !rows.length) return deny();
  // Preserve ALL eligible clients. Sorted set is observation, not a revision,
  // no server budget/ABA guarantee; monitor refreshes even identical confirmations.
  return { eligible: true, fingerprint: JSON.stringify([userId, organizationId, [...new Set(rows.map(row => row.id))].sort()]) };
}