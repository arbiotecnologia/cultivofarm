/**
 * Fase Fiscal 3.19 — CNPJ Alfanumérico + RTC schema.
 */
import { describe, test, expect } from "vitest";
import {
  formatCnpjAlpha,
  unmaskCnpjAlpha,
  validateCnpjAlpha,
  isCnpjAlphanumeric,
} from "@/lib/fiscal/cnpjAlpha";
import { formatCNPJ, formatCpfCnpjSafe, getTipoDocumento } from "@/lib/masks";
import {
  rtcCompanySchema,
  ibsCbsItemSchema,
  rtcHasSensitiveKey,
} from "@/lib/fiscal/rtcConfiguration";

// Base fixa "12ABC34501DE" (letras nas 12 primeiras). DVs calculados via regra
// oficial (ASCII − 48) mod-11.
function computeDvHelper(base: string): string {
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const calc = (b: string, w: number[]) => {
    let s = 0;
    for (let i = 0; i < b.length; i++) s += (b.charCodeAt(i) - 48) * w[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base, w1);
  const d2 = calc(base + d1, w2);
  return `${d1}${d2}`;
}

describe("Fase 3.19 — CNPJ alfanumérico", () => {
  test("unmask preserva letras e força uppercase", () => {
    expect(unmaskCnpjAlpha("12.abc.345/01de-55")).toBe("12ABC34501DE55");
    expect(unmaskCnpjAlpha("  ab-cd / 12 ")).toBe("ABCD12");
    expect(unmaskCnpjAlpha(null)).toBe("");
  });

  test("máscara parcial durante digitação", () => {
    expect(formatCnpjAlpha("12")).toBe("12");
    expect(formatCnpjAlpha("12ABC")).toBe("12.ABC");
    expect(formatCnpjAlpha("12ABC34501DE")).toBe("12.ABC.345/01DE");
    expect(formatCnpjAlpha("12ABC34501DE55")).toBe("12.ABC.345/01DE-55");
  });

  test("valida CNPJ numérico legado", () => {
    // 11.222.333/0001-81 — CNPJ numérico válido conhecido.
    expect(validateCnpjAlpha("11.222.333/0001-81")).toBe(true);
    expect(validateCnpjAlpha("11.222.333/0001-80")).toBe(false);
    expect(validateCnpjAlpha("00000000000000")).toBe(false); // repetido
  });

  test("valida CNPJ alfanumérico com DV calculado", () => {
    const base = "12ABC34501DE";
    const cnpj = base + computeDvHelper(base);
    expect(validateCnpjAlpha(cnpj)).toBe(true);
    expect(validateCnpjAlpha(formatCnpjAlpha(cnpj))).toBe(true);
    // Altera DV.
    expect(validateCnpjAlpha(base + "00")).toBe(false);
  });

  test("rejeita letras nos DV e comprimentos errados", () => {
    expect(validateCnpjAlpha("12ABC34501DEAA")).toBe(false);
    expect(validateCnpjAlpha("12ABC34501DE1")).toBe(false);
  });

  test("isCnpjAlphanumeric distingue formato novo", () => {
    expect(isCnpjAlphanumeric("11222333000181")).toBe(false);
    expect(isCnpjAlphanumeric("12ABC34501DE55")).toBe(true);
  });

  test("formatCNPJ (masks.ts) usa a nova máscara alfanumérica", () => {
    expect(formatCNPJ("12abc34501de55")).toBe("12.ABC.345/01DE-55");
    expect(formatCNPJ("11222333000181")).toBe("11.222.333/0001-81");
  });

  test("formatCpfCnpjSafe trata alfanumérico como CNPJ", () => {
    expect(formatCpfCnpjSafe("12ABC34501DE55")).toBe("12.ABC.345/01DE-55");
    expect(formatCpfCnpjSafe("12ABC")).toContain("(inválido)");
    expect(formatCpfCnpjSafe("")).toBe("—");
  });

  test("getTipoDocumento identifica CNPJ para valor com letras", () => {
    expect(getTipoDocumento("12ABC34501DE55")).toBe("CNPJ");
    expect(getTipoDocumento("12345678909")).toBe("CPF");
    expect(getTipoDocumento("11222333000181")).toBe("CNPJ");
  });
});

describe("Fase 3.19 — RTC schema (IBS/CBS)", () => {
  test("rtcCompanySchema aceita payload mínimo", () => {
    const parsed = rtcCompanySchema.parse({ schema_version: 1 });
    expect(parsed.rtc_environment).toBe("NOT_CONFIGURED");
  });

  test("rejeita chave sensível em qualquer profundidade", () => {
    expect(() =>
      rtcCompanySchema.parse({
        schema_version: 1,
        additional_fields: { nested: { token: "leak" } },
      }),
    ).toThrow();
    expect(rtcHasSensitiveKey({ a: { b: { CERTIFICATE: "x" } } })).toBe(true);
    expect(rtcHasSensitiveKey({ a: { b: { ok: 1 } } })).toBe(false);
  });

  test("ibsCbsItemSchema valida percentuais e códigos", () => {
    const ok = ibsCbsItemSchema.parse({
      schema_version: 1,
      cst_ibs_cbs: "000",
      aliquota_cbs: 0.9,
      aliquota_ibs_uf: 0.1,
      aliquota_ibs_municipio: 0,
    });
    expect(ok.cst_ibs_cbs).toBe("000");
    expect(() =>
      ibsCbsItemSchema.parse({ schema_version: 1, aliquota_cbs: 101 }),
    ).toThrow();
    expect(() =>
      ibsCbsItemSchema.parse({ schema_version: 1, aliquota_cbs: -1 }),
    ).toThrow();
  });

  test("bloqueia campo desconhecido (strict)", () => {
    expect(() =>
      ibsCbsItemSchema.parse({ schema_version: 1, campo_qualquer: "x" }),
    ).toThrow();
  });
});
