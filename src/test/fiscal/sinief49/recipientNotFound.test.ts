import { describe, test, expect } from "vitest";
import {
  buildRecipientNotFoundDraft,
  SINIEF_ERROR_CODES as E,
  type RecipientNotFoundInput,
  type OriginalInvoiceContext,
} from "@/lib/fiscal/sinief49";

const KEY = "5".repeat(44);
const RECIPIENT = { kind: "EXTERNAL" as const, cnpj: "22233344000155" };

const originalCtx: OriginalInvoiceContext = {
  originalAccessKey: KEY,
  originalRecipient: RECIPIENT,
  originalItems: [
    { sequence: 1, originalQuantity: 4, originalValue: 80, remainingQuantity: 4, remainingValue: 80 },
  ],
};

function base(over: Partial<RecipientNotFoundInput> = {}): RecipientNotFoundInput {
  return {
    operationType: "RECIPIENT_NOT_FOUND",
    issuerCnpj: "12345678000199",
    taxSetupApproval: { approved: true },
    original: originalCtx,
    deliveryAttempts: [
      { attemptedAt: "2026-08-04T10:00:00Z", channel: "CARRIER", proofReference: "AWB-9" },
    ],
    items: [
      {
        sequence: 1,
        sourceKind: "PRODUCT",
        sourceId: "p1",
        description: "x",
        quantity: 4,
        unitValue: 20,
        cfop: "1202",
      },
    ],
    ...over,
  };
}

describe("SINIEF RECIPIENT_NOT_FOUND", () => {
  test("caminho feliz: IN/finNFe=5/tpNFCredito=03/evidência", () => {
    const r = buildRecipientNotFoundDraft(base());
    expect(r.ok).toBe(true);
    expect(r.draft?.tpNFCredito).toBe("03");
    expect(r.draft?.documentReferences[0].relationType).toBe("RECIPIENT_NOT_FOUND_OF");
    expect(r.draft?.recipient).toMatchObject(RECIPIENT);
  });

  test("bloqueia sem tentativas/evidência", () => {
    const r = buildRecipientNotFoundDraft(base({ deliveryAttempts: [] }));
    expect(r.issues.map((i) => i.code)).toContain(E.RECIPIENT_NOT_FOUND_EVIDENCE_MISSING);
  });

  test("evidência com campos vazios não conta", () => {
    const r = buildRecipientNotFoundDraft(
      base({ deliveryAttempts: [{ attemptedAt: "2026-08-04", channel: "", proofReference: "" }] }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.RECIPIENT_NOT_FOUND_EVIDENCE_MISSING);
  });

  test("bloqueia se algum item ficar de fora", () => {
    const r = buildRecipientNotFoundDraft(
      base({
        items: [
          {
            sequence: 1,
            sourceKind: "PRODUCT",
            sourceId: "p1",
            description: "x",
            quantity: 1,
            unitValue: 20,
            cfop: "1202",
          },
        ],
      }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.REFUSAL_ITEMS_INCOMPLETE_FOR_TOTAL);
  });
});
