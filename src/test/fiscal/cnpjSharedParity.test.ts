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
  const shared = loadShared();

  const cases: string[] = [
    "00000000000191", // numérico válido (BrasilAPI Petrobras exemplo)
    "00.000.000/0001-91",
    "00000000000192", // DV inválido
    "12ABC34501DE35", // alfanumérico válido
    "12abc34501de35", // lowercase (deve virar upper)
    "12ABC34501DE34", // alfanumérico DV errado
    "11111111111111", // repetido numérico
    "AAAAAAAAAAAA00", // repetido alfabético (não é bloqueado pela regra, mas DV falha)
    "",
    "123",
    "abcdefghijkl00",
    "12345678901234567890",
  ];

  for (const raw of cases) {
    it(`paridade para "${raw}"`, () => {
      expect(shared.unmaskCnpjAlpha(raw)).toBe(clientUnmask(raw));
      expect(shared.validateCnpjAlpha(raw)).toBe(clientValidate(raw));
    });
  }

  it("isCnpjNumericOnly distingue formatos", () => {
    expect(shared.isCnpjNumericOnly("00000000000191")).toBe(true);
    expect(shared.isCnpjNumericOnly("12ABC34501DE35")).toBe(false);
    expect(shared.isCnpjNumericOnly("00.000.000/0001-91")).toBe(true);
    expect(shared.isCnpjNumericOnly("123")).toBe(false);
  });
});
