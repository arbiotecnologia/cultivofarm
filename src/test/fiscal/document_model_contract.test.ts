/**
 * Correção fiscal (staging H2): `chk_fi_document_model` aceita somente
 * NFE | NFSE | OTHER. O wizard de rascunho não pode enviar '55'.
 */
import { describe, it, expect } from "vitest";
import {
  DOCUMENT_MODELS,
  rascunhoSchema,
  emptyRascunho,
} from "@/lib/fiscal/rascunhoWizardValidation";

describe("document_model — contrato técnico NFE|NFSE", () => {
  it("DOCUMENT_MODELS não contém '55'/'57'/'65'", () => {
    expect(DOCUMENT_MODELS).toEqual(["NFE", "NFSE"]);
    for (const forbidden of ["55", "57", "65"]) {
      expect((DOCUMENT_MODELS as readonly string[]).includes(forbidden)).toBe(false);
    }
  });

  it("emptyRascunho() usa NFE como default (não '55')", () => {
    const v = emptyRascunho();
    expect(v.document_model).toBe("NFE");
    // @ts-expect-error — '55' não é atribuível ao tipo
    const bad: typeof v.document_model = "55";
    expect(bad).toBe("55");
  });

  it("rascunhoSchema rejeita document_model='55' e aceita NFE/NFSE", () => {
    const base = {
      ...emptyRascunho(),
      customer_id: "00000000-0000-0000-0000-000000000001",
      customer_document: "12345678901",
      items: [
        {
          item_kind: "PRODUCT" as const,
          description: "x",
          quantity: 1,
          commercial_unit: "UN",
          unit_value: 1,
          gross_value: 1,
          discount_value: 0,
          net_value: 1,
          fiscal_profile_snapshot: {},
          tax_snapshot: {},
        },
      ],
    };
    expect(rascunhoSchema.safeParse({ ...base, document_model: "55" }).success).toBe(false);
    expect(rascunhoSchema.safeParse({ ...base, document_model: "NFE" }).success).toBe(true);
    expect(rascunhoSchema.safeParse({ ...base, document_model: "NFSE" }).success).toBe(true);
  });
});
