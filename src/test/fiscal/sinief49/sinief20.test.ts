/**
 * Fase SINIEF 4.0.2.1 — Testes puros SINIEF 20/2026:
 *   1. ICMS somente quando devido (icms.amount > 0 requer icms.due=true).
 *   2. VALUE_QUANTITY_REDUCTION: snapshot IMUTÁVEL e EXPLÍCITO do destinatário
 *      original é OBRIGATÓRIO — nunca derivado; sem `new Date()`; sem
 *      UUID interno como cnpjCpf.
 *   3. Idempotência: mesmo input → mesmo draft (draft.idempotencyKey estável).
 */
import { describe, test, expect } from "vitest";
import {
  buildDraft,
  buildValueQuantityReductionDraft,
  SINIEF_ERROR_CODES as E,
  type ValueQuantityReductionInput,
  type OriginalInvoiceContext,
  type OriginalRecipientSnapshot,
  type AdvancePaymentInput,
} from "@/lib/fiscal/sinief49";

const KEY = "3".repeat(44);
const EXT = { kind: "EXTERNAL" as const, cnpj: "98765432000188", name: "X" };

const VALID_SNAPSHOT: OriginalRecipientSnapshot = {
  kind: "EXTERNAL",
  cnpjCpf: "98765432000188",
  name: "Original",
  capturedAt: "2026-08-08T00:00:00Z",
  source: "xml.dest",
};

const originalCtx: OriginalInvoiceContext = {
  originalAccessKey: KEY,
  originalRecipient: EXT,
  originalItems: [
    { sequence: 1, originalQuantity: 10, originalValue: 200, remainingQuantity: 10, remainingValue: 200 },
  ],
  originalRecipientSnapshot: VALID_SNAPSHOT,
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
      quantity: 1, unitValue: 10, cfop: "5922",
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

  test("rejeita amount negativo/invalido", () => {
    const r = buildDraft(advanceInput({ due: true, amount: -1 }));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain(E.ICMS_AMOUNT_INVALID);
  });

  test("aceita ausencia de icms (null no draft)", () => {
    const r = buildDraft(advanceInput());
    expect(r.ok).toBe(true);
    expect(r.draft?.icms).toBeNull();
  });
});

describe("SINIEF 20/2026 · snapshot do destinatario original", () => {
  test("VALUE_QUANTITY_REDUCTION rejeita ausencia de snapshot (sem derivacao)", () => {
    const { originalRecipientSnapshot: _s, ...ctxSemSnap } = originalCtx;
    void _s;
    const r = buildValueQuantityReductionDraft(reductionInput({
      original: ctxSemSnap,
    }));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain(
      E.REDUCTION_ORIGINAL_RECIPIENT_SNAPSHOT_REQUIRED,
    );
  });

  test("rejeita snapshot com cnpjCpf vazio", () => {
    const bad: OriginalRecipientSnapshot = { ...VALID_SNAPSHOT, cnpjCpf: "" };
    const r = buildValueQuantityReductionDraft(reductionInput({
      original: { ...originalCtx, originalRecipientSnapshot: bad },
    }));
    expect(r.issues.map((i) => i.code)).toContain(
      E.REDUCTION_ORIGINAL_RECIPIENT_SNAPSHOT_REQUIRED,
    );
  });

  test("rejeita snapshot com source vazio", () => {
    const bad: OriginalRecipientSnapshot = { ...VALID_SNAPSHOT, source: "" };
    const r = buildValueQuantityReductionDraft(reductionInput({
      original: { ...originalCtx, originalRecipientSnapshot: bad },
    }));
    expect(r.issues.map((i) => i.code)).toContain(
      E.REDUCTION_ORIGINAL_RECIPIENT_SNAPSHOT_REQUIRED,
    );
  });

  test("rejeita snapshot com capturedAt invalido", () => {
    const bad: OriginalRecipientSnapshot = { ...VALID_SNAPSHOT, capturedAt: "hoje" };
    const r = buildValueQuantityReductionDraft(reductionInput({
      original: { ...originalCtx, originalRecipientSnapshot: bad },
    }));
    expect(r.issues.map((i) => i.code)).toContain(
      E.REDUCTION_ORIGINAL_RECIPIENT_SNAPSHOT_REQUIRED,
    );
  });

  test("preserva snapshot explicito quando fornecido", () => {
    const r = buildValueQuantityReductionDraft(reductionInput());
    expect(r.ok).toBe(true);
    expect(r.draft?.originalRecipientSnapshot).toEqual(VALID_SNAPSHOT);
  });

  test("PartyRef INTERNAL sem snapshot fiscal resolvido → snapshot obrigatorio", () => {
    const { originalRecipientSnapshot: _s, ...ctxSemSnap } = originalCtx;
    void _s;
    const r = buildValueQuantityReductionDraft(reductionInput({
      original: {
        ...ctxSemSnap,
        originalRecipient: { kind: "INTERNAL", id: "00000000-0000-4000-8000-000000000001" },
      },
    }));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain(
      E.REDUCTION_ORIGINAL_RECIPIENT_SNAPSHOT_REQUIRED,
    );
  });

  test("outros cenarios nao exigem snapshot (fica null)", () => {
    const r = buildDraft(advanceInput());
    expect(r.ok).toBe(true);
    expect(r.draft?.originalRecipientSnapshot).toBeNull();
  });
});

describe("SINIEF 20/2026 · idempotencia determinista", () => {
  test("mesmo input → mesmo idempotencyKey e mesmo draft (reducao)", () => {
    const a = buildValueQuantityReductionDraft(reductionInput());
    const b = buildValueQuantityReductionDraft(reductionInput());
    expect(a.ok && b.ok).toBe(true);
    expect(a.draft?.idempotencyKey).toBe(b.draft?.idempotencyKey);
    expect(JSON.stringify(a.draft)).toBe(JSON.stringify(b.draft));
  });

  test("mesmo input com ICMS → mesmo idempotencyKey (antecipacao)", () => {
    const a = buildDraft(advanceInput({ due: true, amount: 1.23 }));
    const b = buildDraft(advanceInput({ due: true, amount: 1.23 }));
    expect(a.ok && b.ok).toBe(true);
    expect(a.draft?.idempotencyKey).toBe(b.draft?.idempotencyKey);
  });
});
