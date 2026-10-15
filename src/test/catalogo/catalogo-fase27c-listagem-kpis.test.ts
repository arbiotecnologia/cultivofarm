import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { computeCatalogoKpis } from "@/components/catalogo/CatalogoKpis";
import type { CatalogoUnificadoRow } from "@/hooks/useCatalogoUnificado";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const GRID = read("src/components/catalogo/CatalogoCardsGrid.tsx");
const KPIS = read("src/components/catalogo/CatalogoKpis.tsx");
const DRAWER = read("src/components/catalogo/CatalogoItemDrawer.tsx");
const HOOK = read("src/hooks/useCatalogoUnificado.ts");

describe("FASE 27C — grade do catálogo preservada", () => {
  it("mantém Ver ficha, Ficha completa e actionSlot", () => {
    expect(GRID).toContain("Ver ficha");
    expect(GRID).toContain("Ficha completa");
    expect(GRID).toContain("actionSlot");
  });

  it("mantém FichaProdutorDrawer e dialogs técnicos", () => {
    expect(GRID).toContain("FichaProdutorDrawer");
    expect(GRID).toContain("ProductTechnicalProfileDialog");
    expect(GRID).toContain("MicroorganismTechnicalProfileDialog");
    expect(GRID).toContain("CatalogoItemDrawer");
  });

  it("não consulta backend diretamente", () => {
    expect(GRID).not.toContain("integrations/supabase/client");
    expect(GRID).not.toContain(".rpc(");
  });

  it("memoiza listas derivadas e o array base", () => {
    expect(GRID).toContain("const rows = useMemo(() => data ?? [], [data]);");
    expect(GRID).toMatch(/const filtered = useMemo/);
    expect(GRID).toMatch(/const sorted = useMemo/);
  });

  it("tem estado vazio diferenciado com limpar filtros", () => {
    expect(GRID).toContain("Nenhum item encontrado para os filtros aplicados.");
    expect(GRID).toContain("Limpar filtros");
  });
});

describe("FASE 27C — KPIs", () => {
  it("não usa supabase nem rpc e memoiza", () => {
    expect(KPIS).not.toContain("supabase");
    expect(KPIS).not.toContain(".rpc(");
    expect(KPIS).toContain("useMemo");
  });

  it("computeCatalogoKpis é puro e determinístico", () => {
    const rows = [
      { tipo: "produto", ativo: true, ficha_status: "aprovado", b2b_enabled: true, explicacao_b2b: null, composicao_count: 0, fontes_count: 0 },
      { tipo: "microrganismo", ativo: true, ficha_status: "rascunho", b2b_enabled: false, explicacao_b2b: null, composicao_count: null, fontes_count: 2 },
    ] as unknown as CatalogoUnificadoRow[];
    const a = computeCatalogoKpis(rows);
    const b = computeCatalogoKpis(rows);
    expect(a).toEqual(b);
    expect(a).toEqual({
      ativosM: 1,
      ativosP: 1,
      aprovadas: 1,
      incompletas: 1,
      b2bSemExpl: 1,
      semComp: 1,
      semFonte: 1,
    });
  });
});

describe("FASE 27C — 27B certificada", () => {
  it("hook mantém cache e queryKey", () => {
    expect(HOOK).toContain('queryKey: ["catalogo-unificado", scope, kp, km]');
    expect(HOOK).toContain("staleTime:");
    expect(HOOK).toContain("gcTime:");
    expect(HOOK).toContain("refetchOnWindowFocus: false");
    expect(HOOK).not.toContain('select("*")');
  });

  it("gates B2B preservados", () => {
    expect(HOOK).toContain('status === "aprovado"');
    expect(HOOK).toContain("r.ativo && r.b2b_enabled");
    expect(HOOK).toContain("explicacao_tecnica: isB2B ? null");
    expect(HOOK).toContain("modo_acao: null");
  });

  it("drawer unificado permanece somente leitura", () => {
    expect(DRAWER).not.toContain("supabase");
    expect(DRAWER).not.toContain(".rpc(");
    expect(DRAWER).not.toContain("useQuery");
    expect(DRAWER).not.toContain("useMutation");
  });

  it("carrinho e pedido B2B intactos", () => {
    const novo = read("src/pages/portal-parceiro/NovoPedido.tsx");
    expect(novo).toContain("usePartnerCatalog");
    expect(novo).toContain("AddToCartDialog");
  });
});
