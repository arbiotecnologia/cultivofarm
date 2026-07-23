/**
 * Fase Corretiva — Blocos 3 e 4.
 * Auditoria estática: rótulos canônicos, máscara de CPF/CNPJ
 * (incluindo CNPJ alfanumérico da IN RFB 2.229/2024) e sanitização
 * do termo de busca do PostgREST.
 * Sem banco, sem RLS, sem produção.
 */
import { describe, it, expect } from "vitest";
import {
  PRODUCT_FISCAL_PROFILE_STATUS_OPTIONS,
  SERVICE_FISCAL_PROFILE_STATUS_OPTIONS,
  CUSTOMER_FISCAL_PROFILE_STATUS_OPTIONS,
  PRODUCT_FISCAL_PROFILE_STATUSES,
  SERVICE_FISCAL_PROFILE_STATUSES,
  CUSTOMER_FISCAL_PROFILE_STATUSES,
  TAXPAYER_INDICATOR_OPTIONS,
  getFiscalStatusLabel,
  getTaxpayerIndicatorLabel,
} from "@/lib/fiscal/fiscalOptions";
import { maskDocument } from "@/lib/fiscal/customerFiscalValidation";
import { sanitizePostgrestTerm } from "@/hooks/useFiscalClientesLite";

describe("Bloco 3 — status canônicos (produto)", () => {
  it("lista exatamente os 5 status do CHECK", () => {
    expect([...PRODUCT_FISCAL_PROFILE_STATUSES].sort()).toEqual(
      ["BLOCKED", "DRAFT", "NOT_FISCALLY_SOLD", "PENDING_ACCOUNTING", "VALIDATED"].sort(),
    );
    expect(PRODUCT_FISCAL_PROFILE_STATUS_OPTIONS).toHaveLength(5);
  });
  it("rótulos pt-BR sem alterar o valor persistido", () => {
    expect(getFiscalStatusLabel("product", "DRAFT")).toBe("Rascunho");
    expect(getFiscalStatusLabel("product", "PENDING_ACCOUNTING")).toBe("Aguardando contabilidade");
    expect(getFiscalStatusLabel("product", "VALIDATED")).toBe("Validado");
    expect(getFiscalStatusLabel("product", "BLOCKED")).toBe("Bloqueado");
    expect(getFiscalStatusLabel("product", "NOT_FISCALLY_SOLD")).toBe("Não vendido fiscalmente");
  });
  it("fallback seguro para valor desconhecido / vazio", () => {
    expect(getFiscalStatusLabel("product", "XYZ")).toBe("Status não reconhecido");
    expect(getFiscalStatusLabel("product", null)).toBe("—");
    expect(getFiscalStatusLabel("product", "")).toBe("—");
  });
});

describe("Bloco 3 — status canônicos (serviço)", () => {
  it("lista exatamente os 5 status do CHECK (inclui NOT_FISCALLY_BILLED — fase 3.19.x)", () => {
    expect([...SERVICE_FISCAL_PROFILE_STATUSES].sort()).toEqual(
      ["BLOCKED", "DRAFT", "NOT_FISCALLY_BILLED", "PENDING_ACCOUNTING", "VALIDATED"].sort(),
    );
    expect(SERVICE_FISCAL_PROFILE_STATUS_OPTIONS).toHaveLength(5);
  });
  it("rótulos pt-BR", () => {
    expect(getFiscalStatusLabel("service", "DRAFT")).toBe("Rascunho");
    expect(getFiscalStatusLabel("service", "PENDING_ACCOUNTING")).toBe("Aguardando contabilidade");
    expect(getFiscalStatusLabel("service", "VALIDATED")).toBe("Validado");
    expect(getFiscalStatusLabel("service", "BLOCKED")).toBe("Bloqueado");
  });
});

