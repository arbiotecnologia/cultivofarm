import { describe, test, expect } from "vitest";
import {
  buildStockLossDraft,
  SINIEF_ERROR_CODES as E,
  SINIEF_NAT_OP,
  type StockLossInput,
} from "@/lib/fiscal/sinief49";

const ISSUER = "12345678000199";

function baseInput(over: Partial<StockLossInput> = {}): StockLossInput {
  return {
    operationType: "STOCK_LOSS",
    issuerCnpj: ISSUER,
    icmsApprovalState: "APPROVED_BY_ACCOUNTING",
    taxSetupApproval: { approved: true },
    stockLossContext: {
      legalReasonCategory: "PERISHMENT",
      legalReasonDetails: "Lote vencido em armazém.",
      loteId: "lote-1",
    },
    items: [
      {
        sequence: 1,
        sourceKind: "PRODUCT",
        sourceId: "p1",
        description: "x",
        quantity: 5,
        unitValue: 10,
        cfop: "5927",
      },
    ],
    ...over,
  };
}

describe("SINIEF STOCK_LOSS", () => {
  test("caminho feliz: OUT/finNFe=6/tpNFDebito=07/CFOP 5927/destinatário=emitente", () => {
    const r = buildStockLossDraft(baseInput());
    expect(r.ok).toBe(true);
    expect(r.draft?.finNFe).toBe(6);
    expect(r.draft?.tpNFDebito).toBe("07");
    expect(r.draft?.natureOperation).toBe(SINIEF_NAT_OP.STOCK_LOSS);
    expect(r.draft?.recipient).toMatchObject({ kind: "EXTERNAL", cnpj: ISSUER });
    expect(r.draft?.stockLossContext?.legalReasonCategory).toBe("PERISHMENT");
    expect(r.draft?.icmsApprovalState).toBe("APPROVED_BY_ACCOUNTING");
  });

  test("bloqueia sem justificativa", () => {
    const r = buildStockLossDraft(
      baseInput({
        stockLossContext: { legalReasonCategory: "LOSS", legalReasonDetails: "   " },
      }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.STOCK_LOSS_JUSTIFICATION_MISSING);
  });

  test("bloqueia categoria inválida", () => {
    const r = buildStockLossDraft(
      baseInput({
        stockLossContext: {
          legalReasonCategory: "INVENTED" as unknown as "LOSS",
          legalReasonDetails: "x",
        },
      }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.STOCK_LOSS_REASON_INVALID);
  });

  test("bloqueia CFOP diferente de 5927", () => {
    const r = buildStockLossDraft(
      baseInput({ items: [{ ...baseInput().items[0], cfop: "5102" }] }),
    );
    expect(r.issues.map((i) => i.code)).toContain(E.ITEM_CFOP_INVALID_FOR_SCENARIO);
  });

  test("ICMS pendente é permitido apenas como BLOCKED_PENDING_ACCOUNTING (explícito)", () => {
    const r = buildStockLossDraft(
      baseInput({ icmsApprovalState: "BLOCKED_PENDING_ACCOUNTING" }),
    );
    expect(r.ok).toBe(true);
    expect(r.draft?.icmsApprovalState).toBe("BLOCKED_PENDING_ACCOUNTING");
  });

  test("bloqueia sem estado de ICMS explícito", () => {
    const bad = { ...baseInput(), icmsApprovalState: undefined } as unknown as StockLossInput;
    const r = buildStockLossDraft(bad);
    expect(r.issues.map((i) => i.code)).toContain(E.ICMS_STATE_REQUIRED_EXPLICIT);
  });
});
