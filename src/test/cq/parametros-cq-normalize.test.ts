import { describe, expect, it } from "vitest";
import { normalizeCQReferenceIds } from "@/pages/configuracoes/ParametrosCQPage";

describe("normalizeCQReferenceIds (CHECK produto ou micro)", () => {
  it("produto-only: micro vira NULL", () => expect(normalizeCQReferenceIds({ microrganismo_id: "", produto_id: "p" })).toEqual({ microrganismo_id: null, produto_id: "p" }));
  it("micro-only legado: produto NULL", () => expect(normalizeCQReferenceIds({ microrganismo_id: "m", produto_id: "" })).toEqual({ microrganismo_id: "m", produto_id: null }));
  it("ambos preservados", () => expect(normalizeCQReferenceIds({ microrganismo_id: "m", produto_id: "p" })).toEqual({ microrganismo_id: "m", produto_id: "p" }));
  it.each([["", ""], ["  ", " "]])("ambos vazios falha (%j,%j)", (m, p) => expect(() => normalizeCQReferenceIds({ microrganismo_id: m, produto_id: p })).toThrow("Selecione o microrganismo ou o produto"));
});
