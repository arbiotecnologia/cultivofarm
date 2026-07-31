import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NAVIGATION_ITEMS } from "@/config/navigation";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

describe("Base Técnica Agronômica — renomeação de interface", () => {
  const item = NAVIGATION_ITEMS.find((i) => i.id === "protocolos");

  it("o menu apresenta o rótulo 'Base Técnica'", () => {
    expect(item?.label).toBe("Base Técnica");
  });

  it("a rota /protocolos é preservada e o id técnico não muda", () => {
    expect(item?.route).toBe("/protocolos");
    expect(item?.id).toBe("protocolos");
    expect(read("src/App.tsx")).toContain('path="/protocolos"');
  });

  it("a busca do menu encontra Base Técnica, Produtos, Culturas e ainda Protocolos", () => {
    const kw = (item?.searchKeywords ?? []).map((k) => k.toLowerCase());
    for (const termo of ["base técnica", "produtos", "culturas", "protocolos", "alvos"]) {
      expect(kw).toContain(termo);
    }
  });

  it("a página apresenta título e descrição novos, sem o título antigo", () => {
    const src = read("src/pages/Protocolos.tsx");
    expect(src).toContain("Base Técnica Agronômica");
    expect(src).toContain("Produtos, microrganismos, culturas, alvos e recomendações técnicas.");
    expect(src).not.toContain("Protocolos Técnicos");
  });

  it("a permissão continua chaveada pela rota antiga", () => {
    expect(read("src/lib/permissions.ts")).toContain('"/protocolos"');
  });

  it("o objetivo agronômico traz ajuda contextual separando-o do objetivo da visita", () => {
    const src = read("src/components/protocolos/catalog/CropsManager.tsx");
    expect(src).toContain("Objetivo agronômico");
    expect(src).toContain("objetivo da visita técnica");
    expect(src).toContain("objetivo_uso");
  });
});
