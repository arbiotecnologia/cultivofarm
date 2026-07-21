/**
 * Fase Fiscal 3.0.2-B.1 — Testes unitários do runner (mocks, sem banco).
 */
import { describe, test, expect } from "vitest";
import { buildPayload, classifyHttp, FIXTURE_PREFIX } from "./runner";
import { FISCAL_TABLES } from "./matrix";

const FX = {
  productId: "11111111-1111-1111-1111-111111111111",
  serviceRef: "svc-abc",
  customerId: "22222222-2222-2222-2222-222222222222",
  createdBy: "33333333-3333-3333-3333-333333333333",
  companyCnpj: "CNPJ-TEST",
} as const;

describe("classifyHttp", () => {
  test.each([
    [200, "", "allow"],
    [204, "", "allow"],
    [401, "", "deny"],
    [403, "", "deny"],
    [403, '{"code":"42501","message":"permission denied"}', "deny"],
    [400, '{"code":"42501"}', "deny"],
    [404, "", "error"],
    [409, "duplicate key", "error"],
    [500, "boom", "error"],
    [400, "invalid input syntax", "error"],
  ])("HTTP %i → %s", (status, body, expected) => {
    expect(classifyHttp(status as number, body as string)).toBe(expected);
  });
});

describe("buildPayload", () => {
  test("cobre todas as 9 tabelas fiscais em insert e update", () => {
    for (const t of FISCAL_TABLES) {
      const ins = buildPayload(t, "insert", FX);
      const upd = buildPayload(t, "update", FX);
      expect(ins).toBeTypeOf("object");
      expect(upd).toBeTypeOf("object");
      expect(Object.keys(ins).length).toBeGreaterThan(0);
      expect(Object.keys(upd).length).toBeGreaterThan(0);
    }
  });

  test("payload de company_fiscal_settings inclui cnpj do fixture", () => {
    const p = buildPayload("company_fiscal_settings", "insert", FX) as Record<string, unknown>;
    expect(p.cnpj).toBe(FX.companyCnpj);
    expect(p.production_enabled).toBe(false);
  });

  test("service_fiscal_profiles usa source_reference (nunca hardcoded)", () => {
    const p = buildPayload("service_fiscal_profiles", "insert", FX) as Record<string, unknown>;
    expect(String(p.source_reference)).toMatch(/^svc-/);
  });

  test("tabela desconhecida lança erro claro", () => {
    expect(() => buildPayload("nao_existe", "insert", FX)).toThrow(/payload factory/);
  });
});

describe("FIXTURE_PREFIX", () => {
  test("é único e distinguível", () => {
    expect(FIXTURE_PREFIX).toBe("FISCAL_TEST_B1_");
  });
});
