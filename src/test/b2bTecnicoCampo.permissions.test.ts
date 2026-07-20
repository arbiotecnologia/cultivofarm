import { describe, it, expect } from "vitest";
import {
  canAccess,
  canWrite,
  getAccessLevel,
  getHomeForRole,
} from "@/lib/permissions";

/**
 * Fase 21 — Testes automatizados do perfil parceiro_b2b_tecnico (técnico de campo B2B).
 *
 * Estes testes protegem o reposicionamento realizado nas fases anteriores garantindo:
 *  - Home padrão do técnico B2B é o Dashboard do portal.
 *  - Rotas críticas do portal parceiro respeitam o escopo de cada perfil B2B.
 *  - Técnico B2B não visualiza tela de financeiro nem pode criar pedidos diretos.
 *  - Gestor B2B mantém visibilidade sobre simulações da equipe e criação de pedidos.
 *  - Perfis internos (administrador/gestor_comercial) continuam com acesso total.
 */
describe("Perfil parceiro_b2b_tecnico — permissões de rota", () => {
  it("redireciona o técnico B2B para o dashboard como home", () => {
    expect(getHomeForRole("parceiro_b2b_tecnico")).toBe(
      "/portal-parceiro/dashboard",
    );
  });

  it("mantém o gestor B2B na tela de pedidos como home", () => {
    expect(getHomeForRole("parceiro_b2b")).toBe("/portal-parceiro/pedidos");
  });

  it("permite ao técnico B2B usar o simulador de custos", () => {
    expect(canWrite("parceiro_b2b_tecnico", "/portal-parceiro/simulador")).toBe(
      true,
    );
  });

  it("permite ao técnico B2B gerenciar seus produtores vinculados", () => {
    expect(
      canWrite("parceiro_b2b_tecnico", "/portal-parceiro/meus-produtores"),
    ).toBe(true);
    expect(
      canAccess(
        "parceiro_b2b_tecnico",
        "/portal-parceiro/meus-produtores/abc-123",
      ),
    ).toBe(true);
  });

  it("nega ao técnico B2B a criação direta de pedidos", () => {
    expect(canAccess("parceiro_b2b_tecnico", "/portal-parceiro/novo")).toBe(
      false,
    );
  });

  it("nega ao técnico B2B a área financeira do parceiro", () => {
    expect(
      canAccess("parceiro_b2b_tecnico", "/portal-parceiro/financeiro"),
    ).toBe(false);
  });

  it("nega ao técnico B2B a gestão de vínculos técnicos ↔ produtores", () => {
    expect(
      canAccess(
        "parceiro_b2b_tecnico",
        "/portal-parceiro/tecnicos-produtores",
      ),
    ).toBe(false);
  });

  it("permite ao gestor B2B visualizar simulações da equipe", () => {
    expect(canWrite("parceiro_b2b", "/portal-parceiro/simulacoes-equipe")).toBe(
      true,
    );
  });

  it("permite ao gestor B2B gerenciar vínculos entre técnicos e produtores", () => {
    expect(
      canWrite("parceiro_b2b", "/portal-parceiro/tecnicos-produtores"),
    ).toBe(true);
  });

  it("bloqueia o técnico B2B em pedidos e histórico comercial", () => {
    expect(
      getAccessLevel("parceiro_b2b_tecnico", "/portal-parceiro/pedidos"),
    ).toBe("none");
    expect(
      getAccessLevel("parceiro_b2b_tecnico", "/portal-parceiro/historico"),
    ).toBe("none");
    expect(
      getAccessLevel("parceiro_b2b_tecnico", "/portal-parceiro/meu-historico"),
    ).toBe("none");
  });

  it("preserva acesso total dos perfis internos ao portal parceiro", () => {
    for (const role of ["administrador", "gestor_comercial"] as const) {
      expect(canWrite(role, "/portal-parceiro/simulador")).toBe(true);
      expect(canWrite(role, "/portal-parceiro/meus-produtores")).toBe(true);
      expect(canWrite(role, "/portal-parceiro/tecnicos-produtores")).toBe(true);
    }
  });

  it("não concede ao técnico interno (consultor/tecnico_agronomo) acesso ao portal parceiro", () => {
    for (const role of [
      "consultor_tecnico",
      "tecnico_agronomo",
      "aplicador",
    ] as const) {
      expect(canAccess(role, "/portal-parceiro/simulador")).toBe(false);
      expect(canAccess(role, "/portal-parceiro/meus-produtores")).toBe(false);
    }
  });
});
