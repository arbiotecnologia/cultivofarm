/**
 * H9-G Bloco 2C — decisão pura de acesso às rotas internas de visita.
 * Nenhum estado depende do UUID: existente e inexistente são indistinguíveis.
 */
import { describe, it, expect } from "vitest";
import {
  resolveVisitaRouteAccess,
  hasVisitaModuleAccess,
  VISITA_GUARD_TIMEOUT_MS,
} from "@/lib/visita/visitaRouteAccess";

const base = { loading: false, hasUser: true, roles: [] as string[] };

describe("resolveVisitaRouteAccess", () => {
  it("carregando enquanto dentro do prazo", () => {
    expect(resolveVisitaRouteAccess({ ...base, loading: true })).toBe("carregando");
  });

  it("nunca permanece carregando após o prazo (sem spinner infinito)", () => {
    expect(
      resolveVisitaRouteAccess({ ...base, loading: true, timedOut: true }),
    ).toBe("erro");
    expect(VISITA_GUARD_TIMEOUT_MS).toBeLessThanOrEqual(10000);
  });

  it("erro de rede/sessão → erro", () => {
    expect(
      resolveVisitaRouteAccess({ ...base, error: "Falha ao carregar dados do usuário." }),
    ).toBe("erro");
  });

  it("anônimo → nao_autenticado", () => {
    expect(resolveVisitaRouteAccess({ ...base, hasUser: false })).toBe("nao_autenticado");
  });

  it("produtor → negado", () => {
    expect(resolveVisitaRouteAccess({ ...base, roles: ["cliente_produtor"] })).toBe("negado");
  });

  it("financeiro → negado", () => {
    expect(resolveVisitaRouteAccess({ ...base, roles: ["financeiro"] })).toBe("negado");
  });

  it("usuário sem papel → negado", () => {
    expect(resolveVisitaRouteAccess({ ...base, roles: [] })).toBe("negado");
  });

  it("admin, consultor e técnico → permitido", () => {
    for (const r of ["administrador", "consultor_tecnico", "tecnico_agronomo", "gestor"]) {
      expect(resolveVisitaRouteAccess({ ...base, roles: [r] })).toBe("permitido");
    }
  });

  it("multipapel produtor+consultor → permitido", () => {
    expect(
      resolveVisitaRouteAccess({ ...base, roles: ["cliente_produtor", "consultor_tecnico"] }),
    ).toBe("permitido");
  });

  it("hasVisitaModuleAccess reflete a matriz de permissões", () => {
    expect(hasVisitaModuleAccess(["cliente_produtor"])).toBe(false);
    expect(hasVisitaModuleAccess(["administrador"])).toBe(true);
  });
});
