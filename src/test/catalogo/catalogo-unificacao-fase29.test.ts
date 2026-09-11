import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { navigation } from "@/config/navigation";
import { canAccess } from "@/lib/permissions";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const app = read("src/App.tsx");

describe("Fase 29 — unificação: apenas o Catálogo Técnico permanece", () => {
  it("o item de menu duplicado 'Catálogo' foi removido", () => {
    expect(navigation.find((i) => i.id === "com-catalogo")).toBeUndefined();
    expect(navigation.filter((i) => i.route === "/comercial/catalogo")).toHaveLength(0);
  });

  it("a rota legada /comercial/catalogo redireciona para a aba unificada", () => {
    expect(app).toContain(
      'path="/comercial/catalogo" element={<PreservedNavigate to="/base-tecnica?tab=catalogo-tecnico" />}',
    );
    expect(app).not.toContain("CatalogoComercial");
  });

  it("a página duplicada não existe mais", () => {
    expect(fs.existsSync(path.resolve(process.cwd(), "src/pages/comercial/CatalogoComercial.tsx"))).toBe(false);
  });

  it("o item 'Catálogo' assume a rota legada e as palavras-chave do catálogo", () => {
    const item = navigation.find((i) => i.id === "protocolos")!;
    expect(item.label).toBe("Catálogo");
    expect(item.legacyRoutes).toContain("/comercial/catalogo");
    const kw = (item.searchKeywords ?? []).map((k) => k.toLowerCase());
    for (const termo of ["catálogo", "catalogo", "portfólio", "catálogo técnico"]) {
      expect(kw).toContain(termo);
    }
  });

  it("gestor_comercial mantém acesso de leitura ao catálogo unificado", () => {
    expect(canAccess("gestor_comercial", "/base-tecnica")).toBe(true);
    expect(canAccess("administrador", "/base-tecnica")).toBe(true);
  });

  it("a sub-aba Catálogo Técnico continua no menu", () => {
    const item = navigation.find((i) => i.id === "protocolos")!;
    const child = item.children?.find((c) => c.id === "protocolos-catalogo-tecnico");
    expect(child?.route).toBe("/base-tecnica?tab=catalogo-tecnico");
  });
});
