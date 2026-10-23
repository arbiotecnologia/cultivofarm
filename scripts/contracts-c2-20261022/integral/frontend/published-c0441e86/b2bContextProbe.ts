import type { AuthzFingerprintResult } from "./authzEpochMonitor";

// Validation of a canonical resolver RESPONSE, never local authorization.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function b2bContextProbe(raw: unknown, organizationId: string, role: string): AuthzFingerprintResult {
  if (raw === null) return { eligible: false, fingerprint: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("b2b_probe_invalid");
  const row = raw as Record<string, unknown>;
  const papel = role === "parceiro_b2b" ? "gestor" : role === "parceiro_b2b_tecnico" ? "tecnico" : null;
  if (!papel || row.role !== role || row.papel !== papel || row.organization_id !== organizationId ||
      typeof row.partner_id !== "string" || !uuid.test(row.partner_id) ||
      typeof row.commercial_owner_organization_id !== "string" || !uuid.test(row.commercial_owner_organization_id) ||
      (row.mode !== "commercial_owner" && row.mode !== "legacy_partner_tenant") ||
      (row.mode === "commercial_owner" && row.commercial_owner_organization_id !== organizationId)) {
    throw new Error("b2b_probe_invalid");
  }
  // This tuple is NOT a monotonic revision. No server time budget is invented.
  return { eligible: true, fingerprint: JSON.stringify([
    row.partner_id, row.organization_id, row.commercial_owner_organization_id, row.role, row.papel, row.mode,
  ]) };
}