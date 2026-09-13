import { describe, expect, it } from "vitest";
import {
  checkFiscalProjectRef,
  FISCAL_EXPECTED_PROJECT_REF,
  FISCAL_PRODUCTION_EMISSION_ALLOWED,
} from "@/config/fiscalBinding";

describe("Binding fiscal CultivoFarm", () => {
  it("aceita somente o projeto CultivoFarm canônico", () => {
    expect(checkFiscalProjectRef(FISCAL_EXPECTED_PROJECT_REF)).toEqual({
      ok: true,
      ref: FISCAL_EXPECTED_PROJECT_REF,
    });
  });

  it("falha fechado sem referência", () => {
    expect(checkFiscalProjectRef(null)).toMatchObject({
      ok: false,
      reason: "unknown_ref",
    });
  });

  it("rejeita o projeto de produção anterior explicitamente", () => {
    expect(checkFiscalProjectRef("navfzbwgwzruipouyfnk")).toMatchObject({
      ok: false,
      reason: "ref_mismatch",
    });
  });

  it("rejeita staging legado e qualquer outro projeto", () => {
    expect(checkFiscalProjectRef("ikaauvsflpmamgxmkhoq")).toMatchObject({
      ok: false,
      reason: "ref_mismatch",
    });
    expect(checkFiscalProjectRef("projeto-desconhecido")).toMatchObject({
      ok: false,
      reason: "ref_mismatch",
    });
  });

  it("mantém emissão fiscal de produção bloqueada", () => {
    expect(FISCAL_PRODUCTION_EMISSION_ALLOWED).toBe(false);
  });
});