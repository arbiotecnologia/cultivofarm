import { describe, it, expect } from "vitest";
import { isNavItemActive, isNavItemActiveSelf } from "@/lib/navigation/matchActive";
import { navigation } from "@/config/navigation";

const dashboard = navigation.find((n) => n.id === "dashboard")!;
const geral = dashboard.children!.find((c) => c.id === "dashboard-geral")!;
const executivo = dashboard.children!.find((c) => c.id === "dashboard-executivo")!;
const operacional = dashboard.children!.find((c) => c.id === "dashboard-operacional")!;

describe("Fase 3.2 — realce do item pai Dashboard", () => {
  it.each([
    "/dashboard/geral", "/dashboard/executivo", "/dashboard/operacional",
    "/executivo", "/painel-operacional",
  ])("pai fica ativo (via matchRoutes/legacy) em %s", (path) => {
    expect(isNavItemActive(dashboard, path)).toBe(true);
  });

  it("pai NÃO fica ativo em rota alheia", () => {
    expect(isNavItemActive(dashboard, "/clientes")).toBe(false);
  });

  it("apenas o filho correspondente fica ativo por isNavItemActiveSelf", () => {
    expect(isNavItemActiveSelf(geral, "/dashboard/geral")).toBe(true);
    expect(isNavItemActiveSelf(executivo, "/dashboard/geral")).toBe(false);
    expect(isNavItemActiveSelf(operacional, "/dashboard/geral")).toBe(false);

    expect(isNavItemActiveSelf(executivo, "/dashboard/executivo")).toBe(true);
    expect(isNavItemActiveSelf(geral, "/dashboard/executivo")).toBe(false);
  });

  it("pai NÃO tem selfActive quando filho está ativo (parcialmente ativo)", () => {
    // /dashboard/executivo bate route "/dashboard/geral"? não. selfActive = false.
    expect(isNavItemActiveSelf(dashboard, "/dashboard/executivo")).toBe(false);
    expect(isNavItemActive(dashboard, "/dashboard/executivo")).toBe(true);
  });
});
