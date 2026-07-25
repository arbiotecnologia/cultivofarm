/**
 * Fase SINIEF 4.0.2 — Testes puros SINIEF 20/2026:
 *   1. ICMS somente quando devido (icms.amount > 0 requer icms.due=true).
 *   2. VALUE_QUANTITY_REDUCTION: snapshot imutável do destinatário original
 *      é obrigatório; se não fornecido explicitamente, é derivado.
 */
import { describe, test, expect } from "vitest";
import {
  buildDraft,
  buildValueQuantityReductionDraft,
  SINIEF_ERROR_CODES as E,
  type ValueQuantityReductionInput,
  type OriginalInvoiceContext,
  type AdvancePaymentInput,
} from "@/lib/fiscal/sinief49";

const KEY = "3".repeat(44);
const EXT = { kind: "EXTERNAL" as const, cnpj: "98765432000188", name: "X" };

const originalCtx: OriginalInvoiceContext = {
  originalAccessKey: KEY,
  originalRecipient: EXT,
  originalItems: [
    { sequence: 1, originalQuantity: 10, originalValue: 200, remainingQuantity: 10, remainingValue: 200 },
  ],
};

function reductionInput(over: Partial<ValueQuantityReductionInput> = {}): ValueQuantityReductionInput {
  return {
    operationType: "VALUE_QUANTITY_REDUCTION",
    issuerCnpj: "12345678000199",
    taxSetupApproval: { approved: true },
    original: originalCtx,
    items: [{
      sequence: 1, sourceKind: "PRODUCT", sourceId: "p1", description: "x",
      quantity: 3, unitValue: 20, cfop: "1949",
      itemReferences: [{
        referenceType: "REDUCTION_ITEM", referencedAccessKey: KEY,
        referencedItemSequence: 1, referencedQuantity: 3, referencedValue: 60,
      }],
    }],
    ...over,
  };
}

function advanceInput(icms?: { due?: boolean; amount?: number }): AdvancePaymentInput {
  return {
    operationType: "ADVANCE_PAYMENT",
    issuerCnpj: "12345678000199",
    taxSetupApproval: { approved: true },
    recipient: EXT,
    orderId: "ORD-1",
    expectedDeliveryDate: "2026-09-01",
    items: [{
      sequence: 1, sourceKind: "PRODUCT", sourceId: "p1", description: "x",
      quantity: 1, unitValue: 10, cfop: "5949",
    }],
    ...(icms ? { icms } as Partial<AdvancePaymentInput> : {}),
  } as AdvancePaymentInput;
}

describe("SINIEF 20/2026 · ICMS somente quando devido", () => {
  test("aceita amount > 0 com due=true", () => {
    const r = buildDraft(advanceInput({ due: true, amount: 12.34 }));
    expect(r.ok).toBe(true);
    expect(r.draft?.icms).toEqual({ due: true, amount: 12.34 });
  });

  test("rejeita amount > 0 sem due=true", () => {
    const r = buildDraft(advanceInput({ due: false, amount: 5 }));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain(E.ICMS_AMOUNT_WITHOUT_DUE);
  });

  test("rejeita amount negativo/inválido", () => {
    const r = buildDraft(advanceInput({ due: true, amount: -1 }));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain(E.ICMS_AMOUNT_INVALID);
  });

  test("aceita ausência de icms (null no draft)", () => {
    const r = buildDraft(advanceInput());
    expect(r.ok).toBe(true);
    expect(r.draft?.icms).toBeNull();
  });
});

describe("SINIEF 20/2026 · snapshot do destinatário original", () => {
  test("VALUE_QUANTITY_REDUCTION deriva snapshot a partir do originalRecipient", () => {
    const r = buildValueQuantityReductionDraft(reductionInput());
    expect(r.ok).toBe(true);
    expect(r.draft?.originalRecipientSnapshot?.kind).toBe("EXTERNAL");
    expect(r.draft?.originalRecipientSnapshot?.cnpjCpf).toBe("98765432000188");
    expect(r.draft?.originalRecipientSnapshot?.source).toMatch(/derived|xml/);
    expect(typeof r.draft?.originalRecipientSnapshot?.capturedAt).toBe("string");
  });

  test("preserva snapshot explícito quando fornecido", () => {
    const snap = {
      kind: "EXTERNAL" as const, cnpjCpf: "98765432000188", name: "Original",
      capturedAt: "2026-08-08T00:00:00Z", source: "xml.dest",
    };
    const r = buildValueQuantityReductionDraft(reductionInput({
      original: { ...originalCtx, originalRecipientSnapshot: snap },
    }));
    expect(r.ok).toBe(true);
    expect(r.draft?.originalRecipientSnapshot).toEqual(snap);
  });

  test("outros cenários não exigem snapshot (fica null)", () => {
    const r = buildDraft(advanceInput());
    expect(r.ok).toBe(true);
    expect(r.draft?.originalRecipientSnapshot).toBeNull();
  });
});
