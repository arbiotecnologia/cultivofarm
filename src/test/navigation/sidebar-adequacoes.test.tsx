/**
 * Cobertura das adequações do sidebar (13/08/2026):
 * subtítulos de subseção, filhos de Base Técnica, grupo da rota ativa aberto,
 * scroll no modo ícone, `allowedRoles` e não-perda de itens existentes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { navigation, itemsForPlatform } from "@/config/navigation";
import {
  isNavItemActiveSelfWithSearch,
  isNavItemActive,
} from "@/lib/navigation/matchActive";
import { sanitizeCollapseState, groupsStorageKey } from "@/hooks/useNavCollapseState";
import { canAccess } from "@/lib/permissions";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const baseTecnica = navigation.find((i) => i.id === "protocolos")!;

describe("Sidebar — Base Técnica com abas no menu", () => {
  it("expõe os 6 filhos com deep link por aba", () => {
    const children = baseTecnica.children ?? [];
    expect(children.map((c) => c.label)).toEqual([
      "Produtos",
      "Serviços",
      "Microrganismos",
      "Catálogo Técnico",
      "Culturas",
      "Problemas",
    ]);
    expect(children.map((c) => c.route)).toEqual([
      "/base-tecnica?tab=produtos",
      "/base-tecnica?tab=servicos",
      "/base-tecnica?tab=microrganismos",
      "/base-tecnica?tab=catalogo-tecnico",
      "/base-tecnica?tab=culturas",
      "/base-tecnica?tab=problemas",
    ]);
  });

  it("todos os filhos são acessíveis ao administrador", () => {
    for (const c of baseTecnica.children ?? []) {
      expect(canAccess("administrador", "/base-tecnica")).toBe(true);
      expect(c.section).toBe("Comercial e Relacionamento");
      expect(c.subSection).toBe("Produtos e Planejamento");
    }
  });

  it("os valores das abas correspondem aos da página Protocolos", () => {
    const src = read("src/pages/Protocolos.tsx");
    for (const tab of ["produtos", "microrganismos", "catalogo-tecnico", "culturas", "problemas"]) {
      expect(src).toContain(`<TabsTrigger value="${tab}">`);
    }
  });

  it("marca a aba ativa pela query e o padrão quando não há parâmetro", () => {
    const [produtos, , , , culturas] = baseTecnica.children!;
    expect(isNavItemActiveSelfWithSearch(culturas, "/base-tecnica", "?tab=culturas")).toBe(true);
    expect(isNavItemActiveSelfWithSearch(produtos, "/base-tecnica", "?tab=culturas")).toBe(false);
    expect(isNavItemActiveSelfWithSearch(produtos, "/base-tecnica", "")).toBe(true);
    // A rota legada continua ativando o item pai.
    expect(isNavItemActive(baseTecnica, "/protocolos")).toBe(true);
  });
});

describe("Sidebar — subtítulos de subseção", () => {
  it("renderiza o subtítulo Produtos e Planejamento com contraste legível", () => {
    const src = read("src/components/nav/NavSectionGroup.tsx");
    expect(src).toContain("{it.subSection}");
    expect(src).toContain("uppercase tracking-wider text-sidebar-foreground/70");
    expect(src).not.toContain("text-muted-foreground/80");
    expect(
      navigation.some((i) => i.subSection === "Produtos e Planejamento"),
    ).toBe(true);
  });
});

describe("Sidebar — scroll no modo ícone", () => {
  it("SidebarContent preserva rolagem vertical mesmo colapsado", () => {
    const src = read("src/components/ui/sidebar.tsx");
    expect(src).toContain("overflow-y-auto overflow-x-hidden");
    expect(src).not.toContain("group-data-[collapsible=icon]:overflow-hidden");
  });
});

describe("Sidebar — estado persistido dos grupos", () => {
  beforeEach(() => localStorage.clear());

  it("versiona a chave por usuário e portal", () => {
    expect(groupsStorageKey("u1", "admin")).toBe("sidebar:groups:v3:u1:admin");
    expect(groupsStorageKey(null, "produtor")).toBe("sidebar:groups:v3:anon:produtor");
  });

  it("descarta valores legados/inválidos que poderiam ocultar grupos", () => {
    expect(sanitizeCollapseState({ Financeiro: "false" })).toEqual({});
    expect(sanitizeCollapseState(null)).toEqual({});
    expect(sanitizeCollapseState(["Financeiro"])).toEqual({});
    expect(sanitizeCollapseState({ Financeiro: false })).toEqual({ Financeiro: false });
  });
});

describe("Sidebar — allowedRoles e integridade do menu", () => {
  const isVisible = (item: { route: string; allowedRoles?: string[] }, role: string) =>
    canAccess(role, item.route.split("?")[0]) &&
    (!item.allowedRoles || item.allowedRoles.includes(role));

  it("AppSidebar aplica item.allowedRoles no filtro", () => {
    const src = read("src/components/AppSidebar.tsx");
    expect(src).toContain("item.allowedRoles");
  });

  it("allowedRoles não reduz o acesso do administrador", () => {
    for (const it of itemsForPlatform("desktop")) {
      if (!it.allowedRoles) continue;
      expect(it.allowedRoles).toContain("administrador");
    }
  });

  it("nenhum item existente foi perdido do menu desktop", () => {
    const ids = itemsForPlatform("desktop").map((i) => i.id);
    for (const expected of [
      "dashboard",
      "portal-produtor",
      "protocolos",
      "com-simulador",
      "com-condicoes-pagamento",
      "clientes",
      "fazendas",
      "comunicacao-admin",
    ]) {
      expect(ids).toContain(expected);
    }
    // Base Técnica permanece visível para o administrador.
    expect(isVisible(baseTecnica, "administrador")).toBe(true);
  });
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, role: "administrador" }) }));
