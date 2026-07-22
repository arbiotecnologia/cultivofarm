/**
 * Fase Fiscal 3.2 — Testes estáticos.
 * Cobrem: flag default, matriz de permissões, validação NCM/CEST/CFOP,
 * payloads (diff, sem product_id em update, sem campos fora do schema),
 * prevenção de duplicidade e ausência de emissão.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { getAccessLevel } from "@/lib/permissions";
import {
  productFiscalFormSchema,
  buildInsertPayload,
  buildUpdatePayload,
  rowToFormValues,
  digitsOnly,
  type ProductFiscalRow,
} from "@/lib/fiscal/productFiscalValidation";

const ROUTE = "/configuracoes/fiscal/produtos";

const BASE_ROW: ProductFiscalRow = {
  id: "profile-1",
  product_id: "prod-1",
  accounting_notes: null,
  accounting_validated_at: null,
  accounting_validated_by: null,
  approximate_tax_source: null,
  cest: null,
  cfop_in_state: null,
  cfop_interstate: null,
  cofins_cst: null,
  commercial_unit: null,
  created_at: "2026-07-01T00:00:00Z",
  created_by: null,
  fiscal_description: null,
  gtin: null,
  icms_csosn: null,
  icms_cst: null,
  ipi_cst: null,
  is_active: true,
  ncm: null,
  origin_code: null,
  pis_cst: null,
  profile_status: "DRAFT",
  tax_benefit_code: null,
  taxable_gtin: null,
  taxable_unit: null,
  updated_at: "2026-07-01T00:00:00Z",
  updated_by: null,
};

describe("Fase 3.2 — feature flag", () => {
  test("fiscalProductProfilesUi habilitada na Fase 3.16", () => {
    expect(FEATURE_FLAGS.fiscalProductProfilesUi).toBe(true);
  });
  test("fiscalEmissionEnabled continua false", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
  });
});

describe("Fase 3.2 — matriz de permissões", () => {
  test("administrador rw", () => {
    expect(getAccessLevel("administrador", ROUTE)).toBe("rw");
  });
  test("financeiro rw", () => {
    expect(getAccessLevel("financeiro", ROUTE)).toBe("rw");
  });
  test("gestor r", () => {
    expect(getAccessLevel("gestor", ROUTE)).toBe("r");
  });
  for (const role of [
    "consultor_tecnico", "aplicador", "operador_onfarm", "cliente_produtor",
    "administrativo", "tecnico_agronomo", "producao", "gestor_comercial",
    "parceiro_b2b", "parceiro_b2b_tecnico",
  ] as const) {
    test(`${role} bloqueado`, () => {
      expect(getAccessLevel(role, ROUTE)).toBe("none");
    });
  }
  test("anon/sem papel bloqueado", () => {
    expect(getAccessLevel(null, ROUTE)).toBe("none");
    expect(getAccessLevel(undefined, ROUTE)).toBe("none");
  });
});

describe("Fase 3.2 — validações NCM/CEST/CFOP", () => {
  test("NCM válido com formatação é aceito e normalizado", () => {
    const r = productFiscalFormSchema.safeParse({ ncm: "1234.56.78" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ncm).toBe("12345678");
  });
  test("NCM com menos dígitos falha", () => {
    const r = productFiscalFormSchema.safeParse({ ncm: "1234567" });
    expect(r.success).toBe(false);
  });
  test("CEST 7 dígitos aceito", () => {
    const r = productFiscalFormSchema.safeParse({ cest: "01.001.00" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cest).toBe("0100100");
  });
  test("CEST com 6 dígitos falha", () => {
    const r = productFiscalFormSchema.safeParse({ cest: "010010" });
    expect(r.success).toBe(false);
  });
  test("CFOP 4 dígitos aceito", () => {
    const r = productFiscalFormSchema.safeParse({
      cfop_in_state: "5.102",
      cfop_interstate: "6102",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cfop_in_state).toBe("5102");
      expect(r.data.cfop_interstate).toBe("6102");
    }
  });
  test("CFOP com 3 dígitos falha", () => {
    const r = productFiscalFormSchema.safeParse({ cfop_in_state: "510" });
    expect(r.success).toBe(false);
  });
  test("Campos vazios são aceitos (não obrigatórios)", () => {
    expect(productFiscalFormSchema.safeParse({}).success).toBe(true);
  });
  test("digitsOnly normaliza corretamente", () => {
    expect(digitsOnly("12a.34-b56")).toBe("123456");
    expect(digitsOnly(null)).toBe("");
  });
});

describe("Fase 3.2 — payloads", () => {
  test("UPDATE envia apenas campos alterados", () => {
    const values = rowToFormValues({ ...BASE_ROW, ncm: "11111111" });
    values.ncm = "22222222"; // muda apenas este
    const payload = buildUpdatePayload(values, { ...BASE_ROW, ncm: "11111111" });
    expect(payload).toEqual({ ncm: "22222222" });
  });

  test("UPDATE nunca inclui product_id/id/timestamps", () => {
    const values = rowToFormValues(BASE_ROW);
    values.ncm = "12345678";
    values.cest = "0100100";
    const payload = buildUpdatePayload(values, BASE_ROW);
    const keys = Object.keys(payload);
    expect(keys).not.toContain("product_id");
    expect(keys).not.toContain("id");
    expect(keys).not.toContain("created_at");
    expect(keys).not.toContain("updated_at");
    expect(keys).not.toContain("is_active");
    expect(keys).not.toContain("profile_status");
  });

  test("UPDATE sem mudanças produz payload vazio", () => {
    const values = rowToFormValues(BASE_ROW);
    expect(buildUpdatePayload(values, BASE_ROW)).toEqual({});
  });

  test("UPDATE limpa campo (string vazia → null) apenas quando o prev não era null", () => {
    const rowWithNcm = { ...BASE_ROW, ncm: "12345678" };
    const values = rowToFormValues(rowWithNcm);
    values.ncm = "";
    const payload = buildUpdatePayload(values, rowWithNcm);
    expect(payload).toEqual({ ncm: null });
  });

  test("INSERT exige product_id e omite campos vazios", () => {
    const values = rowToFormValues(null);
    values.ncm = "12345678";
    const payload = buildInsertPayload("prod-42", values);
    expect(payload.product_id).toBe("prod-42");
    expect(payload.ncm).toBe("12345678");
    expect((payload as Record<string, unknown>).cest).toBeUndefined();
    expect((payload as Record<string, unknown>).id).toBeUndefined();
  });

  test("Payload nunca contém chaves fora do contrato de product_fiscal_profiles", () => {
    const ALLOWED = new Set([
      "product_id",
      "ncm", "cest", "cfop_in_state", "cfop_interstate", "origin_code",
      "icms_cst", "icms_csosn", "ipi_cst", "pis_cst", "cofins_cst",
      "commercial_unit", "taxable_unit", "taxable_gtin", "gtin",
      "fiscal_description", "tax_benefit_code", "accounting_notes",
    ]);
    const values = rowToFormValues(null);
    values.ncm = "12345678";
    values.cest = "0100100";
    values.fiscal_description = "descricao";
    const insert = buildInsertPayload("prod-1", values);
    for (const k of Object.keys(insert)) expect(ALLOWED.has(k)).toBe(true);
    const update = buildUpdatePayload(values, BASE_ROW);
    for (const k of Object.keys(update)) expect(ALLOWED.has(k)).toBe(true);
  });
});

describe("Fase 3.2 — ausência de emissão e integração", () => {
  const dir = resolve(process.cwd(), "src");
  const files = [
    "pages/configuracoes/FiscalProdutos.tsx",
    "hooks/useProductFiscalProfiles.ts",
    "lib/fiscal/productFiscalValidation.ts",
  ];
  for (const rel of files) {
    test(`${rel} não referencia emissão/provedor/edge fiscal`, () => {
      const src = readFileSync(resolve(dir, rel), "utf8");
      expect(src).not.toMatch(/emitir|transmitir|inutilizar|sefaz|nfe-|nfse-|functions\.invoke|certificate|token/i);
    });
  }
});

describe("Fase 3.2 — regressão de rota da empresa preservada", () => {
  test("/configuracoes/fiscal/empresa mantém matriz", () => {
    expect(getAccessLevel("administrador", "/configuracoes/fiscal/empresa")).toBe("rw");
    expect(getAccessLevel("gestor", "/configuracoes/fiscal/empresa")).toBe("r");
    expect(getAccessLevel("financeiro", "/configuracoes/fiscal/empresa")).toBe("r");
  });
});
