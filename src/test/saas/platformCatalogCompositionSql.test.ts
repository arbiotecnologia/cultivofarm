import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = "scripts/rbac-audit/";
const read = (f: string) => readFileSync(dir + f, "utf8");
const code = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const proposed = code(read("proposed-platform-global-product-composition.sql"));
const rollback = code(read("rollback-platform-global-product-composition.sql"));
const runtime = read("runtime-test-platform-global-product-composition.sql");

describe("SQL candidato de composição (estático)", () => {
  it("não muta formulacoes, produtos reais nem faz backfill", () => {
    expect(proposed).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM)\s+public\.formulacoes/i);
    expect(proposed).not.toMatch(/ALTER TABLE public\.formulacoes/i);
    expect(proposed).not.toMatch(/INSERT INTO public\.produtos\b/i);
    // Única UPDATE em produtos é o toque de versão dentro do writer.
    expect(proposed.match(/UPDATE public\.produtos SET/gi)).toEqual(["UPDATE public.produtos SET"]);
    expect(proposed).toMatch(/UPDATE public\.produtos SET updated_at = updated_at/);
  });
  it("sem grants a anon e sem DML de cliente nas tabelas novas", () => {
    expect(proposed).not.toMatch(/GRANT[^;]*TO[^;]*\banon\b/i);
    expect(proposed).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON (TABLE )?public\.produto_composicao/i);
    expect(proposed).toMatch(/ALTER TABLE public\.produto_composicao_conjuntos ENABLE ROW LEVEL SECURITY/);
    expect(proposed).toMatch(/ALTER TABLE public\.produto_composicao_declaracoes ENABLE ROW LEVEL SECURITY/);
  });
  it("todas as funções DEFINER fixam search_path e wrappers são INVOKER", () => {
    const definers = proposed.split(/CREATE FUNCTION/).slice(1).filter((f) => /SECURITY DEFINER/.test(f.split("AS $$")[0]));
    expect(definers.length).toBeGreaterThanOrEqual(3);
    for (const f of definers) expect(f.split("AS $$")[0]).toMatch(/SET search_path=''/);
    expect(proposed).toMatch(/public\.platform_read_global_product_composition[\s\S]*?SECURITY INVOKER/);
    expect(proposed).toMatch(/public\.platform_set_global_product_composition[\s\S]*?SECURITY INVOKER/);
  });
  it("CHECKs de identidade/medida usam IS TRUE (sem brecha NULL) e unidades fechadas", () => {
    expect(proposed).toMatch(/pcd_identidade_check CHECK \(\([\s\S]*?\) IS TRUE\)/);
    expect(proposed).toMatch(/'mL\/L','g\/L','g\/kg','%m\/m','%m\/v','%v\/v','UFC\/mL','UFC\/g'/);
    expect(proposed).not.toMatch(/kg\/L|densidade/i);
  });
  it("writer valida versão finita, família transacional e medida duplicada da receita", () => {
    expect(proposed).toMatch(/NOT pg_catalog\.isfinite\(p_expected_updated_at\)/);
    expect(proposed).toMatch(/catalog_composition_requires_family/);
    expect(proposed).toMatch(/catalog_composition_duplicate_measure/);
    expect(proposed).toMatch(/FOR UPDATE/);
  });
  it("rollback padrão preserva dados (sem DROP/DELETE/TRUNCATE ativos)", () => {
    expect(rollback).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
    expect(rollback).toMatch(/REVOKE EXECUTE/);
  });
  it("runtime termina em ROLLBACK e chama RPCs como authenticated", () => {
    expect(runtime.trim().endsWith("ROLLBACK;")).toBe(true);
    expect(runtime).not.toMatch(/^\s*COMMIT\s*;/m);
    expect(runtime).toMatch(/SET LOCAL ROLE authenticated;\nDO \$\$/);
  });
  it("runtime separa SKIP de PASS/FAIL e identifica a constraint violada", () => {
    expect(runtime).toMatch(/skipped boolean NOT NULL DEFAULT false/);
    expect(runtime).toMatch(/FILTER \(WHERE ok AND NOT skipped\) AS pass/);
    expect(runtime).not.toMatch(/pg_temp\.ok\([^)]*'SKIP/);
    expect(runtime).toMatch(/GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME/);
    expect(runtime).toMatch(/fixture biologico ausente/);
  });
  it("runtime cobre duplicidade entre tipos, concentração declarada válida, cores privados e JWT inválidos", () => {
    for (const s of ["nome_duplicado_entre_tipos", "unique.nome_normalizado", "check.micro_concentracao_declarada_valida",
      "sa.biologico.concentracao_declarada_valida", ".core_writer", "anon.core_reader", "jwt.", "'expirado'", "'iat_futuro'", "sa.replay_divergente", "sa.cas_stale"])
      expect(runtime).toContain(s);
  });
});
