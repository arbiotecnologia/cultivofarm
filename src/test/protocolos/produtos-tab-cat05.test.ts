import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve(process.cwd(), "src/components/protocolos/ProdutosTab.tsx");

describe("CAT-05: ProdutosTab não deve expor superfície destrutiva do catálogo A.R Bio v1.3", () => {
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

  it("não contém o rótulo Recarregar Catálogo A.R Bio v1.3", () => {
    expect(content).not.toContain("Recarregar Catálogo A.R Bio v1.3");
  });

  it("não contém o rótulo parcial Recarregar Catálogo A.R Bio", () => {
    expect(content).not.toContain("Recarregar Catálogo A.R Bio");
  });

  it("não usa os ícones RefreshCcw nem Loader2 exclusivos do botão legado", () => {
    expect(content).not.toContain("RefreshCcw");
    expect(content).not.toContain("Loader2");
  });
});
