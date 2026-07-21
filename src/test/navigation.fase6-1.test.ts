import { describe, it, expect } from "vitest";
import { navigation, itemsForPlatform } from "@/config/navigation";
import { searchNavItems } from "@/lib/navigation/search";
import { isNavItemActiveSelf, isNavItemActive } from "@/lib/navigation/matchActive";

const desktop = itemsForPlatform("desktop");
const dashboard = navigation.find((n) => n.id === "dashboard")!;
const geral = dashboard.children!.find((c) => c.id === "dashboard-geral")!;
const executivo = dashboard.children!.find((c) => c.id === "dashboard-executivo")!;
const operacional = dashboard.children!.find((c) => c.id === "dashboard-operacional")!;

describe("Fase 6.1 — busca desambiguada", () => {
  it("'configurações gerais' → apenas Configurações", () => {
    const r = searchNavItems(desktop, "configurações gerais", "administrador");
    expect(r.map((i) => i.id)).toEqual(["configuracoes"]);
  });

  it("'configurações financeiras' → agora unificado em Configurações", () => {
    const r = searchNavItems(desktop, "configurações financeiras", "administrador");
    expect(r.map((i) => i.id)).toEqual(["configuracoes"]);
  });

  it("'regras governança' → apenas Regras Governança", () => {
    const r = searchNavItems(desktop, "regras governança", "administrador");
    expect(r.map((i) => i.id)).toEqual(["b2b-regras-gov"]);
  });
});

describe("Fase 6.1 — estado ativo do Dashboard sem duplicação", () => {
  const routes = ["/dashboard/geral", "/dashboard/executivo", "/dashboard/operacional", "/", "/executivo", "/painel-operacional"];

  it.each(routes)("pai é groupActive mas não selfActive quando filho ativo em %s", (path) => {
    // pai considerado do grupo
    expect(isNavItemActive(dashboard, path)).toBe(true);
    const anyChildActive = dashboard.children!.some((c) => isNavItemActiveSelf(c, path));
    // Simula a mesma regra do AppSidebar
    const parentSelf = isNavItemActiveSelf(dashboard, path);
    const parentActive = parentSelf && !anyChildActive;
    expect(parentActive).toBe(false);
  });

  it("apenas um filho ativo por rota", () => {
    const cases: Array<[string, string]> = [
      ["/dashboard/geral", "dashboard-geral"],
      ["/dashboard/executivo", "dashboard-executivo"],
      ["/dashboard/operacional", "dashboard-operacional"],
      ["/", "dashboard-geral"],
      ["/executivo", "dashboard-executivo"],
      ["/painel-operacional", "dashboard-operacional"],
    ];
    for (const [path, expectedId] of cases) {
      const actives = [geral, executivo, operacional].filter((c) => isNavItemActiveSelf(c, path));
      expect(actives.map((c) => c.id)).toEqual([expectedId]);
    }
  });
});
