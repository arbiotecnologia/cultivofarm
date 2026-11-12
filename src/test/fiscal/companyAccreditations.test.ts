import { describe, it, expect } from "vitest";
import { mergeDeclaredAccreditation } from "@/lib/fiscal/companyAccreditations";
import { buildUpdatePayload, companyFiscalFormSchema } from "@/lib/fiscal/companyFiscalValidation";
describe("Credenciamento declarado e PIS/COFINS opcionais", () => {
  it("registra MG sem inventar atestado, protocolo ou regime", () => {
    const payload = buildUpdatePayload({ tax_regime: "LUCRO_PRESUMIDO", crt: "3", configuration_status: "PENDING_ACCOUNTING", pis_cofins_regime: null, uf_accreditations: mergeDeclaredAccreditation([], "MG", true) });
    expect(payload.uf_accreditations).toEqual([{ uf: "MG", accredited: true }]);
    expect(payload.pis_cofins_regime).toBeNull();
    expect(payload).not.toHaveProperty("configuration_status");
    expect(payload).not.toHaveProperty("accounting_validated_at");
    expect(payload).not.toHaveProperty("last_validation_at");
    expect(payload.nfe_enabled).toBe(false);
  });
  it("merge retém outras UFs, chaves e registros opacos sem mutar origem", () => {
    const original = [{ uf: "SP", accredited: true, note: "existente" }, { uf: "MG", accredited: false, evidence_ref: "original" }, "legado"];
    expect(mergeDeclaredAccreditation(original, "MG", true)).toEqual([original[0], { uf: "MG", accredited: true, evidence_ref: "original" }, "legado"]);
    expect(original[1].accredited).toBe(false);
    expect(mergeDeclaredAccreditation(original, "RJ", false)).toEqual([...original, { uf: "RJ", accredited: false }]);
  });
  it("UF duplicada aborta sem descartar ou escolher evidência", () => {
    expect(() => mergeDeclaredAccreditation([{ uf: "MG" }, { uf: "MG", accredited: true }], "MG", true)).toThrow("duplicados");
    expect(() => mergeDeclaredAccreditation([], "XX", true)).toThrow("UF inválida");
  });
  it("regime nunca inferido e omissão não apaga registros", () => {
    const payload = buildUpdatePayload({ crt: "3", tax_regime: "LUCRO_PRESUMIDO" });
    expect(payload).not.toHaveProperty("pis_cofins_regime");
    expect(payload).not.toHaveProperty("uf_accreditations");
  });
  it("aceita somente domínio canônico e null; rejeita segredo no JSON", () => {
    for (const regime of [null, "CUMULATIVO", "NAO_CUMULATIVO", "MISTO", "SIMPLES_NACIONAL"]) expect(companyFiscalFormSchema.safeParse({ pis_cofins_regime: regime }).success).toBe(true);
    expect(companyFiscalFormSchema.safeParse({ pis_cofins_regime: "LUCRO_PRESUMIDO" }).success).toBe(false);
    expect(companyFiscalFormSchema.safeParse({ uf_accreditations: [{ uf: "MG", token: "forbidden" }] }).success).toBe(false);
  });
});