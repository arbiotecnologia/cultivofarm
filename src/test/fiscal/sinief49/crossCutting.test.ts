import { describe, test, expect } from "vitest";
import {
  buildAdvancePaymentDraft,
  buildDraft,
  buildIdempotencyKey,
  SINIEF_ERROR_CODES as E,
  SINIEF_LEGAL_BASIS,
  SINIEF_LEGAL_EFFECTIVE_DATE,
  SINIEF_OPERATION_TYPES,
  type AdvancePaymentInput,
  type SinefScenarioInput,
} from "@/lib/fiscal/sinief49";
import { __internal as idem } from "@/lib/fiscal/sinief49/idempotency";

function goodAdvance(): AdvancePaymentInput {
  return {
    operationType: "ADVANCE_PAYMENT",
    issuerCnpj: "12345678000199",
    recipient: { kind: "EXTERNAL", cnpj: "98765432000188" },
    orderId: "ORD-42",
    expectedDeliveryDate: "2026-09-01",
    taxSetupApproval: { approved: true, uf: "SP", taxRegime: "SIMPLES_NACIONAL" },
    items: [
      { sequence: 1, sourceKind: "PRODUCT", sourceId: "p1", description: "x", quantity: 2, unitValue: 50, cfop: "5922" },
    ],
  };
}

describe("SINIEF — invariantes transversais", () => {
  test("canTransmit é sempre false e o tipo o garante", () => {
    for (const op of SINIEF_OPERATION_TYPES) {
      // baseline: cenários exigem inputs específicos; usamos ADVANCE para o positivo
      if (op === "ADVANCE_PAYMENT") {
        const r = buildAdvancePaymentDraft(goodAdvance());
        expect(r.draft?.canTransmit).toBe(false);
      }
    }
  });

  test("legal metadata fixa (basis + effectiveDate)", () => {
    const r = buildAdvancePaymentDraft(goodAdvance());
    expect(r.draft?.legal.basis).toBe(SINIEF_LEGAL_BASIS);
    expect(r.draft?.legal.effectiveDate).toBe(SINIEF_LEGAL_EFFECTIVE_DATE);
    expect(SINIEF_LEGAL_BASIS).toBe("Ajuste SINIEF 49/2025 consolidado");
    expect(SINIEF_LEGAL_EFFECTIVE_DATE).toBe("2026-08-03");
  });

  test("idempotencyKey é determinística para inputs iguais", () => {
    const a = buildAdvancePaymentDraft(goodAdvance());
    const b = buildAdvancePaymentDraft(goodAdvance());
    expect(a.draft?.idempotencyKey).toBe(b.draft?.idempotencyKey);
    // Mudança material altera a chave
    const c = buildAdvancePaymentDraft({ ...goodAdvance(), orderId: "ORD-99" });
    expect(a.draft?.idempotencyKey).not.toBe(c.draft?.idempotencyKey);
  });

  test("stableStringify ordena chaves independente da ordem de inserção", () => {
    const x = idem.stableStringify({ b: 1, a: [3, { z: 1, y: 2 }] });
    const y = idem.stableStringify({ a: [3, { y: 2, z: 1 }], b: 1 });
    expect(x).toBe(y);
  });

  test("buildIdempotencyKey usa prefixo canônico", () => {
    const k = buildIdempotencyKey("STOCK_LOSS", { source: "STOCK_EVENT", sourceId: "abc" }, { x: 1 });
    expect(k).toMatch(/^SINIEF49:STOCK_LOSS:STOCK_EVENT:abc:[0-9a-f]{8}$/);
  });

  test("input não é mutado pelo builder", () => {
    const input = goodAdvance();
    const snapshot = JSON.stringify(input);
    buildAdvancePaymentDraft(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  test("output do builder é profundamente imutável", () => {
    const r = buildAdvancePaymentDraft(goodAdvance());
    expect(Object.isFrozen(r.draft)).toBe(true);
    expect(Object.isFrozen(r.draft?.items)).toBe(true);
    expect(Object.isFrozen(r.draft?.items[0])).toBe(true);
    expect(() => {
      (r.draft as unknown as { canTransmit: boolean }).canTransmit = true;
    }).toThrow();
  });

  test("NFS-e (SERVICE) é rejeitada em qualquer cenário", () => {
    const r = buildAdvancePaymentDraft({
      ...goodAdvance(),
      items: [
        { sequence: 1, sourceKind: "SERVICE", sourceId: "svc", description: "x", quantity: 1, unitValue: 10, cfop: "5933" },
      ],
    });
    expect(r.issues.map((i) => i.code)).toContain(E.SERVICE_ITEM_REJECTED);
  });

  test("microrganismo pode faturar direto sem product_id", () => {
    const r = buildAdvancePaymentDraft({
      ...goodAdvance(),
      items: [
        { sequence: 1, sourceKind: "MICROORGANISM", sourceId: "micro-1", description: "Bacillus", quantity: 1, unitValue: 100, cfop: "5922" },
      ],
    });
    expect(r.ok).toBe(true);
    // Nenhum "product_id" foi exigido ou preenchido a partir de vínculo canônico.
    expect(r.draft?.items[0].sourceKind).toBe("MICROORGANISM");
  });

  test("aprovação tributária ausente é gate bloqueante (nunca default)", () => {
    const bad = { ...goodAdvance(), taxSetupApproval: { approved: false } };
    const r = buildAdvancePaymentDraft(bad);
    expect(r.issues.map((i) => i.code)).toContain(E.TAX_SETUP_NOT_APPROVED);
  });

  test("sequência duplicada é bloqueada", () => {
    const r = buildAdvancePaymentDraft({
      ...goodAdvance(),
      items: [
        { sequence: 1, sourceKind: "PRODUCT", sourceId: "a", description: "a", quantity: 1, unitValue: 1, cfop: "5922" },
        { sequence: 1, sourceKind: "PRODUCT", sourceId: "b", description: "b", quantity: 1, unitValue: 1, cfop: "5922" },
      ],
    });
    expect(r.issues.map((i) => i.code)).toContain(E.ITEM_SEQUENCE_DUPLICATE);
  });

  test("dispatcher buildDraft delega corretamente", () => {
    const r = buildDraft(goodAdvance() as SinefScenarioInput);
    expect(r.ok).toBe(true);
    expect(r.draft?.operationType).toBe("ADVANCE_PAYMENT");
  });

  test("nenhuma mensagem contém SQL ou segredo aparente", () => {
    const r = buildAdvancePaymentDraft({ ...goodAdvance(), issuerCnpj: "" });
    for (const iss of r.issues) {
      expect(iss.message).not.toMatch(/SELECT |INSERT |UPDATE |DELETE |password|secret|token/i);
    }
  });
});