describe("Bloco 3 — status canônicos (cliente)", () => {
  it("lista exatamente os 4 status do CHECK", () => {
    expect([...CUSTOMER_FISCAL_PROFILE_STATUSES].sort()).toEqual(
      ["BLOCKED", "INCOMPLETE", "PENDING_REVIEW", "VALIDATED"].sort(),
    );
    expect(CUSTOMER_FISCAL_PROFILE_STATUS_OPTIONS).toHaveLength(4);
  });
  it("rótulos pt-BR", () => {
    expect(getFiscalStatusLabel("customer", "INCOMPLETE")).toBe("Incompleto");
    expect(getFiscalStatusLabel("customer", "PENDING_REVIEW")).toBe("Aguardando revisão");
    expect(getFiscalStatusLabel("customer", "VALIDATED")).toBe("Validado");
    expect(getFiscalStatusLabel("customer", "BLOCKED")).toBe("Bloqueado");
  });
});

describe("Bloco 3 — indicador de contribuinte", () => {
  it("mantém 1/2/9 e rótulos pt-BR estáveis", () => {
    expect(TAXPAYER_INDICATOR_OPTIONS.map((o) => o.value)).toEqual(["1", "2", "9"]);
    expect(getTaxpayerIndicatorLabel("1")).toBe("Contribuinte de ICMS");
    expect(getTaxpayerIndicatorLabel("2")).toBe("Contribuinte isento de IE");
    expect(getTaxpayerIndicatorLabel("9")).toBe("Não contribuinte");
    expect(getTaxpayerIndicatorLabel("7")).toBe("Indicador não reconhecido");
    expect(getTaxpayerIndicatorLabel(null)).toBe("—");
  });
});

describe("Bloco 4 — maskDocument (CPF, CNPJ numérico e alfanumérico)", () => {
  it("mascara CPF de 11 dígitos revelando 2 DVs finais", () => {
    expect(maskDocument("12345678909")).toBe("***.***.***-09");
    expect(maskDocument("123.456.789-09")).toBe("***.***.***-09");
  });
  it("mascara CNPJ numérico de 14 dígitos", () => {
    expect(maskDocument("12345678000195")).toBe("**.***.***/****-95");
    expect(maskDocument("12.345.678/0001-95")).toBe("**.***.***/****-95");
  });
  it("mascara CNPJ alfanumérico (IN RFB 2.229/2024)", () => {
    // 12 alfanuméricos + 2 DVs numéricos
    expect(maskDocument("12ABC34501DE35")).toBe("**.***.***/****-35");
    // aceita minúsculas — normaliza para uppercase
    expect(maskDocument("12abc34501de35")).toBe("**.***.***/****-35");
    // com separadores permitidos
    expect(maskDocument("12.ABC.345/01DE-35")).toBe("**.***.***/****-35");
  });
  it("rejeita entradas inválidas sem lançar", () => {
    expect(maskDocument(null)).toBe("***");
    expect(maskDocument("")).toBe("***");
    expect(maskDocument("abc")).toBe("***");
    // 13 dígitos: nem CPF nem CNPJ
    expect(maskDocument("1234567890123")).toBe("***");
    // 14 chars mas DVs não numéricos
    expect(maskDocument("12ABC34501DEAB")).toBe("***");
  });
});

describe("Bloco 4 — sanitizePostgrestTerm", () => {
  it("remove vírgula, parênteses e curingas do PostgREST", () => {
    expect(sanitizePostgrestTerm("a,b(c)d%e_f*g")).toBe("a b c d e f g");
  });
  it("colapsa espaços e faz trim", () => {
    expect(sanitizePostgrestTerm("   foo    bar   ")).toBe("foo bar");
  });
  it("limita a 60 caracteres", () => {
    const long = "x".repeat(200);
    expect(sanitizePostgrestTerm(long)).toHaveLength(60);
  });
  it("remove caracteres de controle", () => {
    expect(sanitizePostgrestTerm("foo\u0000\u0001bar")).toBe("foobar");
  });
  it("string vazia retorna vazio", () => {
    expect(sanitizePostgrestTerm("")).toBe("");
  });
});
