/**
 * Fase Fiscal 3.4 — Testes estáticos.
 * Cobrem: flag default, matriz de permissões, rota, integridade
 * (customer_id UUID obrigatório), payloads diff-only, mascaramento de
 * documento, validações de IBGE/e-mail/UF, ausência de emissão,
 * privacidade de documento e regressão das Fases 3.1/3.2/3.3.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { getAccessLevel } from "@/lib/permissions";
import {
  customerFiscalFormSchema,
  buildInsertPayload,
  buildUpdatePayload,
  assertCustomerId,
  MissingCustomerIdError,
  maskDocument,
  digitsOnly,
  TAXPAYER_INDICATOR_VALUES,
  type CustomerFiscalRow,
} from "@/lib/fiscal/customerFiscalValidation";

const ROUTE = "/configuracoes/fiscal/clientes";
const UUID_A = "11111111-1111-1111-1111-111111111111";

const BASE_ROW: CustomerFiscalRow = {
  id: "profile-1",
  customer_id: UUID_A,
  taxpayer_indicator: null,
  state_registration_status: null,
  municipal_registration: null,
  fiscal_email: null,
  fiscal_phone: null,
  use_main_address: true,
  fiscal_postal_code: null,
  fiscal_street: null,
  fiscal_number: null,
  fiscal_complement: null,
  fiscal_neighborhood: null,
  fiscal_city: null,
  fiscal_municipality_ibge_code: null,
  fiscal_state: null,
  country_code: "BR",
  rural_producer_indicator: false,
  foreign_customer_indicator: false,
  profile_status: "INCOMPLETE",
  validation_notes: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  created_by: null,
  updated_by: null,
};

describe("Fase 3.4 — feature flag", () => {
  test("fiscalCustomerProfilesUi default = false", () => {
    expect(FEATURE_FLAGS.fiscalCustomerProfilesUi).toBe(false);
  });
  test("fiscalEmissionEnabled continua false", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
  });
});

describe("Fase 3.4 — matriz de permissões", () => {
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
    expect(getAccessLevel(undefined as unknown as null, ROUTE)).toBe("none");
  });
});

describe("Fase 3.4 — identidade e mascaramento", () => {
  test("assertCustomerId rejeita valores não-UUID", () => {
    expect(() => assertCustomerId("nao-uuid")).toThrow(MissingCustomerIdError);
    expect(() => assertCustomerId("")).toThrow(MissingCustomerIdError);
    expect(() => assertCustomerId(null)).toThrow(MissingCustomerIdError);
    expect(() => assertCustomerId(undefined)).toThrow(MissingCustomerIdError);
  });
  test("assertCustomerId aceita UUID válido", () => {
    expect(() => assertCustomerId(UUID_A)).not.toThrow();
  });
  test("maskDocument mascara CPF preservando 2 últimos dígitos", () => {
    const m = maskDocument("123.456.789-09");
    expect(m).toContain("09");
    expect(m).not.toContain("123");
    expect(m).not.toContain("456");
    expect(m).not.toContain("789");
  });
  test("maskDocument mascara CNPJ preservando 2 últimos dígitos", () => {
    const m = maskDocument("12.345.678/0001-95");
    expect(m).toContain("95");
    expect(m).not.toContain("12345");
    expect(m).not.toContain("0001");
  });
  test("maskDocument retorna '***' quando documento é vazio/inválido", () => {
    expect(maskDocument(null)).toBe("***");
    expect(maskDocument("")).toBe("***");
    expect(maskDocument("123")).toBe("***");
  });
  test("digitsOnly normaliza corretamente", () => {
    expect(digitsOnly("12a.34-b56")).toBe("123456");
    expect(digitsOnly(null)).toBe("");
  });
});

describe("Fase 3.4 — validações", () => {
  test("IBGE 7 dígitos aceito e normalizado", () => {
    const r = customerFiscalFormSchema.safeParse({
      fiscal_municipality_ibge_code: "3550308",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fiscal_municipality_ibge_code).toBe("3550308");
  });
  test("IBGE com 6 dígitos falha", () => {
    const r = customerFiscalFormSchema.safeParse({
      fiscal_municipality_ibge_code: "355030",
    });
    expect(r.success).toBe(false);
  });
  test("taxpayer_indicator aceita apenas domínios canônicos", () => {
    for (const v of TAXPAYER_INDICATOR_VALUES) {
      expect(
        customerFiscalFormSchema.safeParse({ taxpayer_indicator: v }).success,
      ).toBe(true);
    }
    expect(
      customerFiscalFormSchema.safeParse({ taxpayer_indicator: "3" }).success,
    ).toBe(false);
    expect(
      customerFiscalFormSchema.safeParse({ taxpayer_indicator: "" }).success,
    ).toBe(true);
  });
  test("fiscal_email inválido falha; vazio é aceito", () => {
    expect(
      customerFiscalFormSchema.safeParse({ fiscal_email: "abc" }).success,
    ).toBe(false);
    expect(
      customerFiscalFormSchema.safeParse({ fiscal_email: "" }).success,
    ).toBe(true);
    expect(
      customerFiscalFormSchema.safeParse({ fiscal_email: "a@b.co" }).success,
    ).toBe(true);
  });
  test("Campos vazios são aceitos (nada é obrigatório no schema da tela)", () => {
    expect(customerFiscalFormSchema.safeParse({}).success).toBe(true);
  });
});

describe("Fase 3.4 — payloads", () => {
  test("INSERT exige customer_id válido", () => {
    const values = customerFiscalFormSchema.parse({});
    expect(() => buildInsertPayload("nao-uuid", values)).toThrow(
      MissingCustomerIdError,
    );
    const payload = buildInsertPayload(UUID_A, values);
    expect(payload.customer_id).toBe(UUID_A);
  });

  test("INSERT omite campos vazios e defaults do schema", () => {
    const values = customerFiscalFormSchema.parse({
      fiscal_municipality_ibge_code: "3550308",
      fiscal_state: "sp",
      country_code: "br",
    });
    const payload = buildInsertPayload(UUID_A, values);
    expect(payload.fiscal_municipality_ibge_code).toBe("3550308");
    expect(payload.fiscal_state).toBe("SP");
    expect(payload.country_code).toBe("BR");
    expect((payload as Record<string, unknown>).id).toBeUndefined();
    expect((payload as Record<string, unknown>).created_at).toBeUndefined();
    expect((payload as Record<string, unknown>).profile_status).toBeUndefined();
    expect((payload as Record<string, unknown>).validation_notes).toBeUndefined();
    // Defaults do schema não são enviados quando iguais.
    expect((payload as Record<string, unknown>).use_main_address).toBeUndefined();
    expect((payload as Record<string, unknown>).rural_producer_indicator).toBeUndefined();
    expect((payload as Record<string, unknown>).foreign_customer_indicator).toBeUndefined();
  });

  test("INSERT envia booleans somente quando divergem do default", () => {
    const values = customerFiscalFormSchema.parse({
      use_main_address: false,
      rural_producer_indicator: true,
      foreign_customer_indicator: true,
    });
    const payload = buildInsertPayload(UUID_A, values);
    expect(payload.use_main_address).toBe(false);
    expect(payload.rural_producer_indicator).toBe(true);
    expect(payload.foreign_customer_indicator).toBe(true);
  });

  test("UPDATE diff-only envia somente campos alterados", () => {
    const values = customerFiscalFormSchema.parse({
      fiscal_municipality_ibge_code: "3550308",
      fiscal_city: "São Paulo",
      country_code: "BR",
    });
    const payload = buildUpdatePayload(values, BASE_ROW);
    expect(payload).toEqual({
      fiscal_municipality_ibge_code: "3550308",
      fiscal_city: "São Paulo",
    });
  });

  test("UPDATE nunca inclui id/customer_id/timestamps/profile_status/validation_notes", () => {
    const values = customerFiscalFormSchema.parse({
      fiscal_city: "X",
    });
    const payload = buildUpdatePayload(values, BASE_ROW);
    for (const forbidden of [
      "id", "customer_id", "created_at", "updated_at",
      "profile_status", "validation_notes",
      "created_by", "updated_by",
    ]) {
      expect(Object.keys(payload)).not.toContain(forbidden);
    }
  });

  test("UPDATE sem mudanças produz payload vazio", () => {
    const values = customerFiscalFormSchema.parse({
      use_main_address: true,
      rural_producer_indicator: false,
      foreign_customer_indicator: false,
      country_code: "BR",
    });
    expect(buildUpdatePayload(values, BASE_ROW)).toEqual({});
  });

  test("UPDATE limpa campo (string vazia → null) apenas quando prev não era null", () => {
    const row = { ...BASE_ROW, fiscal_city: "São Paulo" };
    const values = customerFiscalFormSchema.parse({ fiscal_city: "" });
    expect(buildUpdatePayload(values, row)).toEqual({ fiscal_city: null });
  });

  test("Payload nunca contém chaves fora do contrato de customer_fiscal_profiles", () => {
    const ALLOWED = new Set([
      "customer_id",
      "taxpayer_indicator", "state_registration_status", "municipal_registration",
      "fiscal_email", "fiscal_phone", "use_main_address",
      "fiscal_postal_code", "fiscal_street", "fiscal_number",
      "fiscal_complement", "fiscal_neighborhood", "fiscal_city",
      "fiscal_municipality_ibge_code", "fiscal_state", "country_code",
      "rural_producer_indicator", "foreign_customer_indicator",
    ]);
    const values = customerFiscalFormSchema.parse({
      taxpayer_indicator: "1",
      fiscal_municipality_ibge_code: "3550308",
      fiscal_state: "SP",
      country_code: "BR",
      rural_producer_indicator: true,
    });
    const insert = buildInsertPayload(UUID_A, values);
    for (const k of Object.keys(insert)) expect(ALLOWED.has(k)).toBe(true);
    const update = buildUpdatePayload(values, BASE_ROW);
    for (const k of Object.keys(update)) expect(ALLOWED.has(k)).toBe(true);
  });

  test("Payload nunca contém cpf_cnpj (documento não é duplicado)", () => {
    const values = customerFiscalFormSchema.parse({});
    const insert = buildInsertPayload(UUID_A, values);
    expect((insert as Record<string, unknown>).cpf_cnpj).toBeUndefined();
    const update = buildUpdatePayload(values, BASE_ROW);
    expect((update as Record<string, unknown>).cpf_cnpj).toBeUndefined();
  });
});

describe("Fase 3.4 — privacidade e ausência de emissão", () => {
  const dir = resolve(process.cwd(), "src");
  const files = [
    "pages/configuracoes/FiscalClientes.tsx",
    "hooks/useCustomerFiscalProfiles.ts",
    "lib/fiscal/customerFiscalValidation.ts",
  ];
  for (const rel of files) {
    test(`${rel} não referencia emissão/provedor/edge fiscal`, () => {
      const src = readFileSync(resolve(dir, rel), "utf8");
      expect(src).not.toMatch(
        /emitir|transmitir|inutilizar|sefaz|nfe-|nfse-|functions\.invoke|certificate|webhook|prefeitura/i,
      );
    });
    test(`${rel} não escreve CPF/CNPJ em console/log/analytics`, () => {
      const src = readFileSync(resolve(dir, rel), "utf8");
      expect(src).not.toMatch(/console\.(log|info|debug|warn|error)\s*\([^)]*cpf/i);
      expect(src).not.toMatch(/console\.(log|info|debug|warn|error)\s*\([^)]*cnpj/i);
    });
  }
});

describe("Fase 3.4 — regressão das rotas anteriores", () => {
  test("/configuracoes/fiscal/empresa mantém matriz da Fase 3.1", () => {
    expect(getAccessLevel("administrador", "/configuracoes/fiscal/empresa")).toBe("rw");
    expect(getAccessLevel("gestor", "/configuracoes/fiscal/empresa")).toBe("r");
    expect(getAccessLevel("financeiro", "/configuracoes/fiscal/empresa")).toBe("r");
  });
  test("/configuracoes/fiscal/produtos mantém matriz da Fase 3.2", () => {
    expect(getAccessLevel("administrador", "/configuracoes/fiscal/produtos")).toBe("rw");
    expect(getAccessLevel("financeiro", "/configuracoes/fiscal/produtos")).toBe("rw");
    expect(getAccessLevel("gestor", "/configuracoes/fiscal/produtos")).toBe("r");
    expect(getAccessLevel("consultor_tecnico", "/configuracoes/fiscal/produtos")).toBe("none");
  });
  test("/configuracoes/fiscal/servicos mantém matriz da Fase 3.3", () => {
    expect(getAccessLevel("administrador", "/configuracoes/fiscal/servicos")).toBe("rw");
    expect(getAccessLevel("financeiro", "/configuracoes/fiscal/servicos")).toBe("rw");
    expect(getAccessLevel("gestor", "/configuracoes/fiscal/servicos")).toBe("r");
    expect(getAccessLevel("consultor_tecnico", "/configuracoes/fiscal/servicos")).toBe("none");
  });
});
