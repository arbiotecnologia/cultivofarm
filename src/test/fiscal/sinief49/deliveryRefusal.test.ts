import { describe, test, expect } from "vitest";
import {
  buildDeliveryRefusalTotalDraft,
  buildDeliveryRefusalPartialDraft,
  SINIEF_ERROR_CODES as E,
  type DeliveryRefusalTotalInput,
  type DeliveryRefusalPartialInput,
  type OriginalInvoiceContext,
} from "@/lib/fiscal/sinief49";

const KEY = "4".repeat(44);
const RECIPIENT = { kind: "EXTERNAL" as const, cnpj: "11122233000144" };

const originalCtx: OriginalInvoiceContext = {
  originalAccessKey: KEY,
  originalRecipient: RECIPIENT,
  originalItems: [
    { sequence: 1, originalQuantity: 5, originalValue: 100, remainingQuantity: 5, remainingValue: 100 },
    { sequence: 2, originalQuantity: 3, originalValue: 60, remainingQuantity: 3, remainingValue: 60 },
  ],
};

describe("SINIEF DELIVERY_REFUSAL_TOTAL", () => {
  test("caminho feliz: IN/finNFe=5/tpNFCredito=03/todos itens", () => {
    const input: DeliveryRefusalTotalInput = {
      operationType: "DELIVERY_REFUSAL_TOTAL",
      issuerCnpj: "12345678000199",
      taxSetupApproval: { approved: true },
      original: originalCtx,
      items: [
        { sequence: 1, sourceKind: "PRODUCT", sourceId: "p1", description: "a", quantity: 5, unitValue: 20, cfop: "1202" },
        { sequence: 2, sourceKind: "PRODUCT", sourceId: "p2", description: "b", quantity: 3, unitValue: 20, cfop: "1202" },
      ],
    };
    const r = buildDeliveryRefusalTotalDraft(input);
    expect(r.ok).toBe(true);
    expect(r.draft?.tpNFCredito).toBe("03");
    expect(r.draft?.documentReferences[0].relationType).toBe("TOTAL_REFUSAL_OF");
  });

  test("bloqueia se algum item do original ficar de fora", () => {
    const input: DeliveryRefusalTotalInput = {
      operationType: "DELIVERY_REFUSAL_TOTAL",
      issuerCnpj: "12345678000199",
      taxSetupApproval: { approved: true },
      original: originalCtx,
      items: [
        { sequence: 1, sourceKind: "PRODUCT", sourceId: "p1", description: "a", quantity: 5, unitValue: 20, cfop: "1202" },
      ],
    };
    const r = buildDeliveryRefusalTotalDraft(input);
    expect(r.issues.map((i) => i.code)).toContain(E.REFUSAL_ITEMS_INCOMPLETE_FOR_TOTAL);
  });

  test("bloqueia referência original ausente/inválida", () => {
    const input = {
      operationType: "DELIVERY_REFUSAL_TOTAL" as const,
      issuerCnpj: "12345678000199",
      taxSetupApproval: { approved: true },
      original: { ...originalCtx, originalAccessKey: "123" },
      items: [],
    };
    const r = buildDeliveryRefusalTotalDraft(input);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain(E.ACCESS_KEY_INVALID);
  });
});

describe("SINIEF DELIVERY_REFUSAL_PARTIAL", () => {
  const base: DeliveryRefusalPartialInput = {
    operationType: "DELIVERY_REFUSAL_PARTIAL",
    issuerCnpj: "12345678000199",
    taxSetupApproval: { approved: true },
    original: originalCtx,
    items: [
      {
        sequence: 1,
        sourceKind: "PRODUCT",
        sourceId: "p1",
        description: "a",
        quantity: 2,
        unitValue: 20,
        cfop: "1202",
        itemReferences: [
          {
            referenceType: "PARTIAL_REFUSAL_ITEM",
            referencedAccessKey: KEY,
            referencedItemSequence: 1,
            referencedQuantity: 2,
          },
        ],
      },
    ],
  };

  test("caminho feliz: tpNFCredito=06 + DFeReferenciado por item", () => {
    const r = buildDeliveryRefusalPartialDraft(base);
    expect(r.ok).toBe(true);
    expect(r.draft?.tpNFCredito).toBe("06");
    expect(r.draft?.documentReferences[0].relationType).toBe("PARTIAL_REFUSAL_OF");
  });

  test("bloqueia item sem DFeReferenciado", () => {
    const r = buildDeliveryRefusalPartialDraft({
      ...base,
      items: [{ ...base.items[0], itemReferences: [] }],
    });
    expect(r.issues.map((i) => i.code)).toContain(E.REFUSAL_PARTIAL_ITEM_REF_MISSING);
  });

  test("bloqueia quantidade recusada acima do saldo", () => {
    const r = buildDeliveryRefusalPartialDraft({
      ...base,
      items: [
        {
          ...base.items[0],
          quantity: 99,
          itemReferences: [
            {
              referenceType: "PARTIAL_REFUSAL_ITEM",
              referencedAccessKey: KEY,
              referencedItemSequence: 1,
              referencedQuantity: 99,
            },
          ],
        },
      ],
    });
    expect(r.issues.map((i) => i.code)).toContain(E.REFUSAL_PARTIAL_QUANTITY_EXCEEDS_BALANCE);
  });
});
