import { describe, expect, it } from "vitest";
import {
  mapDraftToInvoiceInsert,
  PERSISTENCE_MAPPER_ENABLED,
  tpNfCodeToSmallint,
} from "@/lib/fiscal/sinief49/persistenceMapper";
import { buildAdvancePaymentDraft } from "@/lib/fiscal/sinief49/builders";
import type { AdvancePaymentInput } from "@/lib/fiscal/sinief49/types";

describe("SINIEF 49/2025 · mapper futuro de persistência", () => {
  it("mapper está DESABILITADO por padrão", () => {
    expect(PERSISTENCE_MAPPER_ENABLED).toBe(false);
  });

  it("converte códigos textuais com zero à esquerda para smallint", () => {
    expect(tpNfCodeToSmallint("03")).toBe(3);
    expect(tpNfCodeToSmallint("04")).toBe(4);
    expect(tpNfCodeToSmallint("06")).toBe(6);
    expect(tpNfCodeToSmallint("07")).toBe(7);
    expect(tpNfCodeToSmallint(null)).toBeNull();
    expect(tpNfCodeToSmallint(undefined)).toBeNull();
    expect(tpNfCodeToSmallint("")).toBeNull();
  });

  it("rejeita códigos inválidos", () => {
    expect(() => tpNfCodeToSmallint("abc")).toThrow();
    expect(() => tpNfCodeToSmallint("9999")).toThrow();
    expect(() => tpNfCodeToSmallint(" 03 ")).toThrow();
  });

  it("preserva zero à esquerda no domínio; converte só no shape de persistência", () => {
    const input: AdvancePaymentInput = {
      operationType: "ADVANCE_PAYMENT",
      issuerCnpj: "12345678000199",
      taxSetupApproval: { approved: true },
      recipient: { kind: "EXTERNAL", cnpj: "98765432000188" },
      orderId: "PED-1",
      expectedDeliveryDate: "2026-09-01",
      items: [
        {
          sequence: 1,
          sourceKind: "PRODUCT",
          sourceId: "p1",
          description: "Semente",
          quantity: 1,
          unitValue: 10,
          cfop: "5922",
        },
      ],
    };
    const res = buildAdvancePaymentDraft(input);
    expect(res.ok).toBe(true);
    // Domínio mantém string "06".
    expect(res.draft?.tpNFDebito).toBe("06");
    // Persistência: enquanto a flag está desligada, o mapper falha explicitamente.
    expect(() => mapDraftToInvoiceInsert(res.draft!)).toThrow(
      /PERSISTENCE_MAPPER_ENABLED=false/,
    );
  });
});
