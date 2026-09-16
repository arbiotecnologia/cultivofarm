/**
 * Padronização global de sidebar — matriz N-01 a N-15 da auditoria.
 * Cobre fonte única, permissões, flags, os três níveis de recolhimento,
 * deep-link, scroll, mobile, tooltips/ícones, persistência, busca e contraste.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { navigation, itemsForPlatform, desktopItemsBySection } from "@/config/navigation";
import {
  PRODUTOR_MENU_GROUPS,
  PARCEIRO_GESTOR_GROUPS,
  PARCEIRO_TECNICO_GROUPS,
  flattenPortalMenu,
} from "@/config/portalMenus";
import {
  groupsStorageKey,
  sidebarStateStorageKey,
  sanitizeCollapseState,
  purgeLegacyCollapseKeys,
  itemCollapseKey,
} from "@/hooks/useNavCollapseState";
import { filterNavItemsByQuery, isNavItemFeatureEnabled } from "@/lib/navigation/search";
import { isNavItemActiveSelfWithSearch } from "@/lib/navigation/matchActive";
import { canAccess } from "@/lib/permissions";
import { SidebarProvider } from "@/components/ui/sidebar";
import { PortalSidebar, SEARCH_MIN_ITEMS } from "@/components/nav/PortalSidebar";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

let currentUser: { id: string } | null = { id: "u1" };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: currentUser, role: "administrador", roles: ["administrador"] }),
}));
vi.mock("@/components/alertas/AlertasBadgeMenu", () => ({
  AlertasBadgeMenu: () => null,
}));

function renderSidebar(props: Parameters<typeof PortalSidebar>[0], route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SidebarProvider>
        <PortalSidebar {...props} />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  currentUser = { id: "u1" };
  cleanup();
});

// ── N-01 — fonte única e snapshot antes/depois ───────────────────────────────
describe("N-01 fonte única de itens", () => {
  const PRODUTOR_ANTES = [
    "/portal", "/portal/financeiro", "/portal/fazendas", "/portal/agenda",
    "/portal/registros", "/portal/recomendacoes", "/portal/acompanhamento",
    "/portal/aplicacoes", "/portal/solicitar", "/portal/perfil",
  ];
  const GESTOR_ANTES = [
    "/portal-parceiro/dashboard", "/portal-parceiro/pedidos",
    "/portal-parceiro/simulacoes-equipe", "/portal-parceiro/catalogo",
    "/portal-parceiro/fichas", "/portal-parceiro/favoritos",
    "/portal-parceiro/meu-historico", "/portal-parceiro/financeiro",
  ];
  const TECNICO_ANTES = [
    "/portal-parceiro/dashboard", "/portal-parceiro/simulador",
    "/portal-parceiro/simulacoes", "/portal-parceiro/fichas",
  ];

  it("produtor preserva exatamente o conjunto anterior de rotas", () => {
    const rotas = flattenPortalMenu(PRODUTOR_MENU_GROUPS).map((i) => i.route);
    expect(rotas.sort()).toEqual(PRODUTOR_ANTES.sort());
  });

  it("parceiro gestor e técnico preservam seus conjuntos", () => {
    expect(flattenPortalMenu(PARCEIRO_GESTOR_GROUPS).map((i) => i.route).sort()).toEqual(
      GESTOR_ANTES.sort(),
    );
    expect(flattenPortalMenu(PARCEIRO_TECNICO_GROUPS).map((i) => i.route).sort()).toEqual(
      TECNICO_ANTES.sort(),
    );
  });

  it("layouts não declaram mais arrays locais de menu", () => {
    expect(read("src/pages/portal/PortalLayout.tsx")).not.toContain("const portalMenu");
    const parceiro = read("src/pages/portal-parceiro/PortalParceiroLayout.tsx");
    expect(parceiro).not.toContain("const menuGestor");
    expect(parceiro).not.toContain("const menuTecnico");
  });

  it("ids são únicos em cada portal", () => {
    for (const groups of [PRODUTOR_MENU_GROUPS, PARCEIRO_GESTOR_GROUPS, PARCEIRO_TECNICO_GROUPS]) {
      const ids = flattenPortalMenu(groups).map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

// ── N-02 — permissões preservadas ────────────────────────────────────────────
describe("N-02 permissões inalteradas", () => {
  it("produtor mantém permissionPath idêntico (todos livres, guard por role)", () => {
    for (const it of flattenPortalMenu(PRODUTOR_MENU_GROUPS)) {
      expect(it.permissionPath ?? null).toBeNull();
    }
  });

  it("parceiro mantém showFor por conjunto", () => {
    expect(flattenPortalMenu(PARCEIRO_GESTOR_GROUPS).every((i) => i.showFor === "gestor")).toBe(true);
    expect(flattenPortalMenu(PARCEIRO_TECNICO_GROUPS).every((i) => i.showFor === "tecnico")).toBe(true);
  });

  it("admin continua filtrando por canAccess + allowedRoles", () => {
    const src = read("src/components/AppSidebar.tsx");
    expect(src).toContain("canAccess(role");
    expect(src).toContain("item.allowedRoles");
    expect(src).toContain("isNavItemFeatureEnabled");
  });

  it("guards/redirects dos layouts foram preservados", () => {
    const parceiro = read("src/pages/portal-parceiro/PortalParceiroLayout.tsx");
    for (const guard of [
      "/portal-parceiro/meus-produtores",
      "/portal-parceiro/usuarios-clientes",
      "/portal-parceiro/tecnicos-produtores",
      "/portal-parceiro/novo",
      "/portal-parceiro/solicitacoes",
    ]) {
      expect(parceiro).toContain(guard);
    }
    expect(read("src/pages/portal/PortalLayout.tsx")).toContain("getHomeForRole(role)");
  });
});

// ── N-03 — feature flags ─────────────────────────────────────────────────────
describe("N-03 feature flags", () => {
  it("item com flag desligada é ocultado", () => {
    expect(isNavItemFeatureEnabled({ featureFlag: "fiscalEmissionEnabled" })).toBe(false);
    expect(isNavItemFeatureEnabled({})).toBe(true);
  });
});

// ── N-04 — colapso (a) sidebar inteira ───────────────────────────────────────
describe("N-04 colapso da sidebar inteira", () => {
  it("chave é versionada por usuário e portal", () => {
    expect(sidebarStateStorageKey("u1", "admin")).toBe("sidebar:state:v1:u1:admin");
    expect(sidebarStateStorageKey("u2", "admin")).not.toBe(sidebarStateStorageKey("u1", "admin"));
    expect(sidebarStateStorageKey("u1", "produtor")).not.toBe(sidebarStateStorageKey("u1", "admin"));
  });

  it("trigger existe nos três portais", () => {
    expect(read("src/components/AppLayout.tsx")).toContain("SidebarTrigger");
    expect(read("src/pages/portal/PortalLayout.tsx")).toContain("SidebarTrigger");
    expect(read("src/pages/portal-parceiro/PortalParceiroLayout.tsx")).toContain("SidebarTrigger");
  });
});

// ── N-05 — colapso (b) seção ─────────────────────────────────────────────────
describe("N-05 seção accordion", () => {
  const groups = PRODUTOR_MENU_GROUPS;

  it("toda seção pode ser fechada, inclusive a da rota ativa", () => {
    renderSidebar(
      { portal: "produtor", groups, brandTitle: "Portal do Produtor" },
      "/portal/fazendas",
    );
    const trigger = screen.getByText("Minhas Propriedades");
    expect(screen.getAllByText("Fazendas").length).toBeGreaterThan(0);
    fireEvent.click(trigger);
    // Fechada: item ativo permanece visível (indicação preservada).
    expect(screen.getAllByText("Fazendas").length).toBeGreaterThan(0);
    expect(screen.queryByText("Minha Agenda")).toBeNull();
  });

  it("persiste o fechamento na chave v3 do portal", () => {
    renderSidebar({ portal: "produtor", groups, brandTitle: "P" }, "/portal");
    fireEvent.click(screen.getByText("Acompanhamento Técnico"));
    const raw = localStorage.getItem(groupsStorageKey("u1", "produtor"));
    expect(JSON.parse(raw!)["Acompanhamento Técnico"]).toBe(false);
  });
});

// ── N-06 — colapso (c) item com filhos ───────────────────────────────────────
describe("N-06 item com filhos", () => {
  const dashboard = navigation.find((i) => i.id === "dashboard")!;
  const baseTecnica = navigation.find((i) => i.id === "protocolos")!;
  const groups = [{ section: "Dashboard", items: [dashboard] }];

  it("chevron abre e fecha os filhos", () => {
    renderSidebar({ portal: "admin", groups, brandTitle: "Cultivo Farm" }, "/clientes");
    expect(screen.getByText("Visão Executiva")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Recolher Dashboard"));
    expect(screen.queryByText("Visão Executiva")).toBeNull();
  });

  it("abre automaticamente quando um filho está ativo", () => {
    renderSidebar({ portal: "admin", groups, brandTitle: "Cultivo Farm" }, "/dashboard/executivo");
    expect(screen.getByText("Visão Executiva")).toBeTruthy();
    expect(localStorage.getItem(groupsStorageKey("u1", "admin"))).toContain(
      itemCollapseKey("dashboard"),
    );
  });

  it("os 5 filhos de Base Técnica permanecem", () => {
    expect((baseTecnica.children ?? []).map((c) => c.label)).toEqual([
      "Produtos", "Microrganismos", "Catálogo Técnico", "Culturas", "Problemas",
    ]);
  });
});

// ── N-07 — deep-link ─────────────────────────────────────────────────────────
describe("N-07 deep-link por query", () => {
  const baseTecnica = navigation.find((i) => i.id === "protocolos")!;
  it("marca a aba correta e o paramDefault", () => {
    const [produtos, , , culturas] = baseTecnica.children!;
    expect(isNavItemActiveSelfWithSearch(culturas, "/base-tecnica", "?tab=culturas")).toBe(true);
    expect(isNavItemActiveSelfWithSearch(produtos, "/base-tecnica", "")).toBe(true);
  });
});

// ── N-08 — scroll ────────────────────────────────────────────────────────────
describe("N-08 scroll vertical", () => {
  it("SidebarContent rola também no modo ícone", () => {
    const src = read("src/components/ui/sidebar.tsx");
    expect(src).toContain("overflow-y-auto overflow-x-hidden");
    expect(src).not.toContain("group-data-[collapsible=icon]:overflow-hidden");
  });

  it("nenhum portal usa <aside> artesanal com nav sem rolagem", () => {
    expect(read("src/pages/portal/PortalLayout.tsx")).not.toContain("<aside");
    expect(read("src/pages/portal-parceiro/PortalParceiroLayout.tsx")).not.toContain("<aside");
  });
});

// ── N-09 — mobile ────────────────────────────────────────────────────────────
describe("N-09 mobile", () => {
  it("breakpoint único de 768px", () => {
    expect(read("src/hooks/use-mobile.tsx")).toContain("MOBILE_BREAKPOINT = 768");
    expect(read("src/components/ui/sidebar.tsx")).toContain("useIsMobile");
  });

  it("clique fecha o Sheet no mobile", () => {
    expect(read("src/components/nav/NavItemRow.tsx")).toContain("setOpenMobile(false)");
  });

  it("bottom tabs do mobile permanecem intactas", () => {
    expect(itemsForPlatform("mobile-consultor").length).toBeGreaterThan(0);
    expect(itemsForPlatform("mobile-produtor").length).toBeGreaterThan(0);
    expect(read("src/pages/app/MobileLayout.tsx")).toContain("itemsForPlatform");
  });
});

// ── N-10 — item ativo ────────────────────────────────────────────────────────
describe("N-10 indicador de rota ativa", () => {
  it("exatamente um aria-current=page", () => {
    const { container } = renderSidebar(
      { portal: "produtor", groups: PRODUTOR_MENU_GROUPS, brandTitle: "P" },
      "/portal/fazendas",
    );
    expect(container.querySelectorAll('[aria-current="page"]').length).toBe(1);
  });

  it("pai com filho ativo recebe destaque de ramo ativo", () => {
    const dashboard = navigation.find((i) => i.id === "dashboard")!;
    const { container } = renderSidebar(
      { portal: "admin", groups: [{ section: "Dashboard", items: [dashboard] }], brandTitle: "A" },
      "/dashboard/executivo",
    );
    expect(container.querySelectorAll('[aria-current="page"]').length).toBe(1);
    expect(container.querySelectorAll('[data-branch-active="true"]').length).toBe(1);
  });
});

// ── N-11 — tooltips e ícones ─────────────────────────────────────────────────
describe("N-11 tooltips e ícones", () => {
  it("todo item recebe tooltip (exibido no modo ícone)", () => {
    expect(read("src/components/nav/NavItemRow.tsx")).toContain("tooltip={item.label}");
  });

  it("nenhum ícone se repete dentro da mesma seção desktop", () => {
    for (const { section, items } of desktopItemsBySection()) {
      const nomes = items.map((i) => i.icon.displayName ?? i.icon.name);
      expect(new Set(nomes).size, `ícones repetidos em ${section}`).toBe(nomes.length);
    }
  });

  it("separadores distinguem módulos", () => {
    expect(read("src/components/nav/NavSectionGroup.tsx")).toContain("SidebarSeparator");
  });
});

// ── N-12 — persistência legada ───────────────────────────────────────────────
describe("N-12 chaves legadas", () => {
  it("descarta v1/v2 sem ocultar grupos", () => {
    localStorage.setItem("sidebar:groups:u1", JSON.stringify({ Financeiro: false }));
    localStorage.setItem("sidebar:groups:v2:u1", JSON.stringify({ Financeiro: false }));
    localStorage.setItem(groupsStorageKey("u1", "admin"), JSON.stringify({ Financeiro: false }));
    purgeLegacyCollapseKeys("u1");
    expect(localStorage.getItem("sidebar:groups:u1")).toBeNull();
    expect(localStorage.getItem("sidebar:groups:v2:u1")).toBeNull();
    expect(localStorage.getItem(groupsStorageKey("u1", "admin"))).not.toBeNull();
  });

  it("sanitiza valores inválidos", () => {
    expect(sanitizeCollapseState({ A: "x", B: true })).toEqual({ B: true });
    expect(sanitizeCollapseState("nada")).toEqual({});
  });

  it("não herda estado entre contas", () => {
    expect(groupsStorageKey("u1", "admin")).not.toBe(groupsStorageKey("u2", "admin"));
  });
});

// ── N-13 — busca ─────────────────────────────────────────────────────────────
describe("N-13 busca", () => {
  it("aparece apenas em portais com mais de 10 itens", () => {
    renderSidebar({ portal: "produtor", groups: PRODUTOR_MENU_GROUPS, brandTitle: "P" }, "/portal");
    const produtorItens = flattenPortalMenu(PRODUTOR_MENU_GROUPS).length;
    expect(produtorItens).toBeGreaterThan(SEARCH_MIN_ITEMS - 1);
    cleanup();
    renderSidebar(
      { portal: "parceiro", groups: PARCEIRO_TECNICO_GROUPS, brandTitle: "B2B" },
      "/portal-parceiro/dashboard",
    );
    expect(screen.queryByLabelText("Buscar no menu")).toBeNull();
  });

  it("filtro por tokens AND alcança filhos e keywords", () => {
    const itens = itemsForPlatform("desktop").flatMap((i) => [i, ...(i.children ?? [])]);
    const r = filterNavItemsByQuery(itens, "visão executiva");
    expect(r.some((i) => i.route === "/dashboard/executivo")).toBe(true);
    expect(filterNavItemsByQuery(itens, "zzzz")).toHaveLength(0);
  });
});

// ── N-14 — hierarquia visual ─────────────────────────────────────────────────
describe("N-14 contraste hierárquico", () => {
  it("seção tem peso maior que subseção", () => {
    const src = read("src/components/nav/NavSectionGroup.tsx");
    expect(src).toContain("font-semibold uppercase tracking-wide text-sidebar-foreground");
    expect(src).toContain("text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/70");
  });

  it("indicador ativo é idêntico em todos os portais (componente único)", () => {
    const row = read("src/components/nav/NavItemRow.tsx");
    expect(row).toContain("bg-sidebar-accent text-sidebar-primary font-medium");
    expect(read("src/pages/portal/PortalLayout.tsx")).not.toContain("bg-primary text-primary-foreground");
    expect(read("src/pages/portal-parceiro/PortalParceiroLayout.tsx")).not.toContain(
      "bg-primary text-primary-foreground",
    );
  });
});

// ── N-15 — não-regressão ─────────────────────────────────────────────────────
describe("N-15 não-regressão estrutural", () => {
  it("itens desktop essenciais continuam presentes", () => {
    const ids = itemsForPlatform("desktop").map((i) => i.id);
    for (const id of [
      "dashboard", "portal-produtor", "protocolos", "com-simulador",
      "com-condicoes-pagamento", "clientes", "fazendas", "comunicacao-admin",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("todas as rotas do admin continuam acessíveis ao administrador", () => {
    for (const it of itemsForPlatform("desktop")) {
      // `portal-produtor` é um atalho cross-portal, governado pelo guard do
      // próprio portal (comportamento anterior preservado).
      if (it.id === "portal-produtor") continue;
      expect(canAccess("administrador", it.route.split("?")[0]), it.id).toBe(true);
    }
  });

  it("aside interno de Comunicação não é navegação global", () => {
    const src = read("src/features/comunicacao/ui/ComunicacaoAdminPage.tsx");
    expect(src).not.toContain("PortalSidebar");
    expect(src).not.toContain("SidebarProvider");
  });
});
