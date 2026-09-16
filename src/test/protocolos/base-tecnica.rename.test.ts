import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { navigation } from "@/config/navigation";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

describe("Base Técnica Agronômica — renomeação de interface", () => {
  const item = navigation.find((i) => i.id === "protocolos");

  it("o menu apresenta o rótulo 'Catálogo' (Fase 26C)", () => {
    expect(item?.label).toBe("Catálogo");
  });

  it("a rota canônica é /base-tecnica e /protocolos apenas redireciona", () => {
    expect(item?.route).toBe("/base-tecnica");
    expect(item?.id).toBe("protocolos");
    expect(item?.legacyRoutes).toContain("/protocolos");
    const app = read("src/App.tsx");
    expect(app).toContain('path="/base-tecnica" element={<RoleGuard><Protocolos /></RoleGuard>}');
    expect(app).toContain('path="/protocolos" element={<PreservedNavigate to="/base-tecnica" />}');
    // não pode existir uma segunda implementação do módulo
    expect(app.match(/<Protocolos \/>/g)?.length).toBe(1);
  });

  it("a busca do menu encontra Base Técnica, Catálogo, Produtos, Culturas e ainda Protocolos", () => {
    const kw = (item?.searchKeywords ?? []).map((k) => k.toLowerCase());
    for (const termo of [
      "base técnica",
      "base tecnica",
      "catálogo",
      "catalogo",
      "catálogo ar bio",
      "catalogo ar bio",
      "catálogo técnico",
      "catalogo tecnico",
      "microrganismos",
      "produtos",
      "culturas",
      "protocolos",
      "alvos",
    ]) {
      expect(kw).toContain(termo);
    }
  });

  it("o item exibe 'Catálogo', não 'Catálogo Cultivo Farm', mas mantém rota, filhos e parâmetros", () => {
    expect(item?.label).toBe("Catálogo");
    expect(item?.label).not.toBe("Catálogo Cultivo Farm");
    expect(item?.route).toBe("/base-tecnica");
    expect(item?.children?.map((c) => c.route)).toEqual([
      "/base-tecnica?tab=produtos",
      "/base-tecnica?tab=microrganismos",
      "/base-tecnica?tab=catalogo-tecnico",
      "/base-tecnica?tab=culturas",
      "/base-tecnica?tab=problemas",
    ]);
  });

  it("aceita aliases de aba convertidos para o valor canônico", () => {
    const src = read("src/pages/Protocolos.tsx");
    expect(src).toContain("TAB_ALIASES");
    for (const alias of ["catalogo", "fichas", "tecnico", "revisao"]) {
      expect(src).toContain(`${alias}: "catalogo-tecnico"`);
    }
  });

  it("a página apresenta título e descrição novos, sem o título antigo", () => {
    const src = read("src/pages/Protocolos.tsx");
    expect(src).toContain("Base Técnica Agronômica");
    expect(src).toContain("Produtos, microrganismos, culturas, alvos e recomendações técnicas.");
    expect(src).not.toContain("Protocolos Técnicos");
  });

  it("a permissão existe para a rota canônica e a legada", () => {
    expect(read("src/lib/permissions.ts")).toContain('"/base-tecnica"');
    expect(read("src/lib/permissions.ts")).toContain('"/protocolos"');
  });

  it("o objetivo agronômico traz ajuda contextual separando-o do objetivo da visita", () => {
    const src = read("src/components/protocolos/catalog/CropsManager.tsx");
    expect(src).toContain("Objetivo agronômico");
    expect(src).toContain("objetivo da visita técnica");
    expect(src).toContain("objetivo_uso");
  });
});
