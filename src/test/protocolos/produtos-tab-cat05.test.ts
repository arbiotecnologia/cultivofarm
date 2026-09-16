import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve(process.cwd(), "src/components/protocolos/ProdutosTab.tsx");

describe("CAT-05: ProdutosTab não deve expor superfície destrutiva do catálogo Cultivo Farm v1.3", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  it("não importa wipeCatalogoProdutos", () => {
    expect(content).not.toContain("wipeCatalogoProdutos");
  });

  it("não importa importCatalogoARBioV13", () => {
    expect(content).not.toContain("importCatalogoARBioV13");
  });

  it("não importa isCatalogoARBioV13Aplicado", () => {
    expect(content).not.toContain("isCatalogoARBioV13Aplicado");
  });

  it("não contém o rótulo Recarregar Catálogo Cultivo Farm v1.3", () => {
    expect(content).not.toContain("Recarregar Catálogo Cultivo Farm v1.3");
  });

  it("não contém o rótulo parcial Recarregar Catálogo Cultivo Farm", () => {
    expect(content).not.toContain("Recarregar Catálogo Cultivo Farm");
  });

  it("não usa os ícones RefreshCcw nem Loader2 exclusivos do botão legado", () => {
    expect(content).not.toContain("RefreshCcw");
    expect(content).not.toContain("Loader2");
  });
});
