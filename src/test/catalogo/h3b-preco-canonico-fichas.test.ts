import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/20260909000000_h3b_preco_canonico_fichas_v1.sql";
const KIT = "restoration/homologacao-h3/30-h3b-preco-canonico-fichas.sql";
const ROLLBACK = "restoration/homologacao-h3/31-h3b-rollback.sql";
const POSTCHECK = "restoration/homologacao-h3/32-h3b-postcheck.sql";

const read = (p: string) => readFileSync(p, "utf8");

describe("H3b — fonte canônica de preço comercial", () => {
  const sql = read(MIGRATION);

  it("cria a função canônica sobre catalogo_volumes com search_path fixo", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.fn_catalogo_preco_canonico");
    expect(sql).toContain("FROM public.catalogo_volumes cv");
    expect(sql).toContain("SET search_path TO 'public'");
  });

  it("não resolve preço por palpite quando há ambiguidade entre apresentações", () => {
    expect(sql).toContain("IF COALESCE(v_distint,0) <> 1 OR COALESCE(v_litro,0) <= 0 THEN");
  });

  it("mantém a regra 1 L = 10 doses na derivação canônica", () => {
    expect(sql).toContain("IF p_unit_type = 'dose'  THEN RETURN round(v_litro / 10.0, 2); END IF;");
  });

  it("injeta a fonte canônica nos dois resolvedores comerciais antes do mestre legado", () => {
    const ocorrencias = sql.split("v_src := 'catalog_volume_price'").length - 1;
    expect(ocorrencias).toBe(2);
    for (const fn of [
      "CREATE OR REPLACE FUNCTION public.fn_b2b_resolve_base_unit_price",
      "CREATE OR REPLACE FUNCTION public.fn_resolve_commercial_price",
    ]) {
      const inicio = sql.indexOf(fn);
      expect(inicio).toBeGreaterThan(-1);
      const canonico = sql.indexOf("fn_catalogo_preco_canonico(p_product_id", inicio);
      const legado = sql.indexOf("FROM public.produtos pr WHERE pr.id = p_product_id", inicio);
      expect(canonico).toBeGreaterThan(-1);
      expect(canonico).toBeLessThan(legado);
    }
  });

  it("documenta os campos mestres como legado não-canônico", () => {
    expect(sql).toContain("COMMENT ON COLUMN public.produtos.valor_litro_brl");
    expect(sql).toContain("COMMENT ON COLUMN public.microrganismos.valor_litro_brl");
    expect(sql).toContain("LEGADO NAO-CANONICO");
  });
});

describe("H3b — fichas técnicas só aprovadas para papéis externos", () => {
  const sql = read(MIGRATION);

  it("remove as policies permissivas de leitura B2B", () => {
    expect(sql).toContain("DROP POLICY IF EXISTS micro_tech_profiles_b2b_read");
    expect(sql).toContain("DROP POLICY IF EXISTS product_tech_profiles_b2b_read");
    expect(sql).not.toMatch(/CREATE POLICY micro_tech_profiles_b2b_read/);
    expect(sql).not.toMatch(/CREATE POLICY product_tech_profiles_b2b_read/);
  });

  it("exige status aprovado para produtor, B2B e B2B técnico", () => {
    for (const policy of ["micro_tp_read_internal", "prod_tp_read_internal"]) {
      const inicio = sql.indexOf(`CREATE POLICY ${policy}`);
      expect(inicio).toBeGreaterThan(-1);
      const corpo = sql.slice(inicio, sql.indexOf(");", inicio));
      expect(corpo).toContain("status_validacao = 'aprovado'");
      expect(corpo).toContain("parceiro_b2b_tecnico");
      expect(corpo).toContain("b2b_enabled");
    }
  });
});

describe("H3b — projeções públicas respeitam publicação", () => {
  const sql = read(MIGRATION);

  it("expõe somente itens ativos", () => {
    expect(sql.split("WHERE p.ativo = true").length - 1).toBeGreaterThanOrEqual(1);
    expect(sql.split("WHERE m.ativo = true").length - 1).toBeGreaterThanOrEqual(1);
  });

  it("exige ficha aprovada quando existe ficha e respeita b2b_enabled", () => {
    expect(sql).toContain("tp.status_validacao = 'aprovado'");
    expect(sql).toContain("COALESCE(p.b2b_enabled, false) = true");
    expect(sql).toContain("COALESCE(m.b2b_enabled, false) = true");
  });

  it("expõe preço canônico com sinalização de fallback legado", () => {
    expect(sql).toContain("THEN 'catalogo_volumes' ELSE 'legado_mestre' END AS preco_fonte");
  });

  it("mantém anon sem acesso e sem colunas internas", () => {
    expect(sql).toContain("REVOKE ALL ON public.vw_catalogo_ficha_produtos FROM PUBLIC, anon;");
    expect(sql).toContain("REVOKE ALL ON public.vw_catalogo_ficha_microrganismos FROM PUBLIC, anon;");
    for (const col of ["fornecedor", "meio_cultivo", "preco_tabela"]) {
      expect(sql.includes(`  ${col},`)).toBe(false);
    }
  });
});

describe("H3b — kit de restauração", () => {
  it("mantém cópia idêntica da migration no kit (H1-015 aberta)", () => {
    expect(read(KIT)).toBe(read(MIGRATION));
  });

  it("fornece rollback reversível e postcheck transacional", () => {
    const rollback = read(ROLLBACK);
    expect(rollback).toContain("DROP FUNCTION IF EXISTS public.fn_catalogo_preco_canonico");
    expect(rollback).toContain("CREATE OR REPLACE FUNCTION public.fn_b2b_resolve_base_unit_price");

    const postcheck = read(POSTCHECK);
    expect(postcheck.trimStart().split("\n").some((l) => l.trim() === "BEGIN;")).toBe(true);
    expect(postcheck.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    for (const check of [
      "PASS_H3B_NO_PERMISSIVE_B2B_POLICY",
      "PASS_H3B_BIOINSETICIDA02",
      "PASS_H3B_PARIDADE_CATALOGO_PAYLOAD",
      "PASS_H3B_VIEW_PUBLICACAO",
    ]) {
      expect(postcheck).toContain(check);
    }
  });
});
