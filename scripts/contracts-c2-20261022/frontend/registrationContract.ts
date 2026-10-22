import { EXTERNAL_CAPABILITIES, type Capability } from "./partnerLifecycle";
// Validates only a local draft. The server must prove these references before
// existing Auth provisioning; do NOT send to the current exclusive create-user.
export function validateMultiProfileRegistration(input: {
  organizationId: string; partnerId: string; roles: Capability[]; clientIds: string[]; farmIds: string[];
}) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuid.test(input.organizationId) || !uuid.test(input.partnerId) || !input.roles.length ||
    input.roles.some(r => !EXTERNAL_CAPABILITIES.includes(r)) || new Set(input.roles).size !== input.roles.length)
    return "c2_invalid_registration";
  if (!input.roles.some(r => r === "parceiro_b2b" || r === "parceiro_b2b_tecnico")) return "c2_partner_role_required";
  if (input.roles.includes("cliente_produtor") && (!input.clientIds.length || !input.farmIds.length ||
    [...input.clientIds, ...input.farmIds].some(id => !uuid.test(id)))) return "c2_producer_link_required";
  return null;
}