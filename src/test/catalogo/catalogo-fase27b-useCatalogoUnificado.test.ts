/**
 * FASE 27B — Otimização segura do useCatalogoUnificado.
 * Valida cache conservador, colunas explícitas, helpers puros e,
 * sobretudo, a preservação integral das garantias de escopo B2B.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildCountMap,
  catalogoBuildSourceKey,
  catalogoGateB2B,
  catalogoIsB2BScope,
  catalogoShouldShowB2BRow,
  CATALOGO_UNIFICADO_GC_TIME,
  CATALOGO_UNIFICADO_STALE_TIME,
  type CatalogoUnificadoRow,
} from "@/hooks/useCatalogoUnificado";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const src = read("src/hooks/useCatalogoUnificado.ts");

const row = (over: Partial<CatalogoUnificadoRow> = {}): CatalogoUnificadoRow => ({
  id: "1", tipo: "produto", nome: "P", subtitulo: null, codigo: null, funcao: null,
  ativo: true, b2b_enabled: true, ficha_status: "aprovado", ficha_resumo: null,
  explicacao_b2b: null, explicacao_produtor: null, mecanismo_acao: null,
  beneficios_agronomicos: null, explicacao_tecnica: null, fontes_count: 0,
  alvos_count: 0, raw: {}, ...over,
});

describe("FASE 27B — configuração de cache e query", () => {
  it("mantém queryKey compatível", () => {
    expect(src).toContain('queryKey: ["catalogo-unificado", scope, kp, km]');
  });

  it("define staleTime, gcTime e desliga refetch on focus", () => {
    expect(src).toContain("staleTime: CATALOGO_UNIFICADO_STALE_TIME");
    expect(src).toContain("gcTime: CATALOGO_UNIFICADO_GC_TIME");
    expect(src).toContain("refetchOnWindowFocus: false");
    expect(CATALOGO_UNIFICADO_STALE_TIME).toBeGreaterThanOrEqual(60_000);
    expect(CATALOGO_UNIFICADO_GC_TIME).toBeGreaterThanOrEqual(5 * 60_000);
  });

  it("não usa polling", () => {
    expect(src).not.toContain("refetchInterval");
  });

  it("não usa SELECT *", () => {
    expect(src).not.toContain('select("*")');
  });
});

describe("FASE 27B — garantias B2B preservadas", () => {
  it("filtra apenas itens ativos e habilitados no B2B", () => {
    expect(src).toContain("r.ativo && r.b2b_enabled");
    expect(catalogoShouldShowB2BRow(row())).toBe(true);
    expect(catalogoShouldShowB2BRow(row({ ativo: false }))).toBe(false);
    expect(catalogoShouldShowB2BRow(row({ b2b_enabled: false }))).toBe(false);
  });

  it("gate de ficha exige status aprovado apenas no B2B", () => {
    expect(src).toContain('status === "aprovado"');
    expect(catalogoGateB2B("b2b", "aprovado", "texto")).toBe("texto");
    expect(catalogoGateB2B("b2b", "em_revisao", "texto")).toBeNull();
    expect(catalogoGateB2B("admin", "em_revisao", "texto")).toBe("texto");
    expect(catalogoGateB2B("interno", null, "texto")).toBe("texto");
  });

  it("texto técnico e modo_acao ficam nulos no B2B", () => {
    expect(src).toContain("explicacao_tecnica: isB2B ? null");
    expect(src).toContain("raw: isB2B ? { ...p, modo_acao: null } : p");
  });

  it("catalogoIsB2BScope identifica só o escopo b2b", () => {
    expect(catalogoIsB2BScope("b2b")).toBe(true);
    expect(catalogoIsB2BScope("admin")).toBe(false);
    expect(catalogoIsB2BScope("interno")).toBe(false);
  });

  it("não expõe conteúdo de fontes ou auditoria, apenas contagens", () => {
    expect(src).not.toContain("catalog_technical_audit_logs");
    expect(src).toContain("fontes_count");
  });
});

describe("FASE 27B — helpers puros", () => {
  it("buildCountMap conta linhas por chave e ignora nulos", () => {
    const m = buildCountMap(
      [{ produto_id: "a" }, { produto_id: "a" }, { produto_id: "b" }, { produto_id: null }],
      "produto_id",
    );
    expect(m.get("a")).toBe(2);
    expect(m.get("b")).toBe(1);
    expect(m.size).toBe(2);
    expect(buildCountMap(null, "produto_id").size).toBe(0);
  });

  it("catalogoBuildSourceKey normaliza tipos de ficha", () => {
    expect(catalogoBuildSourceKey("ficha_produto", "x")).toBe("produto:x");
    expect(catalogoBuildSourceKey("ficha_microrganismo", "y")).toBe("microrganismo:y");
    expect(catalogoBuildSourceKey("produto", "z")).toBe("produto:z");
    expect(catalogoBuildSourceKey("microrganismo", "w")).toBe("microrganismo:w");
  });
});

describe("FASE 27B — fluxos externos intocados", () => {
  it("carrinho e portais seguem nas fontes canônicas", () => {
    expect(read("src/hooks/usePartnerCatalog.ts")).toContain("get_partner_catalog_secure");
    expect(read("src/hooks/usePartnerCatalogTecnico.ts")).toContain("get_partner_catalog_tecnico_secure");
    expect(read("src/hooks/useCreatePartnerOrder.ts")).toContain("create_partner_order_secure");
    const novoPedido = read("src/pages/portal-parceiro/NovoPedido.tsx");
    expect(novoPedido).toContain("AddToCartDialog");
    // usa apenas o tipo CatalogoUnificadoRow; nunca o hook interno como fonte.
    expect(novoPedido).not.toContain("useCatalogoUnificado(");
  });

  it("MobileCatalogoTecnico não passou a depender do hook interno", () => {
    expect(read("src/pages/app/MobileCatalogoTecnico.tsx")).not.toContain("useCatalogoUnificado(");
  });
});
