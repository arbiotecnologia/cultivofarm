import { describe, it, expect } from "vitest";
import {
  resolveSafeHome,
  getEffectiveRole,
  ACESSO_PENDENTE_PATH,
  SEM_PERMISSAO_PATH,
} from "@/lib/navigation/safeHome";

describe("H9-G 2D — destino seguro do botão Voltar", () => {
  it("anônimo vai para /auth", () => {
    expect(resolveSafeHome({ hasUser: false })).toBe("/auth");
  });

  it("cliente_produtor volta ao portal operacional, nunca a acesso pendente", () => {
    const dest = resolveSafeHome({
      hasUser: true,
      roles: ["cliente_produtor"],
      primaryRole: "cliente_produtor",
      availableContexts: [],
    });
    expect(dest).toBe("/app");
    expect(dest).not.toBe(ACESSO_PENDENTE_PATH);
  });

  it("cliente_produtor sem contextos resolvidos ainda volta ao portal", () => {
    expect(
      resolveSafeHome({ hasUser: true, roles: ["cliente_produtor"], availableContexts: null }),
    ).toBe("/app");
  });

  it("financeiro volta à home financeira", () => {
    expect(resolveSafeHome({ hasUser: true, roles: ["financeiro"] })).toBe("/financeiro");
  });

  it("contexto canônico produtor residual volta a /app sem herdar o portal B2B", () => {
    expect(resolveSafeHome({ hasUser: true, roles: ["parceiro_b2b", "cliente_produtor"], availableContexts: ["producer"] })).toBe("/app");
  });

  it("contextos B2B e produtor autorizados mantêm o seletor canônico", () => {
    expect(resolveSafeHome({ hasUser: true, roles: ["parceiro_b2b", "cliente_produtor"], availableContexts: ["b2b", "producer"] })).toBe("/selecionar-portal");
  });

  it("admin volta ao dashboard geral mesmo com contextos de portal", () => {
    expect(
      resolveSafeHome({
        hasUser: true,
        roles: ["administrador"],
        availableContexts: ["b2b", "technical"],
      }),
    ).toBe("/dashboard/geral");
  });

  it("multipapel de portal vai ao seletor", () => {
    expect(
      resolveSafeHome({
        hasUser: true,
        roles: ["cliente_produtor", "parceiro_b2b"],
        availableContexts: ["b2b", "technical"],
      }),
    ).toBe("/selecionar-portal");
  });

  it("contexto único B2B vai ao dashboard do parceiro", () => {
    expect(
      resolveSafeHome({ hasUser: true, roles: ["parceiro_b2b"], availableContexts: ["b2b"] }),
    ).toBe("/portal-parceiro/dashboard");
  });

  it("multipapel escolhe o papel de maior acesso", () => {
    expect(getEffectiveRole(["cliente_produtor", "administrador"])).toBe("administrador");
    expect(resolveSafeHome({ hasUser: true, roles: ["cliente_produtor", "financeiro"] })).toBe(
      "/financeiro",
    );
  });

  it("acesso pendente somente sem papel algum", () => {
    expect(resolveSafeHome({ hasUser: true, roles: [], availableContexts: [] })).toBe(
      ACESSO_PENDENTE_PATH,
    );
  });

  it("nunca devolve a própria tela de bloqueio (sem loop)", () => {
    const casos = [
      { hasUser: true, roles: ["cliente_produtor"] },
      { hasUser: true, roles: ["financeiro"] },
      { hasUser: true, roles: ["administrador"] },
      { hasUser: true, roles: ["parceiro_b2b"], availableContexts: ["b2b" as const] },
    ];
    for (const c of casos) {
      const dest = resolveSafeHome(c);
      expect(dest).not.toBe(SEM_PERMISSAO_PATH);
      expect(dest).not.toBe(ACESSO_PENDENTE_PATH);
    }
  });
});
