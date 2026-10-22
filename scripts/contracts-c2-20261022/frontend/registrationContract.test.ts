import { expect, it } from "vitest";
import { validateMultiProfileRegistration } from "./registrationContract";
import type { Capability } from "./partnerLifecycle";
const id = "00000000-0000-4000-8000-000000000001";
const draft = { organizationId: id, partnerId: id, roles: ["parceiro_b2b", "parceiro_b2b_tecnico"] as Capability[], clientIds: [], farmIds: [] };
it("draft offers two external profiles without internal authority", () => expect(validateMultiProfileRegistration(draft)).toBeNull());
it("producer draft needs explicit client and farm references, UUID is not authorization", () => expect(validateMultiProfileRegistration({ ...draft, roles: [...draft.roles, "cliente_produtor"] })).toBe("c2_producer_link_required"));
it("does not silently accept absent organization", () => expect(validateMultiProfileRegistration({ ...draft, organizationId: "" })).toBe("c2_invalid_registration"));