import { describe, it, expect } from "vitest";
import { desktopItemsBySection, navigation } from "@/config/navigation";

describe("menu Administração > Fiscal", () => {
  const adm = desktopItemsBySection().find((g) => g.section === "Administração")!.items;
  it("Visão Geral e Configuração Fiscal ficam na subseção Fiscal, em sequência", () => {
    const ids = adm.map((i) => i.id);
    const iV = ids.indexOf("fiscal-prontidao"), iC = ids.indexOf("config-fiscal");
    expect(iC).toBe(iV + 1);
    expect(adm[iV].subSection).toBe("Fiscal");
    expect(adm[iC].subSection).toBe("Fiscal");
    const fiscal = adm.filter((i) => i.subSection === "Fiscal").map((i) => i.id);
    expect(fiscal.slice(0, 2)).toEqual(["fiscal-prontidao", "config-fiscal"]);
    // subseção contígua (um único cabeçalho "Fiscal")
    const first = ids.indexOf(fiscal[0]);
    expect(ids.slice(first, first + fiscal.length)).toEqual(fiscal);
  });
  it("rotas e aliases preservados", () => {
    const by = Object.fromEntries(navigation.map((n) => [n.id, n]));
    expect(by["config-fiscal"].route).toBe("/configuracoes/fiscal/empresa");
    expect(by["fiscal-prontidao"].route).toBe("/fiscal/prontidao");
    expect(by["fiscal-perfis-produtos"].legacyRoutes).toContain("/fiscal/perfis/produtos");
    expect(by["fiscal-perfis-servicos"].legacyRoutes).toContain("/fiscal/perfis/servicos");
    expect(by["fiscal-perfis-clientes"].legacyRoutes).toContain("/fiscal/perfis/clientes");
  });
});
