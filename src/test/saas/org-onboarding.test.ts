import { describe, expect, it } from "vitest";
import {
  cnpjValido,
  normalizarCnpj,
  onboardingBloqueia,
  pendenciasOnboarding,
  sanitizarPayloadOnboarding,
  transicaoPermitida,
} from "@/lib/saas/orgOnboarding";

const completo = {
  razao_social: "Empresa X", cnpj: "11.222.333/0001-81", cep: "01000-000", logradouro: "Rua A",
  cidade: "São Paulo", uf: "SP", telefone: "11999999999", responsavel_nome: "Fulano",
  fuso_horario: "America/Sao_Paulo", confirmado: true,
};

describe("onboarding de empresa", () => {
  it("normaliza CNPJ para detectar duplicidade", () => {
    expect(normalizarCnpj("11.222.333/0001-81")).toBe(normalizarCnpj("11222333000181"));
    expect(normalizarCnpj("")).toBeNull();
  });
  it("valida dígitos do CNPJ", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.111.111/1111-11")).toBe(false);
    expect(cnpjValido("123")).toBe(false);
  });
  it("rejeita transições inválidas", () => {
    expect(transicaoPermitida("rascunho", "ativa")).toBe(false);
    expect(transicaoPermitida("cancelada", "ativa")).toBe(false);
    expect(transicaoPermitida("aguardando_ativacao", "ativa")).toBe(false);
    expect(transicaoPermitida("onboarding", "ativa")).toBe(true);
  });
  it("bloqueia módulos antes do onboarding", () => {
    expect(onboardingBloqueia("aguardando_ativacao")).toBe(true);
    expect(onboardingBloqueia("onboarding")).toBe(true);
    expect(onboardingBloqueia("ativa")).toBe(false);
  });
  it("exige campos e confirmação", () => {
    expect(pendenciasOnboarding(completo)).toEqual([]);
    expect(pendenciasOnboarding({ ...completo, confirmado: false })).toContain("Confirmação");
    expect(pendenciasOnboarding({ ...completo, uf: "São Paulo" })).toContain("UF");
  });
  it("descarta troca de organization_id/status pelo cliente", () => {
    const r = sanitizarPayloadOnboarding({ ...completo, organization_id: "x", status: "ativa", id: "y" });
    expect(r).not.toHaveProperty("organization_id");
    expect(r).not.toHaveProperty("status");
    expect(r).not.toHaveProperty("id");
  });
});
