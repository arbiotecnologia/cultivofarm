import { describe, it, expect } from "vitest";
import { NAVIGATION_ITEMS } from "@/config/navigation";
import { searchNavItems } from "@/lib/navigation/search";

describe("Unificação do subgrupo Controle Financeiro", () => {
  it("nenhum item permanece no subSection 'Controle Financeiro'", () => {
    const remanescentes = NAVIGATION_ITEMS.filter((i) => i.subSection === "Controle Financeiro");
    expect(remanescentes).toEqual([]);
  });

  it("busca por 'auditoria financeira' retorna o item de Auditorias", () => {
    const results = searchNavItems(NAVIGATION_ITEMS, "auditoria financeira", "administrador");
    expect(results.some((r) => r.id === "auditorias")).toBe(true);
  });

  it("busca por 'configurações financeiras' retorna o item de Configurações", () => {
    const results = searchNavItems(NAVIGATION_ITEMS, "configurações financeiras", "administrador");
    expect(results.some((r) => r.id === "configuracoes")).toBe(true);
  });

  it("legacyRoutes registram as rotas antigas para preservação", () => {
    const audit = NAVIGATION_ITEMS.find((i) => i.id === "auditorias");
    const config = NAVIGATION_ITEMS.find((i) => i.id === "configuracoes");
    expect(audit?.legacyRoutes).toContain("/financeiro/auditoria");
    expect(config?.legacyRoutes).toContain("/financeiro/configuracoes");
  });
});
