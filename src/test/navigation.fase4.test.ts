import { describe, it, expect } from "vitest";
import { navigation, desktopItemsBySection } from "@/config/navigation";
import { searchNavItems } from "@/lib/navigation/search";

describe("Fase 4 — reorganização declarativa Comercial/Campo/Produção", () => {
  it("Comercial e Relacionamento: 13 itens na ordem exata e subseções corretas", () => {
    const g = desktopItemsBySection().find((x) => x.section === "Comercial e Relacionamento")!;
    expect(g).toBeDefined();
    expect(g.items.map((i) => i.id)).toEqual([
      "com-consolidado", "com-indicadores", "com-alertas",
      "clientes", "fazendas",
      "solicitacoes", "com-pedidos-b2b", "com-solicitacoes-b2b", "com-campanhas",
      "protocolos", "com-simulador", "com-condicoes-pagamento",
    ]);
    const sub = (id: string) => g.items.find((i) => i.id === id)!.subSection;
    expect(sub("com-consolidado")).toBe("Visão Comercial");
    expect(sub("clientes")).toBe("Clientes e Propriedades");
    expect(sub("solicitacoes")).toBe("Demandas e Vendas");
    expect(sub("protocolos")).toBe("Produtos e Planejamento");
  });

  it("Campo e Assistência Técnica: 7 itens na ordem, sem subseções", () => {
    const g = desktopItemsBySection().find((x) => x.section === "Campo e Assistência Técnica")!;
    expect(g.items.map((i) => i.id)).toEqual([
      "agenda-tecnica", "visita-tecnica", "aplicacoes",
      "equipe-tecnica", "fluxo-tecnico", "monitoramento", "previsao-climatica",
    ]);
    g.items.forEach((i) => expect(i.subSection).toBeUndefined());
  });

  it("Produção: 9 itens na ordem exata com subseções", () => {
    const g = desktopItemsBySection().find((x) => x.section === "Produção")!;
    expect(g.items.map((i) => i.id)).toEqual([
      "dashboard-producao", "cockpit-lab",
      "planejamento-producao", "ordens-servico", "lotes", "cq", "envase", "estoque", "entregas",
    ]);
    const byId = (id: string) => g.items.find((i) => i.id === id)!;
    expect(byId("dashboard-producao").subSection).toBe("Acompanhamento");
    expect(byId("cockpit-lab").subSection).toBe("Central Operacional");
    expect(byId("ordens-servico").subSection).toBe("Fluxo de Produção");
    // Badges "Técnico" removidos por decisão de UX
    expect(byId("lotes").badge).toBeUndefined();
    expect(byId("cq").badge).toBeUndefined();
    expect(byId("envase").badge).toBeUndefined();
  });

  it("Rotas críticas preservadas (nenhuma renomeação interna)", () => {
    const route = (id: string) => navigation.find((n) => n.id === id)?.route;
    expect(route("cockpit-lab")).toBe("/cockpit-laboratorio");
    expect(route("clientes")).toBe("/clientes");
    expect(route("fazendas")).toBe("/fazendas");
    expect(route("protocolos")).toBe("/base-tecnica");
    expect(route("equipe-tecnica")).toBe("/consultor-tecnico");
    expect(route("previsao-climatica")).toBe("/previsao-agronomica");
    expect(route("monitoramento")).toBe("/monitoramento-alertas");
  });

  it("Busca por termos antigos localiza itens realocados (perfil administrador)", () => {
    const items = navigation.filter((n) => n.platforms.includes("desktop"));
    const find = (q: string) => searchNavItems(items, q, "administrador").map((i) => i.id);
    expect(find("consultor")).toContain("equipe-tecnica");
    expect(find("os")).toContain("ordens-servico");
    expect(find("propriedade")).toContain("fazendas");
    expect(find("clima")).toContain("previsao-climatica");
    expect(find("cockpit")).toContain("cockpit-lab");
    expect(find("dashboard-b2b")).toContain("com-consolidado");
    expect(find("laboratório")).toEqual(expect.arrayContaining(["cockpit-lab", "cq"]));
  });

  it("Cockpit imediatamente após Dashboard Produção no grupo Produção", () => {
    const g = desktopItemsBySection().find((x) => x.section === "Produção")!;
    const idxDash = g.items.findIndex((i) => i.id === "dashboard-producao");
    const idxCockpit = g.items.findIndex((i) => i.id === "cockpit-lab");
    expect(idxCockpit).toBe(idxDash + 1);
  });
});
