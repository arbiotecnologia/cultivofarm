import { EXTERNAL_CAPABILITIES, type Capability } from "./partnerLifecycle";

/** INACTIVE decoder for the NEXT canonical RPC revision. No role-length/pu.papel
 * inference. Missing coordinated contract means NO-GO, not legacy adoption. */
export function readCoordinatedContexts(raw: unknown, expected: { actor: string; tenant: string; partner: string }) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("c2_readers_not_coordinated");
  const r = raw as Record<string, unknown>;
  if (r.contract !== "C2_MULTIPROFILE_V1" || r.actor_id !== expected.actor || r.tenant_id !== expected.tenant ||
    r.partner_id !== expected.partner || r.ready !== true || !Array.isArray(r.available_contexts)) throw Error("c2_readers_not_coordinated");
  const contexts = r.available_contexts;
  if (contexts.some(c => !["b2b", "technical", "producer"].includes(String(c))) || new Set(contexts).size !== contexts.length ||
    (contexts.includes("producer") && r.producer_links_valid !== true)) throw Error("c2_context_unproven");
  return [...contexts] as ("b2b" | "technical" | "producer")[];
}

/** Gate for existing provisioner receipt adapter; local draft cannot make it true.
 * Current hosted singular receipt is deliberately rejected until coordinated SQL,
 * claim/finish/compensation and selector readers all carry this server contract. */
export function requireCoordinatedProvisioning(raw: unknown, expected: { actor: string; tenant: string; partner: string; roles: Capability[] }) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("c2_provisioning_unavailable");
  const r = raw as Record<string, unknown>;
  const roles = r.external_roles;
  if (r.contract !== "C2_MULTIPROFILE_V1" || r.actor_id !== expected.actor || r.organization_id !== expected.tenant ||
    r.partner_id !== expected.partner || r.readers_ready !== true || r.provisioning_ready !== true || !Array.isArray(roles) ||
    roles.length !== expected.roles.length || new Set(roles).size !== roles.length ||
    roles.some(role => !EXTERNAL_CAPABILITIES.includes(role as Capability) || !expected.roles.includes(role as Capability)) ||
    (roles.includes("cliente_produtor") && r.producer_links_valid !== true)) throw Error("c2_provisioning_unavailable");
  return [...roles] as Capability[];
}