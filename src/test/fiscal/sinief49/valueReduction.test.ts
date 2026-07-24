import { describe, test, expect } from "vitest";
import {
  buildValueQuantityReductionDraft,
  SINIEF_ERROR_CODES as E,
  type ValueQuantityReductionInput,
  type OriginalInvoiceContext,
} from "@/lib/fiscal/sinief49";

const KEY = "3".repeat(44);
const RECIPIENT = { kind: "EXTERNAL" as const, cnpj: "98765432000188" };

const originalCtx: OriginalInvoiceContext = {
  originalAccessKey: KEY,
  originalRecipient: RECIPIENT,
  originalItems: [
    { sequence: 1, originalQuantity: 10, originalValue: 200, remainingQuantity: 10, remainingValue: 200 },
  ],
};

function baseInput(over: Partial<ValueQuantityReductionInput> = {}): ValueQuantityReductionInput {
  return {
    operationType: "VALUE_QUANTITY_REDUCTION",
    issuerCnpj: "12345678000199",
    taxSetupApproval: { approved: true },
    original: originalCtx,
    items: [
      {
        sequence: 1,
        sourceKind: "PRODUCT",
        sourceId: "p1",
        description: "x",
        quantity: 3,
        unitValue: 20,
        cfop: "1949",
        itemReferences: [
          {
            referenceType: "REDUCTION_ITEM",
            referencedAccessKey: KEY,
            referencedItemSequence: 1,
            referencedQuantity: 3,
            referencedValue: 60,
          },
        ],
      },
    ],
    ...over,
  };
}

describe("SINIEF VALUE_QUANTITY_REDUCTION", () => {
  test("caminho feliz: IN/finNFe=5/tpNFCredito=04/refs por item", () => {
    const r = buildValueQuantityReductionDraft(baseInput());
    expect(r.ok).toBe(true);
    expect(r.draft?.direction).toBe("IN");
    expect(r.draft?.finNFe).toBe(5);
    expect(r.draft?.tpNFCredito).toBe("04");
    expect(r.draft?.documentReferences[0].relationType).toBe("REDUCTION_OF");
    expect(r.draft?.recipient).toMatchObject(RECIPIENT);
  });

  test("bloqueia sem referência original", () => {
    const bad = {
      ...baseInput(),
      original: undefined,
    } as unknown as ValueQuantityReductionInput;
    const r = buildValueQuantityReductionDraft(bad);
    expect(r.issues.map((i) => i.code)).toContain(E.REDUCTION_ORIGINAL_REF_MISSING);
  });

  test("bloqueia item sem DFeReferenciado", () => {
    const r = buildValueQuantityReductionDraft(
      baseInput({
        items: [
          {
            sequence: 1,
            sourceKind: "PRODUCT",
            sourceId: "p1",
            description: "x",
            quantity: 1,
            unitValue: 10,
            cfop: "1949",
          },
        ],
      }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.REDUCTION_ITEM_REF_MISSING);
  });

  test("bloqueia quantidade acumulada acima do original", () => {
    const r = buildValueQuantityReductionDraft(
      baseInput({
        items: [
          {
            sequence: 1,
            sourceKind: "PRODUCT",
            sourceId: "p1",
            description: "x",
            quantity: 99,
            unitValue: 20,
            cfop: "1949",
            itemReferences: [
              {
                referenceType: "REDUCTION_ITEM",
                referencedAccessKey: KEY,
                referencedItemSequence: 1,
                referencedQuantity: 99,
                referencedValue: 50,
              },
            ],
          },
        ],
      }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.REDUCTION_QUANTITY_EXCEEDS_ORIGINAL);
  });

  test("bloqueia valor acima do saldo", () => {
    const r = buildValueQuantityReductionDraft(
      baseInput({
        items: [
          {
            sequence: 1,
            sourceKind: "PRODUCT",
            sourceId: "p1",
            description: "x",
            quantity: 1,
            unitValue: 999,
            cfop: "1949",
            itemReferences: [
              {
                referenceType: "REDUCTION_ITEM",
                referencedAccessKey: KEY,
                referencedItemSequence: 1,
                referencedQuantity: 1,
                referencedValue: 999,
              },
            ],
          },
        ],
      }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.REDUCTION_VALUE_EXCEEDS_ORIGINAL);
  });

  test("bloqueia quantidade zero/negativa (regra comum)", () => {
    const r = buildValueQuantityReductionDraft(
      baseInput({
        items: [
          {
            sequence: 1,
            sourceKind: "PRODUCT",
            sourceId: "p1",
            description: "x",
            quantity: 0,
            unitValue: 10,
            cfop: "1949",
            itemReferences: [
              {
                referenceType: "REDUCTION_ITEM",
                referencedAccessKey: KEY,
                referencedItemSequence: 1,
                referencedQuantity: 1,
                referencedValue: 10,
              },
            ],
          },
        ],
      }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.ITEM_QUANTITY_NON_POSITIVE);
  });
});
