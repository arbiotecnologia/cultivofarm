import { describe, test, expect } from "vitest";
import {
  buildAdvancePaymentDraft,
  SINIEF_NAT_OP,
  SINIEF_ERROR_CODES as E,
  type AdvancePaymentInput,
} from "@/lib/fiscal/sinief49";

const OK_APPROVAL = { approved: true, uf: "SP", taxRegime: "SIMPLES_NACIONAL" };
const ISSUER = "12345678000199";

function baseInput(over: Partial<AdvancePaymentInput> = {}): AdvancePaymentInput {
  return {
    operationType: "ADVANCE_PAYMENT",
    issuerCnpj: ISSUER,
    recipient: { kind: "EXTERNAL", cnpj: "98765432000188", name: "Cliente X" },
    orderId: "ORDER-1",
    expectedDeliveryDate: "2026-08-30",
    taxSetupApproval: OK_APPROVAL,
    items: [
      {
        sequence: 1,
        sourceKind: "PRODUCT",
        sourceId: "prod-1",
        description: "Produto Teste",
        quantity: 10,
        unitValue: 25.5,
        cfop: "5922",
      },
    ],
    ...over,
  };
}

describe("SINIEF ADVANCE_PAYMENT", () => {
  test("caminho feliz OUT/finNFe=6/tpNFDebito=06/natOp/CFOP", () => {
    const r = buildAdvancePaymentDraft(baseInput());
    expect(r.ok).toBe(true);
    expect(r.draft?.direction).toBe("OUT");
    expect(r.draft?.finNFe).toBe(6);
    expect(r.draft?.tpNFDebito).toBe("06");
    expect(r.draft?.tpNFCredito).toBeNull();
    expect(r.draft?.natureOperation).toBe(SINIEF_NAT_OP.ADVANCE_PAYMENT);
    expect(r.draft?.items[0].totalValue).toBe(255);
    expect(r.draft?.canTransmit).toBe(false);
    expect(r.draft?.icmsApprovalState).toBeNull();
    expect(r.draft?.idempotencyKey).toMatch(/^SINIEF49:ADVANCE_PAYMENT:ORDER:ORDER-1:[0-9a-f]{8}$/);
  });

  test("bloqueia CFOP fora de 5922/6922", () => {
    const r = buildAdvancePaymentDraft(baseInput({ items: [{ ...baseInput().items[0], cfop: "5102" }] }));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain(E.ITEM_CFOP_INVALID_FOR_SCENARIO);
  });

  test("bloqueia movimento de estoque (loteId)", () => {
    const r = buildAdvancePaymentDraft(
      baseInput({ items: [{ ...baseInput().items[0], loteId: "lote-1" }] }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.ADVANCE_ITEM_MUST_NOT_MOVE_STOCK);
  });

  test("exige orderId e data prevista válida", () => {
    const r = buildAdvancePaymentDraft(baseInput({ orderId: "", expectedDeliveryDate: "amanhã" }));
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain(E.ADVANCE_ORDER_MISSING);
    expect(codes).toContain(E.ADVANCE_DELIVERY_DATE_INVALID);
  });

  test("bloqueia sem aprovação tributária", () => {
    const r = buildAdvancePaymentDraft(
      baseInput({ taxSetupApproval: { approved: false } }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.TAX_SETUP_NOT_APPROVED);
  });

  test("microrganismo direto sem product_id é aceito", () => {
    const r = buildAdvancePaymentDraft(
      baseInput({
        items: [
          {
            sequence: 1,
            sourceKind: "MICROORGANISM",
            sourceId: "micro-abc",
            description: "Trichoderma",
            quantity: 3,
            unitValue: 100,
            cfop: "6922",
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.draft?.items[0].sourceKind).toBe("MICROORGANISM");
  });
});
