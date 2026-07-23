/**
 * Fase Fiscal H3-B1 — Paridade CNPJ entre client (src) e Edge (_shared).
 *
 * Edge Functions Deno não podem importar de `src/**`, então o algoritmo
 * de CNPJ é replicado em `supabase/functions/_shared/fiscal/cnpj.ts`.
 * Este teste carrega o arquivo compartilhado como texto e transpila
 * on-the-fly (imports/exports triviais) para exercitar exatamente o
 * mesmo código que a Edge Function executa, comparando com o cliente
 * canônico em `src/lib/fiscal/cnpjAlpha.ts`.
 *
 * Qualquer divergência de aceitação, DV ou máscara quebra este teste.
 */
import { describe, it, expect } from "vitest";
import {
  validateCnpjAlpha as clientValidate,
  unmaskCnpjAlpha as clientUnmask,
} from "@/lib/fiscal/cnpjAlpha";
// Vitest transpila TypeScript, então importamos direto o arquivo Deno
// compartilhado (é TS puro, sem APIs Deno) para exercitar exatamente o
// mesmo código que a Edge Function usa.
import {
  validateCnpjAlpha as sharedValidate,
  unmaskCnpjAlpha as sharedUnmask,
  isCnpjNumericOnly as sharedIsNumeric,
} from "../../../supabase/functions/_shared/fiscal/cnpj";

describe("CNPJ shared/client parity (H3-B1)", () => {
  const cases: string[] = [
    "00000000000191",
    "00.000.000/0001-91",
    "00000000000192",
    "12ABC34501DE35",
    "12abc34501de35",
    "12ABC34501DE34",
    "11111111111111",
    "AAAAAAAAAAAA00",
    "",
    "123",
    "abcdefghijkl00",
    "12345678901234567890",
  ];

  for (const raw of cases) {
    it(`paridade para "${raw}"`, () => {
      expect(sharedUnmask(raw)).toBe(clientUnmask(raw));
      expect(sharedValidate(raw)).toBe(clientValidate(raw));
    });
  }

  it("isCnpjNumericOnly distingue formatos", () => {
    expect(sharedIsNumeric("00000000000191")).toBe(true);
    expect(sharedIsNumeric("12ABC34501DE35")).toBe(false);
    expect(sharedIsNumeric("00.000.000/0001-91")).toBe(true);
    expect(sharedIsNumeric("123")).toBe(false);
  });
});
