import { expect, it } from "vitest";
import { c2ContextProbe } from "@/lib/authz/multiProfileContract";
import { b2bContextProbe } from "@/lib/authz/b2bContextProbe";
const actor = "11111111-1111-4111-8111-111111111111";
const tenant = "22222222-2222-4222-8222-222222222222";
const partner = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";
const roles = ["parceiro_b2b"];
const raw = { contract: "C2_MULTIPROFILE_V1", actor_id: actor, tenant_id: tenant, ready: true,
  available_contexts: ["b2b"], partner_id: partner, producer_links_valid: false, profile_stamp: "v1", link_version: 1 };
it("C2 singleton manager fingerprints the complete observed vector, not just partner UUID", () => {
  expect(JSON.parse(c2ContextProbe(raw, actor, tenant, roles).fingerprint ?? "null"))
    .toEqual([actor, tenant, roles, ["b2b"], partner, false, "v1", 1]);
});
it.each([
  { partner_id: other }, { profile_stamp: "v2" }, { link_version: 2 }, { producer_links_valid: true },
])("C2 detects observed vector change %j", delta => {
  expect(c2ContextProbe({ ...raw, ...delta }, actor, tenant, roles).fingerprint)
    .not.toBe(c2ContextProbe(raw, actor, tenant, roles).fingerprint);
});
it("C2 contexts and cumulative roles both participate in the fingerprint", () => {
  expect(c2ContextProbe({ ...raw, available_contexts: ["b2b", "technical"] }, actor, tenant, [...roles, "parceiro_b2b_tecnico"]).fingerprint)
    .not.toBe(c2ContextProbe(raw, actor, tenant, roles).fingerprint);
});
it("C2 revocation is ineligible and foreign actor/tenant fails closed", () => {
  expect(c2ContextProbe({ ...raw, available_contexts: [] }, actor, tenant, roles)).toEqual({ eligible: false, fingerprint: null });
  expect(() => c2ContextProbe(raw, other, tenant, roles)).toThrow();
  expect(() => c2ContextProbe(raw, actor, other, roles)).toThrow();
});
it("legacy B2B vector includes owner, tenant, role, papel and mode; no monotonic revision is invented", () => {
  const legacy = { partner_id: partner, organization_id: tenant, commercial_owner_organization_id: other,
    role: "parceiro_b2b", papel: "gestor", mode: "legacy_partner_tenant" };
  expect(JSON.parse(b2bContextProbe(legacy, tenant, roles[0]).fingerprint ?? "null"))
    .toEqual([partner, tenant, other, "parceiro_b2b", "gestor", "legacy_partner_tenant"]);
  expect(b2bContextProbe({ ...legacy, commercial_owner_organization_id: partner }, tenant, roles[0]).fingerprint)
    .not.toBe(b2bContextProbe(legacy, tenant, roles[0]).fingerprint);
  expect(b2bContextProbe(null, tenant, roles[0]).eligible).toBe(false);
});