import { describe, expect, it } from "vitest";
import { confirmationAck, confirmationCapability, confirmationTimestamp } from "@/lib/entregas/deliveryConfirmationFlow";
const id = "11111111-1111-4111-8111-111111111111";
const scope = { actor: id, org: id, entrega: id };
const roots = { os: id, proof: id };
const cap = { capability: "delivery_confirmation_manual_v1", available: true, actor_id: id, organization_id: id, entrega_id: id, os_id: id, comprovante_id: id, updated_at: "2026-10-31T13:32:00.123456+00:00", status: "em_rota" };
const ack = { success: true, action: "confirm", replay: false, actor_id: id, organization_id: id, entrega_id: id, os_id: id, comprovante_id: id, updated_at: cap.updated_at, status: "entregue", os_status: "entregue", finalizada: false };
describe("Runtime confirmation envelopes", () => {
  it("accepts exact valid envelopes", () => { expect(confirmationAck(ack, scope, roots)).toBe(true); expect(confirmationCapability(cap, scope)).not.toBeNull(); });
  it.each(["os_id", "comprovante_id", "updated_at"])("rejects empty ACK %s", field => expect(confirmationAck({ ...ack, [field]: "" }, scope)).toBe(false));
  it("rejects empty capability timestamp", () => expect(confirmationCapability({ ...cap, updated_at: "" }, scope)).toBeNull());
  it.each(["", "bad", "2026-02-30T00:00:00Z", "2026-10-31", "2026-10-31T25:00:00Z", "infinity"])("rejects timestamp %s", value => expect(confirmationTimestamp(value)).toBe(false));
  it.each(["os_id", "comprovante_id"])("rejects malformed and different root %s", field => {
    expect(confirmationAck({ ...ack, [field]: "arbitrary" }, scope, roots)).toBe(false);
    expect(confirmationAck({ ...ack, [field]: "22222222-2222-4222-8222-222222222222" }, scope, roots)).toBe(false);
    expect(confirmationCapability({ ...cap, [field]: "" }, scope)).toBeNull();
  });
  it("rejects foreign organization", () => expect(confirmationAck({ ...ack, organization_id: "22222222-2222-4222-8222-222222222222" }, scope, roots)).toBe(false));
});