import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const KIT = "restoration/homologacao-h3/40-h3c-fonte-canonica-preco.sql";
const ROLLBACK = "restoration/homologacao-h3/41-h3c-rollback.sql";
const POSTCHECK = "restoration/homologacao-h3/42-h3c-postcheck.sql";

const read = (p: string) => readFileSync(p, "utf8");

describe("H3c — fonte canônica única de preço comercial", () => {
  const sql = read(KIT);

  it("cria o resolvedor de preço/litro canônico com detecção de tiers", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.fn_catalogo_litro_canonico");
    expect(sql).toContain("FROM public.catalogo_volumes cv");
    expect(sql).toContain("count(DISTINCT round(cv.preco_litro_brl,2))");
    expect(sql).toContain("SET search_path TO 'public'");
  });

  it("sincroniza apenas na direção catálogo → mestre", () => {
    expect(sql).toContain("CREATE TRIGGER trg_zz_catalogo_volumes_sync_mestre");
    expect(sql).toContain("AFTER INSERT OR UPDATE OR DELETE ON public.catalogo_volumes");
    expect(sql).not.toMatch(/AFTER (INSERT|UPDATE)[^;]*ON public\.produtos[^;]*sync_mestre/);
  });

  it("bloqueia edição direta dos campos legados no mestre", () => {
    for (const t of ["trg_zz_produtos_guard_preco", "trg_zz_microrganismos_guard_preco"]) {
      expect(sql).toContain(`CREATE TRIGGER ${t}`);
    }
    expect(sql).toContain("BEFORE INSERT OR UPDATE ON public.produtos");
    expect(sql).toContain("BEFORE INSERT OR UPDATE ON public.microrganismos");
  });

  it("anula o cache legado quando existem preços diferentes por apresentação", () => {
    expect(sql).toContain("SET valor_litro_brl = NULL, valor_dose_brl = NULL, valor_ha_brl = NULL");
  });

  it("marca os campos mestres como cache derivado não-canônico", () => {
    expect(sql.split("LEGADO NAO-CANONICO / CACHE DERIVADO").length - 1).toBe(5);
  });

  it("faz backfill único do cache derivado", () => {
    expect(sql).toContain("FROM public.catalogo_volumes WHERE ativo = true");
    expect(sql).toContain("PERFORM public.fn_catalogo_sync_mestre_preco(r.produto_id, r.microrganismo_id)");
  });

  it("endurece as policies B2B com ativo e b2b_enabled", () => {
    for (const pol of ["produtos_b2b_read", "micros_b2b_read"]) {
      const i = sql.indexOf(`CREATE POLICY ${pol}`);
      expect(i).toBeGreaterThan(-1);
      const body = sql.slice(i, sql.indexOf(");", i));
      expect(body).toContain("ativo = true");
      expect(body).toContain("COALESCE(b2b_enabled, false) = true");
      expect(body).toContain("parceiro_b2b_tecnico");
    }
  });

  it("mantém anon sem execução das funções de sincronização", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.fn_catalogo_litro_canonico(uuid,uuid) FROM PUBLIC, anon;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.fn_catalogo_sync_mestre_preco(uuid,uuid) FROM PUBLIC, anon;");
  });
});

describe("H3c — reversibilidade e evidência", () => {
  it("rollback remove triggers/funções e restaura os triggers legados", () => {
    const sql = read(ROLLBACK);
    for (const t of [
      "DROP TRIGGER IF EXISTS trg_zz_catalogo_volumes_sync_mestre",
      "DROP TRIGGER IF EXISTS trg_zz_produtos_guard_preco",
      "DROP TRIGGER IF EXISTS trg_zz_microrganismos_guard_preco",
      "DROP FUNCTION IF EXISTS public.fn_catalogo_sync_mestre_preco",
      "CREATE OR REPLACE FUNCTION public.sync_product_pricing",
    ]) {
      expect(sql).toContain(t);
    }
  });

  it("postcheck é transacional e cobre os invariantes H3c", () => {
    const sql = read(POSTCHECK);
    expect(sql.trimStart().split("\n").some((l) => l.trim() === "BEGIN;")).toBe(true);
    expect(sql.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    for (const check of [
      "PASS_H3C_ZERO_DIVERGENCIA",
      "PASS_H3C_BIOINSETICIDA02",
      "PASS_H3C_GUARD_MESTRE",
      "PASS_H3C_SYNC_VOLUME",
      "PASS_H3C_TIERS_SEM_FONTE_DUPLA",
      "PASS_H3C_POLICY_B2B",
      "PASS_H3C_ANON_SEM_EXEC",
    ]) {
      expect(sql).toContain(check);
    }
  });
});
