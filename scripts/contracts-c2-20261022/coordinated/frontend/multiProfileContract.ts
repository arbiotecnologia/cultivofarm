// INACTIVE. Promoted only together with coordinated SQL, Edge and consumers.
import type { AuthzFingerprintResult } from "@/lib/authz/authzEpochMonitor";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const external = ["cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico"];
export function isC2ExternalScope(roles: readonly string[]) {
  return roles.length > 0 && roles.length <= 3 && new Set(roles).size === roles.length && roles.every(r => external.includes(r));
}
export function decodeC2Contexts(raw: unknown, actor: string, tenant: string, roles: readonly string[]) {
  if (!isC2ExternalScope(roles) || !raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("c2_context_invalid");
  const r = raw as Record<string, unknown>;
  const contexts = r.available_contexts;
  if (r.contract !== "C2_MULTIPROFILE_V1" || r.actor_id !== actor || r.tenant_id !== tenant || r.ready !== true ||
    !Array.isArray(contexts) || contexts.some(c => !["b2b", "technical", "producer"].includes(c)) || new Set(contexts).size !== contexts.length ||
    (contexts.includes("b2b") && !roles.includes("parceiro_b2b")) ||
    (contexts.includes("technical") && !roles.includes("parceiro_b2b_tecnico")) ||
    (contexts.includes("producer") && (!roles.includes("cliente_produtor") || r.producer_links_valid !== true)) ||
    (contexts.some(c => c === "b2b" || c === "technical") && (typeof r.partner_id !== "string" || !uuid.test(r.partner_id)))) throw new Error("c2_context_invalid");
  return r;
}
export function c2ContextProbe(raw: unknown, actor: string, tenant: string, roles: readonly string[]): AuthzFingerprintResult {
  const r = decodeC2Contexts(raw, actor, tenant, roles);
  const contexts = r.available_contexts as string[];
  return { eligible: contexts.length > 0, fingerprint: contexts.length ? JSON.stringify([
    actor, tenant, [...roles].sort(), [...contexts].sort(), r.partner_id,
    r.producer_links_valid, r.profile_stamp, r.link_version,
  ]) : null };
}
export function decodeC2Partner(raw: unknown, actor: string, tenant: string, roles: readonly string[]) {
  if (!isC2ExternalScope(roles) || !raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("c2_partner_invalid");
  const r = raw as Record<string, unknown>;
  if (r.contract !== "C2_MULTIPROFILE_V1" || r.actor_id !== actor || r.tenant_id !== tenant || r.organization_id !== tenant ||
    r.commercial_owner_organization_id !== tenant || r.mode !== "commercial_owner" ||
    typeof r.partner_id !== "string" || !uuid.test(r.partner_id) || !Array.isArray(r.external_roles) ||
    JSON.stringify([...r.external_roles].sort()) !== JSON.stringify([...roles].sort()) ||
    r.manager !== roles.includes("parceiro_b2b") || r.technician !== roles.includes("parceiro_b2b_tecnico")) throw new Error("c2_partner_invalid");
  return r;
}