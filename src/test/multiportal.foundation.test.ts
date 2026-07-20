import { describe, it, expect } from "vitest";
import {
  normalizeRoles,
  pickPrimaryRole,
  hasPortalRole,
  PORTAL_CONTEXT_HOME,
} from "@/lib/portalContext";
import {
  isB2BQueryKey,
  isTechnicalQueryKey,
  isGlobalQueryKey,
} from "@/lib/portalQueryKeys";
import { routeGroupFromPath } from "@/lib/accessAuditLog";

describe("portalContext.normalizeRoles", () => {
  it("remove duplicados e valores inválidos", () => {
    const roles = normalizeRoles([
      { role: "parceiro_b2b" },
      { role: "parceiro_b2b" },
      { role: "tecnico_agronomo" },
      { role: null },
      { role: "papel_inexistente" },
    ]);
    expect(roles.sort()).toEqual(["parceiro_b2b", "tecnico_agronomo"].sort());
  });

  it("retorna array vazio quando não há papéis", () => {
    expect(normalizeRoles([])).toEqual([]);
  });
});

describe("portalContext.pickPrimaryRole", () => {
  it("prioriza administrador acima de qualquer papel de portal", () => {
    expect(pickPrimaryRole(["parceiro_b2b", "administrador"])).toBe("administrador");
  });

  it("respeita prioridade determinística entre técnicos", () => {
    expect(pickPrimaryRole(["aplicador", "tecnico_agronomo"])).toBe("tecnico_agronomo");
  });

  it("retorna null quando lista vazia", () => {
    expect(pickPrimaryRole([])).toBeNull();
  });
});

describe("portalContext.hasPortalRole", () => {
  it("detecta qualquer papel de portal", () => {
    expect(hasPortalRole(["administrador"])).toBe(false);
    expect(hasPortalRole(["parceiro_b2b"])).toBe(true);
    expect(hasPortalRole(["tecnico_agronomo"])).toBe(true);
  });
});

describe("PORTAL_CONTEXT_HOME", () => {
  it("nunca depende de papel", () => {
    expect(PORTAL_CONTEXT_HOME.b2b).toBe("/portal-parceiro/dashboard");
    expect(PORTAL_CONTEXT_HOME.technical).toBe("/app");
  });
});

describe("portalQueryKeys", () => {
  it("classifica chaves B2B corretamente", () => {
    expect(isB2BQueryKey(["portal-parceiro", "pedidos"])).toBe(true);
    expect(isB2BQueryKey(["partner-orders", 1])).toBe(true);
    expect(isB2BQueryKey(["visita", 1])).toBe(false);
  });

  it("classifica chaves técnicas corretamente", () => {
    expect(isTechnicalQueryKey(["visita", 1])).toBe(true);
    expect(isTechnicalQueryKey(["checkin"])).toBe(true);
    expect(isTechnicalQueryKey(["portal-parceiro"])).toBe(false);
  });

  it("preserva chaves globais", () => {
    expect(isGlobalQueryKey(["available-portal-contexts", "u1"])).toBe(true);
    expect(isB2BQueryKey(["available-portal-contexts"])).toBe(false);
    expect(isTechnicalQueryKey(["available-portal-contexts"])).toBe(false);
  });
});

describe("accessAuditLog.routeGroupFromPath", () => {
  it("extrai os dois primeiros segmentos", () => {
    expect(routeGroupFromPath("/portal-parceiro/pedidos/123")).toBe("portal-parceiro/pedidos");
    expect(routeGroupFromPath("/app")).toBe("app");
    expect(routeGroupFromPath("/")).toBeNull();
  });
});
