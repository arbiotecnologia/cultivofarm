import { describe, expect, it } from "vitest";

// Executable specification ONLY: not imported by the app and not server proof.
// Review-ready means eligible for contract review, never authorization to provision.
type Review = {
  actorTenant: string; owner: string | null; actorActive: boolean;
  partnerActive: boolean; userTenant: string; expectedUserTenant: string;
  userActive: boolean; roles: string[]; linkCount: number;
  freshSession: boolean; entitled: boolean; cancelled: boolean;
  compensated: boolean; partialFailure: boolean;
};
function readyForReview(r: Review): boolean {
  return r.actorActive && r.owner === r.actorTenant && r.partnerActive
    && r.userTenant === r.expectedUserTenant && r.userActive
    && r.roles.length === 1 && ["parceiro_b2b", "parceiro_b2b_tecnico"].includes(r.roles[0])
    && r.linkCount === 0 && r.freshSession && r.entitled && !r.cancelled
    && (!r.partialFailure || r.compensated);
}
const candidate: Review = {
  actorTenant: "A", owner: "A", actorActive: true, partnerActive: true,
  userTenant: "P", expectedUserTenant: "P", userActive: true,
  roles: ["parceiro_b2b"], linkCount: 0, freshSession: true,
  entitled: true, cancelled: false, compensated: false, partialFailure: false,
};
describe("B2B proposed contract — review-only, no authorization or remote effects", () => {
  it("separates commercial owner A from explicitly reviewed candidate identity P", () => {
    expect(candidate.actorTenant).not.toBe(candidate.userTenant);
    expect(readyForReview(candidate)).toBe(true);
    expect(readyForReview({...candidate, userTenant: "A"})).toBe(false);
  });
  it.each<[string, Partial<Review>]>([
    ["foreign partner", {owner: "B"}], ["orphan partner", {owner: null}],
    ["inactive partner", {partnerActive: false}], ["inactive actor", {actorActive: false}],
    ["foreign user", {userTenant: "B"}], ["inactive user", {userActive: false}],
    ["extra role", {roles: ["parceiro_b2b", "administrador"]}],
    ["reserved role", {roles: ["superadmin"]}], ["duplicate link", {linkCount: 1}],
    ["old session", {freshSession: false}], ["missing entitlement", {entitled: false}],
    ["cancelled", {cancelled: true}], ["partial failure without compensation", {partialFailure: true}],
  ])("rejects review: %s", (_label, patch) => {
    expect(readyForReview({...candidate, ...patch})).toBe(false);
  });
  it("requires explicit compensation evidence after partial failure", () => {
    expect(readyForReview({...candidate, partialFailure: true, compensated: true})).toBe(true);
    expect(readyForReview({...candidate, partialFailure: true, compensated: false})).toBe(false);
  });
});