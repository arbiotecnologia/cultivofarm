import { describe, test, expect } from "vitest";
import {
  buildEffectiveSaleAfterAdvanceDraft,
  SINIEF_ERROR_CODES as E,
  type EffectiveSaleInput,
} from "@/lib/fiscal/sinief49";

const KEY_A = "1".repeat(44);
const KEY_B = "2".repeat(44);

function baseInput(over: Partial<EffectiveSaleInput> = {}): EffectiveSaleInput {
  return {
    operationType: "EFFECTIVE_SALE_AFTER_ADVANCE",
    issuerCnpj: "12345678000199",
    recipient: { kind: "EXTERNAL", cnpj: "98765432000188" },
    icmsApprovalState: "APPROVED_BY_ACCOUNTING",
    taxSetupApproval: { approved: true },
    advanceReferences: [
      { advanceAccessKey: KEY_A, remainingValue: 500 },
    ],
    items: [
      {
        sequence: 1,
        sourceKind: "PRODUCT",
        sourceId: "p1",
        description: "Item",
        quantity: 2,
        unitValue: 100,
        cfop: "5102",
      },
    ],
    ...over,
  };
}

describe("SINIEF EFFECTIVE_SALE_AFTER_ADVANCE", () => {
  test("caminho feliz: OUT/finNFe=1/ICMS explícito/refs válidas", () => {
    const r = buildEffectiveSaleAfterAdvanceDraft(baseInput());
    expect(r.ok).toBe(true);
    expect(r.draft?.finNFe).toBe(1);
    expect(r.draft?.tpNFDebito).toBeNull();
    expect(r.draft?.icmsApprovalState).toBe("APPROVED_BY_ACCOUNTING");
    expect(r.draft?.documentReferences[0]).toMatchObject({
      relationType: "EFFECTIVE_SALE_OF",
      referencedAccessKey: KEY_A,
    });
  });

  test("exige ao menos uma referência de antecipação", () => {
    const r = buildEffectiveSaleAfterAdvanceDraft(baseInput({ advanceReferences: [] }));
    expect(r.issues.map((i) => i.code)).toContain(E.EFFECTIVE_REFERENCE_MISSING);
  });

  test("bloqueia duplicidade de referência", () => {
    const r = buildEffectiveSaleAfterAdvanceDraft(
      baseInput({
        advanceReferences: [
          { advanceAccessKey: KEY_A, remainingValue: 500 },
          { advanceAccessKey: KEY_A, remainingValue: 300 },
        ],
      }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.EFFECTIVE_REFERENCE_DUPLICATE);
  });

  test("bloqueia consumo acima do saldo somado das antecipações", () => {
    const r = buildEffectiveSaleAfterAdvanceDraft(
      baseInput({
        advanceReferences: [
          { advanceAccessKey: KEY_A, remainingValue: 100 },
          { advanceAccessKey: KEY_B, remainingValue: 50 },
        ],
        items: [
          {
            sequence: 1,
            sourceKind: "PRODUCT",
            sourceId: "p",
            description: "x",
            quantity: 10,
            unitValue: 20,
            cfop: "5102",
          },
        ],
      }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.EFFECTIVE_EXCEEDS_ADVANCE_BALANCE);
  });

  test("bloqueia chave de acesso inválida", () => {
    const r = buildEffectiveSaleAfterAdvanceDraft(
      baseInput({ advanceReferences: [{ advanceAccessKey: "123", remainingValue: 100 }] }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.ACCESS_KEY_INVALID);
  });

  test("bloqueia sem ICMS explícito", () => {
    const inp = baseInput();
    const bad = { ...inp, icmsApprovalState: undefined } as unknown as EffectiveSaleInput;
    const r = buildEffectiveSaleAfterAdvanceDraft(bad);
    expect(r.issues.map((i) => i.code)).toContain(E.ICMS_STATE_REQUIRED_EXPLICIT);
  });
});
