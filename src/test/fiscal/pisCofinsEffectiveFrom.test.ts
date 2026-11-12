import { describe, it, expect } from "vitest";
import { buildUpdatePayload, companyFiscalFormSchema, isValidCivilDate, rowToFormValues } from "@/lib/fiscal/companyFiscalValidation";
import { parsePisCofinsHistory } from "@/hooks/useFiscalPisCofinsHistory";

const baseRow = { id: "x", fiscal_environment: "HOMOLOGATION", configuration_status: "PENDING_ACCOUNTING", pis_cofins_regime: null } as never;

describe("Início da vigência PIS/COFINS", () => {
  it("cadastro sem coluna instalada não envia o campo (legado preservado)", () => {
    const v = rowToFormValues(baseRow);
    expect(v.pis_cofins_regime_effective_from).toBeUndefined();
    expect(buildUpdatePayload(v)).not.toHaveProperty("pis_cofins_regime_effective_from");
  });
  it("cadastro com coluna e sem data mantém null, sem deduzir", () => {
    const v = rowToFormValues({ ...(baseRow as object), pis_cofins_regime_effective_from: null } as never);
    expect(v.pis_cofins_regime_effective_from).toBeNull();
    const p = buildUpdatePayload(v);
    expect(p).toHaveProperty("pis_cofins_regime_effective_from", null);
    expect(p).toHaveProperty("pis_cofins_regime", null);
  });
  it("data informada é enviada exatamente e sem status contábil", () => {
    const p = buildUpdatePayload({ pis_cofins_regime: "CUMULATIVO", pis_cofins_regime_effective_from: "2026-01-01" });
    expect(p).toHaveProperty("pis_cofins_regime_effective_from", "2026-01-01");
    expect(p).not.toHaveProperty("configuration_status");
    expect(p).not.toHaveProperty("accounting_validated_at");
  });
  it("datas inválidas de calendário são recusadas", () => {
    for (const d of ["2026-02-30", "2026-13-01", "01/01/2026", "1988-10-04", "2101-01-01"]) {
      expect(isValidCivilDate(d)).toBe(false);
      expect(companyFiscalFormSchema.safeParse({ pis_cofins_regime_effective_from: d }).success).toBe(false);
    }
    expect(isValidCivilDate("2024-02-29")).toBe(true);
  });
  it("leitor do histórico rejeita resposta malformada", () => {
    expect(parsePisCofinsHistory([{ id: "a", changed_at: "t", old_regime: null, new_regime: "MISTO", old_effective_from: null, new_effective_from: "2026-01-01", changed_by: null }])).toHaveLength(1);
    expect(parsePisCofinsHistory([{ id: 1 }])).toBeNull();
    expect(parsePisCofinsHistory({})).toBeNull();
  });
});
