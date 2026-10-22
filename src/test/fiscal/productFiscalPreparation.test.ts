import { describe, it, expect } from "vitest";
import { productFiscalPreparation, productFiscalFormSchema, buildInsertPayload } from "@/lib/fiscal/productFiscalValidation";
describe("preparação fiscal sem classificação inventada", () => {
  it("rascunho vazio pode ser salvo mas não está pronto", () => {
    expect(buildInsertPayload("synthetic",productFiscalFormSchema.parse({}))).toEqual({product_id:"synthetic"});
    expect(productFiscalPreparation({minimally_classified:false},true)).toEqual({stage:"incomplete_draft",readyForNfe:false});
  });
  it("mínimo sem revisão contábil permanece pendente", () => expect(productFiscalPreparation({minimally_classified:true,accounting_validated:false},true).stage).toBe("accounting_pending"));
  it("revisão contábil não certifica operação NF-e", () => expect(productFiscalPreparation({minimally_classified:true,accounting_validated:true},true)).toEqual({stage:"operation_pending",readyForNfe:false}));
  it("perfil inativo nunca fica pronto", () => expect(productFiscalPreparation({minimally_classified:true,accounting_validated:true},false)).toEqual({stage:"inactive",readyForNfe:false}));
  it("leitura indisponível não é aprovação", () => expect(productFiscalPreparation(undefined,true)).toEqual({stage:"unavailable",readyForNfe:false}));
});