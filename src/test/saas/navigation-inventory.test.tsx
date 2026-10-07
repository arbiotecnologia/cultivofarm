import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { declaredRoutes, matchesRoute } from "../../../scripts/navigation-audit/inventory";
import inventory from "../../../docs/auditorias/auditoria-rotas-inventario-2026-10-07.json";
import { navigation } from "@/config/navigation";
import { PRODUTOR_MENU_GROUPS, PARCEIRO_GESTOR_GROUPS, PARCEIRO_TECNICO_GROUPS } from "@/config/portalMenus";
import { featureForPath, isPathEntitled } from "@/lib/saas/featureRouteMap";
import { canAccess } from "@/lib/permissions";

const routes = declaredRoutes();
const nav = navigation.flatMap((item) => [item, ...(item.children ?? [])]);
const portals = [PRODUTOR_MENU_GROUPS, PARCEIRO_GESTOR_GROUPS, PARCEIRO_TECNICO_GROUPS].flatMap((groups) => groups.flatMap((group) => group.items));
const all = [...nav, ...portals];
const read = (path: string) => readFileSync(path, "utf8");

describe("Auditoria integral — contratos estruturais (não equivalem a Auth/RLS real)", () => {
  it("nenhuma rota muda sem revisão da matriz completa", () => {
    expect(routes.map(({ path, components, ancestors, redirect }) => ({ path, components, ancestors, redirect })))
      .toEqual(inventory.routes.map(({ path, components, ancestors, redirect }) => ({ path, components, ancestors, redirect })));
    for (const row of inventory.routes) expect(row.navigation.length > 0 || row.classification !== 1).toBe(true);
  });
  it.each(all)("navegação $id resolve uma rota real, sem recorrer ao catch-all", (item) => {
    expect(routes.some((route) => matchesRoute(route.path, item.route))).toBe(true);
  });
  it("aliases declarados no registro também existem", () => {
    for (const item of nav) for (const alias of item.legacyRoutes ?? []) {
      expect(routes.some((route) => matchesRoute(route.path, alias)), alias).toBe(true);
    }
  });
  it("rotas contratáveis têm guard de plano ou redirecionam para destino protegido", () => {
    for (const route of routes.filter((r) => featureForPath(r.path))) {
      if (route.redirect) {
        expect(routes.some((target) => matchesRoute(target.path, route.redirect ?? "") && [...target.components, ...target.ancestors].includes("RoleGuard")), route.path).toBe(true);
      } else {
        expect([...route.components, ...route.ancestors].some((name) => name === "RoleGuard" || name === "EntitlementOutlet"), route.path).toBe(true);
      }
    }
  });
  it("17 funcionalidades do catálogo vivo têm rota estrutural correspondente", () => {
    const keys = ["fichas_tecnicas", "recomendacoes_alertas", "visitas_tecnicas", "catalogo_precos", "pedidos_b2b", "simulacoes", "envios_automaticos", "contas_pagar", "contas_receber", "fluxo_caixa", "emissao_nfe_nfse", "envase", "estoque_embalagens", "lotes_qualidade", "ordens_producao", "paineis_executivos", "relatorios_operacionais"];
    for (const key of keys) expect(routes.some((route) => featureForPath(route.path) === key), key).toBe(true);
    // Snapshot read-only de 2026-10-07; novo catálogo remoto requer reauditoria.
    expect(new Set(inventory.routes.map((r) => r.feature).filter(Boolean))).toEqual(new Set(keys));
  });
  it("desktop/mobile mantêm fontes existentes e o mesmo filtro de plano", () => {
    expect(read("src/components/AppSidebar.tsx")).toContain("isPathEntitled");
    expect(read("src/pages/app/MobileLayout.tsx")).toContain("isPathEntitled(tab.path, entitlements)");
    expect(read("src/pages/portal-parceiro/PortalParceiroLayout.tsx")).toContain("isPathEntitled(item.route, entitlements)");
    expect(inventory.navigation.map((n) => [n.id, n.route, n.audience])).toEqual([
      ...nav.map((n) => [n.id, n.route, n.platforms.join(",")]),
      ...portals.map((n) => [n.id, n.route, n.showFor ?? "producer"]),
    ]);
  });
  it("negação de papel é explícita e distinta de plano/404", () => {
    expect(read("src/App.tsx")).toContain('to="/sem-permissao" state={{ from: location.pathname }}');
    for (const status of ["no_subscription", "legacy_unversioned", "blocked", "error"]) expect(read("src/components/guards/ForaDoPlano.tsx")).toContain(status);
    expect(read("src/pages/NotFound.tsx")).toContain("Página não encontrada");
  });
  it("comunicação não herda permissões da raiz; portal preserva suporte admin existente", () => {
    expect(canAccess("administrador", "/comunicacao")).toBe(true);
    expect(canAccess("gestor", "/comunicacao")).toBe(true);
    expect(canAccess("producao", "/comunicacao")).toBe(false);
    expect(canAccess("administrador", "/portal")).toBe(true);
    expect(canAccess("financeiro", "/portal")).toBe(false);
  });
  it("matriz A/B/C unitária: plano não amplia papel e papel não contorna plano", () => {
    const path = "/financeiro/receber";
    const full = { status: "ready" as const, features: new Set(["contas_receber"]) };
    const limited = { status: "ready" as const, features: new Set<string>() };
    expect(canAccess("administrador", path) && isPathEntitled(path, full)).toBe(true);
    expect(canAccess("administrador", path) && isPathEntitled(path, limited)).toBe(false);
    expect(canAccess("producao", path) && isPathEntitled(path, full)).toBe(false);
    expect(isPathEntitled(path, { status: "loading" })).toBe(false);
  });
});