/**
 * FASE 26D/26E — Ficha unificada por item do Catálogo Cultivo Farm (somente leitura).
 * Cobre regras de escopo, alertas, diagnóstico de publicação e integração
 * não destrutiva na grade.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  catalogoFichaAlertas,
  catalogoFichaPublicacao,
  fichaPermiteInterno,
  fichaPermiteTextoB2B,
  fichaPermiteTextoProdutor,
  CATALOGO_FICHA_VAZIO_VOLUMES,
} from "@/components/catalogo/CatalogoItemDrawer";
import type { CatalogoUnificadoRow } from "@/hooks/useCatalogoUnificado";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const row = (over: Partial<CatalogoUnificadoRow> = {}): CatalogoUnificadoRow => ({
  id: "1", tipo: "produto", nome: "Produto X", subtitulo: null, codigo: "PX",
  funcao: null, ativo: true, b2b_enabled: false, ficha_status: "aprovado",
  ficha_resumo: null, explicacao_b2b: null, explicacao_produtor: null,
  mecanismo_acao: null, beneficios_agronomicos: null, explicacao_tecnica: null,
  composicao_count: 2, fontes_count: 1, alvos_count: 0, raw: {},
  ...over,
});

describe("CatalogoItemDrawer — escopos visuais", () => {
  it("apenas admin e interno veem conteúdo interno", () => {
    expect(fichaPermiteInterno("admin")).toBe(true);
    expect(fichaPermiteInterno("interno")).toBe(true);
    expect(fichaPermiteInterno("b2b")).toBe(false);
    expect(fichaPermiteInterno("produtor")).toBe(false);
  });

  it("texto B2B não aparece para o produtor e texto produtor não aparece no B2B", () => {
    expect(fichaPermiteTextoB2B("produtor")).toBe(false);
    expect(fichaPermiteTextoB2B("b2b")).toBe(true);
    expect(fichaPermiteTextoProdutor("b2b")).toBe(false);
    expect(fichaPermiteTextoProdutor("admin")).toBe(true);
  });
});

describe("CatalogoItemDrawer — alertas", () => {
  it("produto sem composição", () => {
    expect(catalogoFichaAlertas(row({ composicao_count: 0 }))).toContain("Produto sem composição");
  });

  it("ficha em rascunho e em revisão", () => {
    expect(catalogoFichaAlertas(row({ ficha_status: "rascunho" }))).toContain("Ficha em rascunho");
    expect(catalogoFichaAlertas(row({ ficha_status: "em_revisao" }))).toContain("Ficha em revisão");
  });

  it("aprovada sem fonte técnica", () => {
    expect(catalogoFichaAlertas(row({ fontes_count: 0 }))).toContain(
      "Ficha aprovada sem fonte técnica",
    );
  });

  it("item saudável não gera alerta", () => {
    expect(catalogoFichaAlertas(row())).toEqual([]);
  });

  it("microrganismo não recebe alerta de composição", () => {
    expect(catalogoFichaAlertas(row({ tipo: "microrganismo", composicao_count: 0 }))).toEqual([]);
  });
});

describe("CatalogoItemDrawer — integração não destrutiva", () => {
  const grid = read("src/components/catalogo/CatalogoCardsGrid.tsx");

  it("a grade abre a ficha unificada sem substituir a ação existente", () => {
    expect(grid).toContain("Ficha completa");
    expect(grid).toContain("Ver ficha");
    expect(grid).toContain("CatalogoItemDrawer");
  });

  it("os fluxos existentes permanecem na grade", () => {
    for (const comp of [
      "FichaProdutorDrawer",
      "MicroorganismTechnicalProfileDialog",
      "ProductTechnicalProfileDialog",
    ]) {
      expect(grid).toContain(comp);
    }
  });

  it("a ficha unificada é somente leitura — sem mutação nem RPC", () => {
    const src = read("src/components/catalogo/CatalogoItemDrawer.tsx");
    expect(src).not.toContain(".rpc(");
    expect(src).not.toContain("useMutation");
    expect(src).not.toContain("supabase");
    expect(src).toContain(CATALOGO_FICHA_VAZIO_VOLUMES);
  });
});

describe("CatalogoItemDrawer — diagnóstico de publicação (26E)", () => {
  it("B2B visível apenas com ativo + b2b_enabled + aprovado", () => {
    const p = catalogoFichaPublicacao(row({ ativo: true, b2b_enabled: true, ficha_status: "aprovado" }));
    expect(p.b2bVisivel).toBe(true);
    expect(p.produtorVisivel).toBe(true);
    expect(p.b2bMotivo).toMatch(/Vis[íi]vel conforme regras atuais/);
  });

  it("item inativo bloqueia B2B e produtor", () => {
    const p = catalogoFichaPublicacao(row({ ativo: false, b2b_enabled: true, ficha_status: "aprovado" }));
    expect(p.b2bVisivel).toBe(false);
    expect(p.produtorVisivel).toBe(false);
    expect(p.b2bMotivo).toBe("Item inativo");
    expect(p.produtorMotivo).toBe("Item inativo");
  });

  it("B2B desabilitado bloqueia só o B2B", () => {
    const p = catalogoFichaPublicacao(row({ ativo: true, b2b_enabled: false, ficha_status: "aprovado" }));
    expect(p.b2bVisivel).toBe(false);
    expect(p.b2bMotivo).toBe("B2B desabilitado");
    expect(p.produtorVisivel).toBe(true);
  });

  it("ficha em revisão bloqueia B2B e produtor", () => {
    const p = catalogoFichaPublicacao(row({ ativo: true, b2b_enabled: true, ficha_status: "em_revisao" }));
    expect(p.b2bVisivel).toBe(false);
    expect(p.produtorVisivel).toBe(false);
    expect(p.b2bMotivo).toBe("Ficha não aprovada");
    expect(p.produtorMotivo).toBe("Ficha não aprovada");
  });
});

describe("CatalogoCardsGrid — fluxos críticos preservados (26E)", () => {
  const grid = read("src/components/catalogo/CatalogoCardsGrid.tsx");
  it("mantém FichaProdutorDrawer e dialogs técnicos na grade", () => {
    for (const comp of [
      "FichaProdutorDrawer",
      "MicroorganismTechnicalProfileDialog",
      "ProductTechnicalProfileDialog",
    ]) {
      expect(grid).toContain(comp);
    }
  });

  it("AddToCartDialog do fluxo B2B permanece no projeto", () => {
    expect(fs.existsSync(path.resolve(process.cwd(), "src/components/catalogo/AddToCartDialog.tsx"))).toBe(true);
  });
});
