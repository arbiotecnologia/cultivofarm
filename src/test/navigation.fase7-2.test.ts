import { describe, it, expect } from "vitest";
import { navigation, itemsForPlatform } from "@/config/navigation";
import { isNavItemActive, isNavItemActiveSelf } from "@/lib/navigation/matchActive";
import { searchNavItems } from "@/lib/navigation/search";

const dashboard = navigation.find((n) => n.id === "dashboard")!;
const executivo = dashboard.children!.find((c) => c.id === "dashboard-executivo")!;

describe("Fase 7.2 — unificação do Portal Executivo", () => {
  it("Visão Executiva possui /portal-executivo em legacyRoutes", () => {
    expect(executivo.legacyRoutes).toContain("/portal-executivo");
    expect(executivo.legacyRoutes).toContain("/executivo");
  });

  it("pai Dashboard também considera /portal-executivo (via legacyRoutes)", () => {
    expect(dashboard.legacyRoutes).toContain("/portal-executivo");
  });

  it.each(["/dashboard/executivo", "/executivo", "/portal-executivo"])(
    "em %s: pai parcialmente ativo, apenas Visão Executiva com selfActive",
    (path) => {
      expect(isNavItemActive(dashboard, path)).toBe(true);
      // Pai perde `active` porque algum filho está com selfActive.
      const anyChildActive = dashboard.children!.some((c) => isNavItemActiveSelf(c, path));
      const parentSelf = isNavItemActiveSelf(dashboard, path);
      const parentActive = parentSelf && !anyChildActive;
      expect(anyChildActive).toBe(true);
      expect(parentActive).toBe(false);
      expect(isNavItemActiveSelf(executivo, path)).toBe(true);
      const geral = dashboard.children!.find((c) => c.id === "dashboard-geral")!;
      const op = dashboard.children!.find((c) => c.id === "dashboard-operacional")!;
      expect(isNavItemActiveSelf(geral, path)).toBe(false);
      expect(isNavItemActiveSelf(op, path)).toBe(false);
    },
  );

  it.each([
    "portal executivo",
    "Visão Executiva",
    "Executivo",
    "Dashboard Executivo",
  ])("busca '%s' retorna somente Visão Executiva", (q) => {
    const items = itemsForPlatform("desktop");
    const res = searchNavItems(items, q, "administrador");
    const ids = res.map((r) => r.id);
    expect(ids).toContain("dashboard-executivo");
    // Não deve retornar outros dashboards / cards duplicados.
    expect(ids.filter((id) => id === "dashboard-executivo")).toHaveLength(1);
    expect(ids).not.toContain("dashboard-geral");
    expect(ids).not.toContain("dashboard-operacional");
  });

  it("não existe item de navegação duplicado com label 'Portal Executivo'", () => {
    const items = itemsForPlatform("desktop");
    const dup = items.filter((it) => /portal executivo/i.test(it.label));
    expect(dup).toHaveLength(0);
  });
});
