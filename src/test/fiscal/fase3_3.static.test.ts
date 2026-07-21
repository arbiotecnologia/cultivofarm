/**
 * Fase Fiscal 3.3 — Testes estáticos.
 * Cobrem: flag default, matriz de permissões, rota, identidade
 * (service_id opcional + source_reference com btrim/case-insensitive),
 * exigência de ao menos um identificador, validação de CNAE/IBGE/ISS,
 * payloads diff-only, ausência de emissão e regressão das Fases 3.1/3.2.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { getAccessLevel } from "@/lib/permissions";
import {
  serviceFiscalFormSchema,
  buildInsertPayload,
  buildUpdatePayload,
  buildIdentity,
  assertIdentity,
  normalizeSourceReferenceKey,
  trimmedSourceReference,
  MissingServiceIdentifierError,
  digitsOnly,
  type ServiceFiscalRow,
} from "@/lib/fiscal/serviceFiscalValidation";

const ROUTE = "/configuracoes/fiscal/servicos";

const BASE_ROW: ServiceFiscalRow = {
  id: "profile-1",
  service_id: null,
  source_reference: "svc-001",
  is_active: true,
  service_name: null,
  fiscal_description_template: null,
  national_taxation_code: null,
  municipal_taxation_code: null,
  lc116_item: null,
  cnae: null,
  iss_rate: null,
  iss_withheld_default: false,
  incidence_municipality_ibge_code: null,
  requirement_status: null,
  federal_withholding_defaults: null,
  profile_status: "DRAFT",
  accounting_notes: null,
  accounting_validated_at: null,
  accounting_validated_by: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  created_by: null,
  updated_by: null,
};

describe("Fase 3.3 — feature flag", () => {
  test("fiscalServiceProfilesUi default = false", () => {
    expect(FEATURE_FLAGS.fiscalServiceProfilesUi).toBe(false);
  });
  test("fiscalEmissionEnabled continua false", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
  });
});

describe("Fase 3.3 — matriz de permissões", () => {
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

describe("Fase 3.3 — identidade (service_id opcional, source_reference transitória)", () => {
  test("btrim em source_reference; string vazia vira null", () => {
    expect(trimmedSourceReference("  svc-1  ")).toBe("svc-1");
    expect(trimmedSourceReference("   ")).toBeNull();
    expect(trimmedSourceReference(null)).toBeNull();
  });
  test("chave canônica é case-insensitive", () => {
    expect(normalizeSourceReferenceKey("  SvC-1  ")).toBe("svc-1");
    expect(normalizeSourceReferenceKey("SVC-1")).toBe(
      normalizeSourceReferenceKey("svc-1"),
    );
  });
  test("buildIdentity aceita UUID válido e ignora strings arbitrárias", () => {
    const good = buildIdentity({ service_id: "00000000-0000-0000-0000-000000000000" });
    expect(good.service_id).toBe("00000000-0000-0000-0000-000000000000");
    const bad = buildIdentity({ service_id: "nao-uuid" });
    expect(bad.service_id).toBeNull();
  });
  test("assertIdentity rejeita ausência de qualquer identificador", () => {
    expect(() => assertIdentity({ service_id: null, source_reference: null }))
      .toThrow(MissingServiceIdentifierError);
  });
  test("assertIdentity aceita apenas source_reference", () => {
    expect(() => assertIdentity({ service_id: null, source_reference: "svc-1" }))
      .not.toThrow();
  });
  test("assertIdentity aceita apenas service_id", () => {
    expect(() => assertIdentity({
      service_id: "00000000-0000-0000-0000-000000000000",
      source_reference: null,
    })).not.toThrow();
  });
});

describe("Fase 3.3 — validações CNAE/IBGE/ISS", () => {
  test("CNAE 7 dígitos aceito e normalizado", () => {
    const r = serviceFiscalFormSchema.safeParse({ cnae: "1234-5/67" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cnae).toBe("1234567");
  });
  test("CNAE com 6 dígitos falha", () => {
    const r = serviceFiscalFormSchema.safeParse({ cnae: "123456" });
    expect(r.success).toBe(false);
  });
  test("IBGE 7 dígitos aceito", () => {
    const r = serviceFiscalFormSchema.safeParse({
      incidence_municipality_ibge_code: "3550308",
    });
    expect(r.success).toBe(true);
  });
  test("IBGE com 6 dígitos falha", () => {
    const r = serviceFiscalFormSchema.safeParse({
      incidence_municipality_ibge_code: "355030",
    });
    expect(r.success).toBe(false);
  });
  test("ISS 0..100 aceito (inclusive limites e decimal com vírgula)", () => {
    expect(serviceFiscalFormSchema.safeParse({ iss_rate: "0" }).success).toBe(true);
    expect(serviceFiscalFormSchema.safeParse({ iss_rate: "100" }).success).toBe(true);
    expect(serviceFiscalFormSchema.safeParse({ iss_rate: "2,5" }).success).toBe(true);
  });
  test("ISS fora de [0..100] falha", () => {
    expect(serviceFiscalFormSchema.safeParse({ iss_rate: "-1" }).success).toBe(false);
    expect(serviceFiscalFormSchema.safeParse({ iss_rate: "100.01" }).success).toBe(false);
    expect(serviceFiscalFormSchema.safeParse({ iss_rate: "abc" }).success).toBe(false);
  });
  test("Campos vazios são aceitos (não obrigatórios)", () => {
    expect(serviceFiscalFormSchema.safeParse({}).success).toBe(true);
  });
  test("digitsOnly normaliza corretamente", () => {
    expect(digitsOnly("12a.34-b56")).toBe("123456");
    expect(digitsOnly(null)).toBe("");
  });
});

describe("Fase 3.3 — payloads", () => {
  test("INSERT exige identidade e omite campos vazios", () => {
    const identity = buildIdentity({ source_reference: "  svc-42  " });
    const values = serviceFiscalFormSchema.parse({ cnae: "1234567" });
    const payload = buildInsertPayload(identity, values);
    expect(payload.source_reference).toBe("svc-42");
    expect(payload.service_id).toBeUndefined();
    expect(payload.cnae).toBe("1234567");
    expect((payload as Record<string, unknown>).id).toBeUndefined();
    expect((payload as Record<string, unknown>).created_at).toBeUndefined();
    expect((payload as Record<string, unknown>).is_active).toBeUndefined();
  });

  test("INSERT sem identidade lança MissingServiceIdentifierError", () => {
    const values = serviceFiscalFormSchema.parse({});
    expect(() =>
      buildInsertPayload({ service_id: null, source_reference: null }, values),
    ).toThrow(MissingServiceIdentifierError);
  });

  test("UPDATE diff-only envia somente campos alterados", () => {
    const values = serviceFiscalFormSchema.parse({
      cnae: "1234567",
      lc116_item: "1.05",
    });
    const payload = buildUpdatePayload(values, BASE_ROW);
    expect(payload).toEqual({ cnae: "1234567", lc116_item: "1.05" });
  });

  test("UPDATE nunca inclui id/timestamps/is_active/profile_status/system", () => {
    const values = serviceFiscalFormSchema.parse({ cnae: "1234567" });
    const payload = buildUpdatePayload(values, BASE_ROW);
    const keys = Object.keys(payload);
    for (const forbidden of [
      "id", "created_at", "updated_at", "is_active", "profile_status",
      "created_by", "updated_by", "accounting_validated_at", "accounting_validated_by",
      "federal_withholding_defaults",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  test("UPDATE sem mudanças produz payload vazio (não sobrescreve dados)", () => {
    const values = serviceFiscalFormSchema.parse({});
    // rowToFormValues não é usado aqui: schema parse com {} não altera row.
    // Reproduzimos "form idêntico ao row" preenchendo os campos existentes.
    const equalValues = serviceFiscalFormSchema.parse({
      service_name: "",
      fiscal_description_template: "",
      lc116_item: "",
      cnae: "",
      national_taxation_code: "",
      municipal_taxation_code: "",
      incidence_municipality_ibge_code: "",
      requirement_status: "",
      accounting_notes: "",
      iss_rate: "",
      iss_withheld_default: false,
    });
    expect(buildUpdatePayload(values, BASE_ROW)).toEqual({});
    expect(buildUpdatePayload(equalValues, BASE_ROW)).toEqual({});
  });

  test("UPDATE limpa campo (string vazia → null) apenas quando prev não era null", () => {
    const row = { ...BASE_ROW, cnae: "1234567" };
    const values = serviceFiscalFormSchema.parse({ cnae: "" });
    expect(buildUpdatePayload(values, row)).toEqual({ cnae: null });
  });

  test("UPDATE inclui service_id/source_reference apenas quando identidade muda", () => {
    const values = serviceFiscalFormSchema.parse({});
    const sameIdentity = buildIdentity({ source_reference: "svc-001" });
    const payloadSame = buildUpdatePayload(values, BASE_ROW, sameIdentity);
    expect(payloadSame.source_reference).toBeUndefined();
    const changed = buildIdentity({ source_reference: "svc-002" });
    const payloadChanged = buildUpdatePayload(values, BASE_ROW, changed);
    expect(payloadChanged.source_reference).toBe("svc-002");
  });

  test("Payload nunca contém chaves fora do contrato de service_fiscal_profiles", () => {
    const ALLOWED = new Set([
      "service_id", "source_reference",
      "service_name", "fiscal_description_template",
      "lc116_item", "cnae",
      "national_taxation_code", "municipal_taxation_code",
      "incidence_municipality_ibge_code", "requirement_status",
      "accounting_notes",
      "iss_rate", "iss_withheld_default",
    ]);
    const identity = buildIdentity({ source_reference: "svc-9" });
    const values = serviceFiscalFormSchema.parse({
      cnae: "1234567", iss_rate: "2.5", iss_withheld_default: true,
    });
    const insert = buildInsertPayload(identity, values);
    for (const k of Object.keys(insert)) expect(ALLOWED.has(k)).toBe(true);
    const update = buildUpdatePayload(values, BASE_ROW, identity);
    for (const k of Object.keys(update)) expect(ALLOWED.has(k)).toBe(true);
  });
});

describe("Fase 3.3 — ausência de emissão e integração", () => {
  const dir = resolve(process.cwd(), "src");
  const files = [
    "pages/configuracoes/FiscalServicos.tsx",
    "hooks/useServiceFiscalProfiles.ts",
    "lib/fiscal/serviceFiscalValidation.ts",
  ];
  for (const rel of files) {
    test(`${rel} não referencia emissão/provedor/edge fiscal`, () => {
      const src = readFileSync(resolve(dir, rel), "utf8");
      expect(src).not.toMatch(
        /emitir|transmitir|inutilizar|sefaz|nfe-|nfse-|functions\.invoke|certificate|webhook|prefeitura/i,
      );
    });
  }
});

describe("Fase 3.3 — regressão das rotas anteriores", () => {
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
});
