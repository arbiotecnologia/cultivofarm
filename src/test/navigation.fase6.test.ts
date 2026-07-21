import { describe, it, expect } from "vitest";
import { desktopItemsBySection, DESKTOP_SECTION_ORDER, navigation } from "@/config/navigation";
import { searchNavItems } from "@/lib/navigation/search";

describe("Fase 6 — Inteligência, Controle e Administração", () => {
  const groups = desktopItemsBySection();
  const byId = (id: string) => navigation.find((i) => i.id === id)!;

  it("ordena os grupos com Inteligência e Controle antes de Administração", () => {
    const idxInt = DESKTOP_SECTION_ORDER.indexOf("Inteligência e Controle");
    const idxAdm = DESKTOP_SECTION_ORDER.indexOf("Administração");
    expect(idxInt).toBeGreaterThan(-1);
    expect(idxAdm).toBeGreaterThan(idxInt);
  });

  it("Inteligência e Controle contém 5 itens na ordem correta e subseções", () => {
    const g = groups.find((s) => s.section === "Inteligência e Controle")!;
    expect(g.items.map((i) => i.id)).toEqual([
      "bi-agronomico",
      "bi-operacional",
      "relatorios",
      "alertas",
      "auditorias",
    ]);
    expect(byId("bi-agronomico").subSection).toBe("Inteligência");
    expect(byId("bi-operacional").subSection).toBe("Inteligência");
    expect(byId("relatorios").subSection).toBe("Inteligência");
    expect(byId("alertas").subSection).toBe("Controle");
    expect(byId("auditorias").subSection).toBe("Controle");
  });

  it("Administração contém somente Configurações", () => {
    const g = groups.find((s) => s.section === "Administração")!;
    expect(g.items.map((i) => i.id)).toEqual(["configuracoes"]);
  });

  it("preserva rotas, badges e legacyRoutes dos itens migrados", () => {
    expect(byId("bi-agronomico").route).toBe("/bi-agronomico");
    expect(byId("bi-operacional").route).toBe("/bi-operacional");
    expect(byId("relatorios").route).toBe("/relatorios");
    expect(byId("alertas").route).toBe("/alertas-operacionais");
    expect(byId("alertas").badgeSlot).toBe("alertas");
    expect(byId("auditorias").route).toBe("/auditoria");
    expect(byId("auditorias").legacyRoutes).toContain("/auditoria-sync");
    expect(byId("configuracoes").route).toBe("/configuracoes");
    expect(byId("configuracoes").matchRoutes).toContain("/configuracoes/objetivos-visita");
  });

  it("busca localiza módulos por rótulos antigos e novos", () => {
    const find = (q: string) =>
      searchNavItems(navigation, q, "administrador").map((i) => i.id);
    expect(find("bi agronômico")).toContain("bi-agronomico");
    expect(find("bi operacional")).toContain("bi-operacional");
    expect(find("relatórios gerenciais")).toContain("relatorios");
    expect(find("alertas gerais")).toContain("alertas");
    expect(find("auditorias gerais")).toContain("auditorias");
    expect(find("configurações")).toContain("configuracoes");
    // desambiguação:
    expect(find("alertas comerciais")).toContain("com-alertas");
    expect(find("alertas financeiros")).toContain("b2b-alertas");
    expect(find("auditoria financeira")).toContain("fin-auditoria");
    expect(find("configurações financeiras")).toContain("fin-config");
  });
});
