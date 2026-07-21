/**
 * Fase Fiscal 3.1 — Testes estáticos e de contrato.
 *
 * Cobrem:
 * - defaults das feature flags;
 * - trava de emissão;
 * - matriz de permissões da rota;
 * - CNPJ válido/inválido;
 * - payload nunca inclui campos secretos, `production_enabled` ou provider != NONE;
 * - imutabilidade de rotas legadas relevantes.
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
  test("fiscalConfigurationUi default = false", () => {
    expect(FEATURE_FLAGS.fiscalConfigurationUi).toBe(false);
  });
  test("fiscalEmissionEnabled default = false (TRAVA)", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
  });
});

describe("Fase 3.1 — matriz de permissões /configuracoes/fiscal/empresa", () => {
  const ROUTE = "/configuracoes/fiscal/empresa";

  test("administrador tem rw", () => {
    expect(getAccessLevel("administrador", ROUTE)).toBe("rw");
  });
  test("gestor tem r", () => {
    expect(getAccessLevel("gestor", ROUTE)).toBe("r");
  });
  test("financeiro tem r", () => {
    expect(getAccessLevel("financeiro", ROUTE)).toBe("r");
  });

  for (const role of [
    "consultor_tecnico",
    "aplicador",
    "operador_onfarm",
    "cliente_produtor",
    "administrativo",
    "tecnico_agronomo",
    "producao",
    "gestor_comercial",
    "parceiro_b2b",
    "parceiro_b2b_tecnico",
  ] as const) {
    test(`${role} não acessa`, () => {
      expect(canAccess(role, ROUTE)).toBe(false);
    });
  }

  test("anônimo/sem papel bloqueado", () => {
    expect(canAccess(null, ROUTE)).toBe(false);
  });
});

describe("Fase 3.1 — CNPJ", () => {
  test("CNPJ válido conhecido passa", () => {
    // 11.222.333/0001-81 é um CNPJ com dígitos verificadores válidos.
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });
  test("CNPJ com dígitos verificadores errados falha", () => {
    expect(isValidCnpj("11222333000180")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
  });
  test("CNPJ curto/longo/vazio falha", () => {
    expect(isValidCnpj("")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
    expect(isValidCnpj("112223330001811")).toBe(false);
  });
  test("CNPJ com todos iguais falha", () => {
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
  });
  test("normalize remove pontuação", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });
});

describe("Fase 3.1 — payload não vaza campos proibidos", () => {
  test("provider é forçado para NONE mesmo se enviado outro", () => {
    const payload = buildUpdatePayload({
      cnpj: "11.222.333/0001-81",
      legal_name: "Empresa Teste",
      fiscal_environment: "HOMOLOGATION",
      configuration_status: "DRAFT",
      nfe_enabled: true,
      nfse_enabled: false,
    });
    expect(payload.fiscal_provider).toBe(LOCKED_PROVIDER);
    expect(LOCKED_PROVIDER).toBe("NONE");
  });

  test("production_enabled NUNCA aparece no payload", () => {
    const payload = buildUpdatePayload({
      legal_name: "X",
      fiscal_environment: "HOMOLOGATION",
    });
    expect(payload).not.toHaveProperty("production_enabled");
  });

  test("nenhuma chave proibida vaza", () => {
    const payload = buildUpdatePayload({
      cnpj: "11222333000181",
      legal_name: "X",
    }) as Record<string, unknown>;
    for (const k of FORBIDDEN_PAYLOAD_KEYS) {
      expect(payload).not.toHaveProperty(k);
    }
  });

  test("CNPJ é normalizado no payload", () => {
    const payload = buildUpdatePayload({
      cnpj: "11.222.333/0001-81",
    }) as Record<string, unknown>;
    expect(payload.cnpj).toBe("11222333000181");
  });

  test("ambientes permitidos são apenas NOT_CONFIGURED e HOMOLOGATION", () => {
    expect(ALLOWED_ENVIRONMENTS).toEqual(["NOT_CONFIGURED", "HOMOLOGATION"]);
    // Tentar PRODUCTION é rejeitado pelo schema.
    const bad = companyFiscalFormSchema.safeParse({
      fiscal_environment: "PRODUCTION",
    });
    expect(bad.success).toBe(false);
  });

  test("status permitidos são apenas DRAFT e PENDING_ACCOUNTING", () => {
    expect(ALLOWED_STATUSES).toEqual(["DRAFT", "PENDING_ACCOUNTING"]);
    const bad = companyFiscalFormSchema.safeParse({
      configuration_status: "VALIDATED",
    });
    expect(bad.success).toBe(false);
  });

  test("schema rejeita CNPJ inválido", () => {
    const bad = companyFiscalFormSchema.safeParse({ cnpj: "11.222.333/0001-80" });
    expect(bad.success).toBe(false);
  });

  test("schema rejeita e-mail inválido", () => {
    const bad = companyFiscalFormSchema.safeParse({ fiscal_email: "nao-email" });
    expect(bad.success).toBe(false);
  });

  test("payload omite campos ausentes (não sobrescreve com null)", () => {
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

  test("nenhum arquivo referencia provedores fiscais", () => {
    const badTerms = [
      /\bFocus\s*NFE\b/i,
      /\bPlugNotas\b/i,
      /\bSEFAZ\b/i,
      /\bprefeitura\b/i,
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

  test("página não expõe botão/ação de emissão", () => {
    const src = readFileSync(pagePath, "utf8");
    for (const rx of [
      />Emitir</,
      />Transmitir</,
      />Cancelar\s*NF/i,
      />Inutilizar</,
      />Consultar\s*SEFAZ</i,
      />Enviar\s*NF/i,
    ]) {
      expect(src, `padrão indevido ${rx} presente`).not.toMatch(rx);
    }
  });

  test("página inclui banner de emissão desativada", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("Emissão fiscal desativada");
  });

  test("rota está registrada no App.tsx", () => {
    const appSrc = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
    expect(appSrc).toContain("/configuracoes/fiscal/empresa");
    expect(appSrc).toContain("<FiscalEmpresa");
  });

  test("navegação/menu principal NÃO expõe a rota (flag OFF)", () => {
    const navSrc = readFileSync(resolve(__dirname, "../../config/navigation.ts"), "utf8");
    expect(navSrc).not.toContain("/configuracoes/fiscal/empresa");
  });
});
