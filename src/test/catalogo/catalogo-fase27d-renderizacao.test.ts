/**
 * FASE 27D — Certificação da 27C e otimização segura de renderização.
 * Validação estática (leitura de código) — sem banco, RPC ou portais.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { CATALOGO_PAGE_SIZE } from "@/components/catalogo/CatalogoCardsGrid";
import { computeCatalogoKpis } from "@/components/catalogo/CatalogoKpis";
import type { CatalogoUnificadoRow } from "@/hooks/useCatalogoUnificado";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const GRID = read("src/components/catalogo/CatalogoCardsGrid.tsx");
const KPIS = read("src/components/catalogo/CatalogoKpis.tsx");
const DRAWER = read("src/components/catalogo/CatalogoItemDrawer.tsx");
const HOOK = read("src/hooks/useCatalogoUnificado.ts");
const DOC = read("docs/auditorias/catalogo-fase27d-renderizacao.md");

describe("FASE 27D — 27C certificada", () => {
  it("mantém rows, filtered e sorted memoizados", () => {
    expect(GRID).toContain("const rows = useMemo(() => data ?? [], [data]);");
    expect(GRID).toMatch(/const filtered = useMemo/);
    expect(GRID).toMatch(/const sorted = useMemo/);
  });

  it("mantém estado vazio diferenciado e Limpar filtros", () => {
    expect(GRID).toContain("Nenhum item encontrado.");
    expect(GRID).toContain("Nenhum item encontrado para os filtros aplicados.");
    expect(GRID).toContain("Limpar filtros");
  });

  it("KPIs seguem puros e sem backend", () => {
    expect(KPIS).not.toContain("supabase");
    expect(KPIS).not.toContain(".rpc(");
    expect(KPIS).toContain("useMemo");
    const rows = [
      { tipo: "produto", ativo: true, ficha_status: "aprovado", b2b_enabled: true, explicacao_b2b: null, composicao_count: 0, fontes_count: 0 },
    ] as unknown as CatalogoUnificadoRow[];
    expect(computeCatalogoKpis(rows)).toEqual(computeCatalogoKpis(rows));
  });
});

describe("FASE 27D — renderização otimizada", () => {
  it("expõe PAGE_SIZE seguro", () => {
    expect(CATALOGO_PAGE_SIZE).toBeGreaterThanOrEqual(60);
    expect(CATALOGO_PAGE_SIZE).toBeLessThanOrEqual(80);
  });

  it("aplica limite após filtro e ordenação", () => {
    expect(GRID).toContain("sorted.length > limite ? sorted.slice(0, limite) : sorted");
    expect(GRID).toContain("visiveis.map");
    expect(GRID).not.toContain("sorted.map");
  });

  it("reseta limite ao mudar filtros/ordenação", () => {
    expect(GRID).toContain("setLimite(CATALOGO_PAGE_SIZE);");
    expect(GRID).toMatch(/\}, \[search, tipo, status, b2b, sort, scope\]\);/);
  });

  it("botão Mostrar mais apenas aumenta o limite local", () => {
    expect(GRID).toContain("Mostrar mais");
    expect(GRID).toContain("setLimite((l) => l + CATALOGO_PAGE_SIZE)");
  });

  it("memoiza callbacks de abertura de ficha", () => {
    expect(GRID).toContain("const abrirVerFicha = useCallback");
    expect(GRID).toContain("const abrirFichaCompleta = useCallback");
  });

  it("não introduz backend na grade", () => {
    expect(GRID).not.toContain("integrations/supabase/client");
    expect(GRID).not.toContain(".rpc(");
    expect(GRID).not.toContain("useQuery");
  });
});

describe("FASE 27D — fluxos dos cards preservados", () => {
  it("Ver ficha, Ficha completa e actionSlot intactos", () => {
    expect(GRID).toContain("Ver ficha");
    expect(GRID).toContain("Ficha completa");
    expect(GRID).toContain("actionSlot");
    expect(GRID).toContain("FichaProdutorDrawer");
    expect(GRID).toContain("ProductTechnicalProfileDialog");
    expect(GRID).toContain("MicroorganismTechnicalProfileDialog");
    expect(GRID).toContain("CatalogoItemDrawer");
  });

  it("drawer unificado segue somente leitura", () => {
    expect(DRAWER).not.toContain("supabase");
    expect(DRAWER).not.toContain(".rpc(");
    expect(DRAWER).not.toContain("useQuery");
    expect(DRAWER).not.toContain("useMutation");
  });

  it("hook mantém contrato de cache da 27B", () => {
    expect(HOOK).toContain('queryKey: ["catalogo-unificado", scope, kp, km]');
    expect(HOOK).toContain("staleTime:");
    expect(HOOK).toContain("gcTime:");
    expect(HOOK).toContain("refetchOnWindowFocus: false");
    expect(HOOK).not.toContain('select("*")');
  });

  it("carrinho e pedido B2B intactos", () => {
    const novo = read("src/pages/portal-parceiro/NovoPedido.tsx");
    expect(novo).toContain("usePartnerCatalog");
    expect(novo).toContain("AddToCartDialog");
    expect(read("src/hooks/useCreatePartnerOrder.ts")).toContain("create_partner_order_secure");
  });

  it("documentação da fase registra a certificação da 27C", () => {
    expect(DOC).toContain("27C CERTIFICADA");
  });
});
