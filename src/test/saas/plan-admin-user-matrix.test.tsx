import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ACTIVE_ROLES, canAccess } from "@/lib/permissions";
import { navigation } from "@/config/navigation";
import { PARCEIRO_GESTOR_GROUPS, PARCEIRO_TECNICO_GROUPS } from "@/config/portalMenus";
import { featureForPath, isPathEntitled } from "@/lib/saas/featureRouteMap";
import { resolveEffectiveRouteRole } from "@/lib/navigation/portalRoleContext";
import { isNavItemFeatureEnabled } from "@/lib/navigation/search";
import ForaDoPlano from "@/components/guards/ForaDoPlano";
import inventory from "../../../docs/auditorias/auditoria-rotas-inventario-2026-10-07.json";

// Read-only published v1 snapshots observed 2026-10-07; test data, not a runtime catalog.
const base = ["fichas_tecnicas", "recomendacoes_alertas", "visitas_tecnicas"];
const essential = [...base, "contas_pagar", "contas_receber", "fluxo_caixa", "paineis_executivos", "relatorios_operacionais"];
const management = [...essential, "envios_automaticos", "emissao_nfe_nfse"];
const complete = [...management, "catalogo_precos", "pedidos_b2b", "simulacoes", "envase", "estoque_embalagens", "lotes_qualidade", "ordens_producao"];
const plans = [{ name: "Base", features: base }, { name: "Essencial", features: essential }, { name: "Gestão", features: management }, { name: "Completo", features: complete }];
const roles = ACTIVE_ROLES.filter((role) => !["cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico"].includes(role));
const routes = inventory.routes.filter((r) => r.feature && !r.redirect);
const items = navigation.flatMap((n) => [n, ...(n.children ?? [])]);
const read = (path: string) => readFileSync(path, "utf8");

describe("Planos × papéis — estrutural, sem simular Auth/RLS", () => {
  it("usa exatamente 4 snapshots v1 e 10 papéis aceitos pela Edge", () => {
    expect(plans.map((p) => p.features.length)).toEqual([3, 8, 10, 17]);
    const edge = read("supabase/functions/create-user/index.ts");
    const allowlist = edge.match(/const TENANT_USER_ROLES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
    const serverRoles = [...allowlist.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(new Set(roles)).toEqual(new Set(serverRoles));
    expect(roles).toHaveLength(10);
    expect(new Set(routes.map((r) => r.feature))).toEqual(new Set(complete));
  });

  it.each(plans.flatMap((plan) => roles.map((role) => ({ ...plan, role }))))("$name × $role: menu e URL intersectam plano e perfil", ({ features, role }) => {
    const state = { status: "ready" as const, features: new Set(features) };
    for (const route of routes) {
      const path = route.path;
      const permitted = resolveEffectiveRouteRole({ roles: [role], primaryRole: role, path, activeContext: null }).allowed;
      const entitled = isPathEntitled(path, state);
      expect(permitted).toBe(canAccess(role, path));
      expect(entitled).toBe(features.includes(featureForPath(path) ?? ""));
      // Mirrors actual RoleGuard ordering: role denial precedes plan denial.
      const outcome = !permitted ? "SemPermissao" : !entitled ? "ForaDoPlano" : "page";
      if (!permitted) expect(outcome).toBe("SemPermissao");
      else if (!features.includes(route.feature ?? "")) expect(outcome).toBe("ForaDoPlano");
      else expect(outcome).toBe("page");
    }
    for (const item of items) {
      const path = item.route.split("?")[0];
      const permitted = resolveEffectiveRouteRole({ roles: [role], primaryRole: role, path, activeContext: null }).allowed;
      const visible = permitted && isPathEntitled(path, state) && isNavItemFeatureEnabled(item) && (!item.allowedRoles || item.allowedRoles.includes(role));
      if (visible && featureForPath(path)) expect(features).toContain(featureForPath(path));
      if (!canAccess(role, path) || !isPathEntitled(path, state)) expect(visible).toBe(false);
    }
    for (const item of [...PARCEIRO_GESTOR_GROUPS, ...PARCEIRO_TECNICO_GROUPS].flatMap((g) => g.items)) {
      if (!isPathEntitled(item.route, state)) expect(features.includes(featureForPath(item.route) ?? "")).toBe(false);
    }
  });

  it("admin Base não ganha financeiro; Produção Completo não ganha financeiro", () => {
    expect(isPathEntitled("/financeiro/receber", { status: "ready", features: new Set(base) })).toBe(false);
    expect(canAccess("producao", "/financeiro/receber")).toBe(false);
    expect(canAccess("administrador", "/financeiro/receber")).toBe(true);
  });

  it("todos os estados negados têm diagnóstico distinto e nenhuma feature liberada", () => {
    const states = ["loading", "no_context", "no_subscription", "legacy_unversioned", "blocked_status", "trial_expired"] as const;
    const headings: string[] = [];
    for (const status of states) {
      expect(isPathEntitled("/financeiro/receber", { status })).toBe(false);
      const result = render(<MemoryRouter><ForaDoPlano status={status} /></MemoryRouter>);
      headings.push(result.getByRole("heading").textContent ?? "");
      cleanup();
    }
    expect(new Set(headings).size).toBe(states.length);
  });

  it("runtime desktop/mobile e URL usam os gates canônicos, não a matriz de teste", () => {
    const app = read("src/App.tsx");
    expect(app.indexOf("if (!allowed)")).toBeLessThan(app.indexOf("if (!isPathEntitled(location.pathname"));
    expect(read("src/components/AppSidebar.tsx")).toContain("resolveEffectiveRouteRole");
    expect(read("src/pages/app/MobileLayout.tsx")).toContain("isPathEntitled(tab.path, entitlements)");
    expect(read("src/components/guards/EntitlementOutlet.tsx")).toContain("isPathEntitled(pathname, entitlements)");
    const page = read("src/pages/Configuracoes.tsx");
    expect(page).toContain("TENANT_MANAGEABLE_ROLES.map");
    expect(page).toContain('!["cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico"].includes(candidate)');
    expect(page).toContain('queryKey: ["admin-users", profile?.organization_id, user?.id');
    expect(page).toContain('invalidateQueries({ queryKey: ["admin-users"] })');
  });
});