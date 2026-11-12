import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/fiscal/eligibilityDiagnostic";
import { economicApprovalsComplete, economicOperationalPending } from "@/lib/fiscal/orderEconomicStatus";

const ID = "11111111-2222-4333-8444-555555555555";
const payload = { orderId: ID, eligible: false, reasons: [{ code: "C2_ACCOUNTING_PENDING" }], economicDiagnosis: {
  available: true, commercial_explicit: true, credit_explicit: true, operational_blocked: true,
} };
describe("diagnóstico econômico não concede liberação", () => {
  it("duas aprovações explícitas mostram eixo econômico concluído preservando bloqueio e reason", () => {
    const d = summarize("2-args", "PARTNER_ORDER", ID, payload, null);
    expect(economicOperationalPending(d)).toBe(true);
    expect(d.eligible).toBe(false);
    expect(d.codes).toEqual(["C2_ACCOUNTING_PENDING"]);
  });
  it.each([[false, false], [true, false], [false, true]])("uma aprovação ou nenhuma não representa conclusão %s/%s", (commercial, credit) => {
    const d = summarize("2-args", "PARTNER_ORDER", ID, { ...payload, economicDiagnosis: { ...payload.economicDiagnosis, commercial_explicit: commercial, credit_explicit: credit } }, null);
    expect(economicApprovalsComplete(d)).toBe(false);
    expect(economicOperationalPending(d)).toBe(false);
  });
  it("outra empresa/pedido, negação e diagnóstico indisponível não adotam aprovação", () => {
    expect(economicOperationalPending(summarize("2-args", "PARTNER_ORDER", "foreign", payload, null))).toBe(false);
    expect(economicOperationalPending(summarize("2-args", "PARTNER_ORDER", ID, payload, { code: "42501" }))).toBe(false);
    expect(economicOperationalPending(summarize("2-args", "PARTNER_ORDER", ID, { ...payload, economicDiagnosis: { ...payload.economicDiagnosis, available: false } }, null))).toBe(false);
  });
  it("eligible e diagnóstico operacional continuam independentes das aprovações", () => {
    const eligible = summarize("2-args", "PARTNER_ORDER", ID, { ...payload, eligible: true }, null);
    expect(economicApprovalsComplete(eligible)).toBe(true);
    expect(economicOperationalPending(eligible)).toBe(false);
    expect(economicOperationalPending(summarize("2-args", "PARTNER_ORDER", ID, { ...payload, economicDiagnosis: { ...payload.economicDiagnosis, operational_blocked: false } }, null))).toBe(false);
  });
});