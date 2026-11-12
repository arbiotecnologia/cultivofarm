/**
 * Fase Fiscal 3.1 — Testes estáticos e de contrato.
 *
 * Adaptado na Fase 3.15: `fiscalConfigurationUi` liberada (true) e rota
 * agora listada na navegação. Demais garantias — trava de emissão,
 * ambientes e ausência de integração — permanecem.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { getAccessLevel, canAccess } from "@/lib/permissions";
import {
  isValidCnpj,
  normalizeCnpj,
  buildUpdatePayload,
  FORBIDDEN_PAYLOAD_KEYS,
  LOCKED_PROVIDER,
  ALLOWED_ENVIRONMENTS,
  ALLOWED_STATUSES,
  companyFiscalFormSchema,
} from "@/lib/fiscal/companyFiscalValidation";

describe("Fase 3.1 — feature flags", () => {
  test("fiscalConfigurationUi liberada na Fase 3.15", () => {
    expect(FEATURE_FLAGS.fiscalConfigurationUi).toBe(true);
  });
  test("fiscalEmissionEnabled continua false (TRAVA)", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
  });
});

describe("Fase 3.1 — matriz de permissões /configuracoes/fiscal/empresa", () => {
  const ROUTE = "/configuracoes/fiscal/empresa";
  test("administrador tem rw", () => expect(getAccessLevel("administrador", ROUTE)).toBe("rw"));
  test("gestor tem r", () => expect(getAccessLevel("gestor", ROUTE)).toBe("r"));
  test("financeiro tem r", () => expect(getAccessLevel("financeiro", ROUTE)).toBe("r"));

  for (const role of [
    "consultor_tecnico", "aplicador", "operador_onfarm", "cliente_produtor",
    "administrativo", "tecnico_agronomo", "producao", "gestor_comercial",
    "parceiro_b2b", "parceiro_b2b_tecnico",
  ] as const) {
    test(`${role} não acessa`, () => expect(canAccess(role, ROUTE)).toBe(false));
  }
  test("anônimo bloqueado", () => expect(canAccess(null, ROUTE)).toBe(false));
});

describe("Fase 3.1 — CNPJ", () => {
  test("válido passa", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });
  test("inválido falha", () => {
    expect(isValidCnpj("11222333000180")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
  });
  test("tamanho/vazio", () => {
    expect(isValidCnpj("")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
    expect(isValidCnpj("112223330001811")).toBe(false);
  });
  test("todos iguais", () => {
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
  });
  test("normalize", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });
});

describe("Fase 3.1 — payload não vaza campos proibidos", () => {
  test("legacy provider é forçado a NONE", () => {
    const payload = buildUpdatePayload({
      cnpj: "11.222.333/0001-81",
      legal_name: "Empresa Teste",
      fiscal_environment: "HOMOLOGATION",
      configuration_status: "DRAFT",
      nfe_enabled: true,
      nfse_enabled: false,
    }) as Record<string, unknown>;
    expect(payload.fiscal_provider).toBe(LOCKED_PROVIDER);
    expect(LOCKED_PROVIDER).toBe("NONE");
  });

  test("production_enabled NUNCA aparece no payload", () => {
    const payload = buildUpdatePayload({ legal_name: "X", fiscal_environment: "HOMOLOGATION" });
    expect(payload).not.toHaveProperty("production_enabled");
  });

  test("nenhuma chave proibida vaza", () => {
    const payload = buildUpdatePayload({ cnpj: "11222333000181", legal_name: "X" }) as Record<string, unknown>;
    for (const k of FORBIDDEN_PAYLOAD_KEYS) expect(payload).not.toHaveProperty(k);
  });

  test("CNPJ normalizado", () => {
    const payload = buildUpdatePayload({ cnpj: "11.222.333/0001-81" }) as Record<string, unknown>;
    expect(payload.cnpj).toBe("11222333000181");
  });

  test("ambientes permitidos", () => {
    expect(ALLOWED_ENVIRONMENTS).toEqual(["NOT_CONFIGURED", "HOMOLOGATION"]);
    expect(companyFiscalFormSchema.safeParse({ fiscal_environment: "PRODUCTION" }).success).toBe(false);
  });

  test("status permitidos (não incluem estados de emissão)", () => {
    expect(ALLOWED_STATUSES).toEqual(["DRAFT", "PENDING_ACCOUNTING", "VALIDATED", "BLOCKED"]);
    expect(companyFiscalFormSchema.safeParse({ configuration_status: "AUTHORIZED" }).success).toBe(false);
  });

  test("CNPJ inválido rejeitado", () => {
    expect(companyFiscalFormSchema.safeParse({ cnpj: "11.222.333/0001-80" }).success).toBe(false);
  });

  test("e-mail inválido rejeitado", () => {
    expect(companyFiscalFormSchema.safeParse({ fiscal_email: "nao-email" }).success).toBe(false);
  });

  test("payload omite ausentes", () => {
    const payload = buildUpdatePayload({ legal_name: "Só nome" }) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("cnpj");
    expect(payload).not.toHaveProperty("street");
    expect(payload).toHaveProperty("legal_name", "Só nome");
  });
});

describe("Fase 3.1 — código não contém integração/emissão prematura", () => {
  const pagePath = resolve(__dirname, "../../pages/configuracoes/FiscalEmpresa.tsx");
  const hookPath = resolve(__dirname, "../../hooks/useFiscalCompanySettings.ts");
  const files = [pagePath, hookPath];

  test("nenhum arquivo referencia material criptográfico", () => {
    const badTerms = [
      /\bcertificado\s*(a1|pfx|p12)\b/i,
      /\bprivate[_-]?key\b/i,
      /\bclient[_-]?secret\b/i,
      /\bwebhook[_-]?secret\b/i,
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const rx of badTerms) {
        expect(src, `${file} contém padrão vetado ${rx}`).not.toMatch(rx);
      }
    }
  });

  test("página sem botão/ação de emissão", () => {
    const src = readFileSync(pagePath, "utf8");
    for (const rx of [/>Emitir</, />Transmitir</, />Cancelar\s*NF/i, />Inutilizar</, />Consultar\s*SEFAZ</i, />Enviar\s*NF/i, />Homologar</, />Testar\s*provedor</i]) {
      expect(src, `padrão indevido ${rx}`).not.toMatch(rx);
    }
  });

  test("banner de emissão desativada presente", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("Emissão fiscal desativada");
  });

  test("rota registrada em App.tsx", () => {
    const appSrc = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
    expect(appSrc).toContain("/configuracoes/fiscal/empresa");
    expect(appSrc).toContain("<FiscalEmpresa");
  });

  test("navegação EXPÕE a rota (flag ON na Fase 3.15)", () => {
    const navSrc = readFileSync(resolve(__dirname, "../../config/navigation.ts"), "utf8");
    expect(navSrc).toContain("/configuracoes/fiscal/empresa");
  });
});
