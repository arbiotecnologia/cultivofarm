/**
 * H9-G Bloco 2E — papel efetivo por contexto ativo (fonte canônica única).
 */
import { describe, it, expect } from "vitest";
import {
  rolesForActiveContext,
  resolveEffectiveRouteRole,
  homeForActiveContext,
} from "@/lib/navigation/portalRoleContext";
import { hasVisitaModuleAccess } from "@/lib/visita/visitaRouteAccess";

const MULTI = ["consultor_tecnico", "parceiro_b2b"];
const VISITA = "/visita-tecnica/2572bce1-203c-4237-a61a-e3eb308cc023";

describe("portalRoleContext", () => {
  it("multipapel com Portal Técnico ativo acessa a visita", () => {
    const r = resolveEffectiveRouteRole({
      roles: MULTI,
      primaryRole: "parceiro_b2b",
      path: VISITA,
      activeContext: "technical",
    });
    expect(r.allowed).toBe(true);
    expect(r.role).toBe("consultor_tecnico");
  });

  it("multipapel com Portal B2B ativo NÃO acessa a visita e volta ao B2B", () => {
    const r = resolveEffectiveRouteRole({
      roles: MULTI,
      primaryRole: "parceiro_b2b",
      path: VISITA,
      activeContext: "b2b",
    });
    expect(r.allowed).toBe(false);
    expect(homeForActiveContext(MULTI, "parceiro_b2b", "b2b")).toBe(
      "/portal-parceiro/pedidos",
    );
  });

  it("contexto técnico redireciona rota B2B para a home técnica", () => {
    expect(homeForActiveContext(MULTI, "parceiro_b2b", "technical")).toBe("/app");
  });

  it("admin não regride em nenhum contexto", () => {
    for (const ctx of ["technical", "b2b", "producer", null] as const) {
      const r = resolveEffectiveRouteRole({
        roles: ["administrador"],
        primaryRole: "administrador",
        path: VISITA,
        activeContext: ctx,
      });
      expect(r.allowed).toBe(true);
    }
  });

  it("papel único técnico sem contexto persistido continua acessando", () => {
    const r = resolveEffectiveRouteRole({
      roles: ["consultor_tecnico"],
      primaryRole: "consultor_tecnico",
      path: VISITA,
      activeContext: null,
    });
    expect(r.allowed).toBe(true);
  });

  it("papéis internos nunca são filtrados pelo contexto", () => {
    expect(rolesForActiveContext(["financeiro", "parceiro_b2b"], "technical")).toEqual([
      "financeiro",
    ]);
    expect(rolesForActiveContext(["gestor"], "b2b")).toEqual(["gestor"]);
  });

  it("hasVisitaModuleAccess respeita o contexto ativo", () => {
    expect(hasVisitaModuleAccess(MULTI, "technical")).toBe(true);
    expect(hasVisitaModuleAccess(MULTI, "b2b")).toBe(false);
    expect(hasVisitaModuleAccess(MULTI)).toBe(true);
  });

  it("UUID existente e inexistente produzem a mesma decisão", () => {
    const a = resolveEffectiveRouteRole({
      roles: MULTI,
      primaryRole: "parceiro_b2b",
      path: "/visita-tecnica/2572bce1-203c-4237-a61a-e3eb308cc023",
      activeContext: "b2b",
    });
    const b = resolveEffectiveRouteRole({
      roles: MULTI,
      primaryRole: "parceiro_b2b",
      path: "/visita-tecnica/00000000-0000-4000-8000-000000000000",
      activeContext: "b2b",
    });
    expect(a).toEqual(b);
  });
});
