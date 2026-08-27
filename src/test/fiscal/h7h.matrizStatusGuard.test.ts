/**
 * FASE H7.3 / H7.9 — Invariantes estáticas do guard de status da matriz fiscal.
 *
 * Congela os achados H7-101 (regra SUPERSEDED não volta a vigorar) e H7-102
 * (menor privilégio em `fiscal_tax_rules`) nos artefatos canônicos, para que
 * uma migration futura não reintroduza o caminho de reativação silenciosa.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const APPLY = resolve(root, "restoration/homologacao-h7/87-h7h-matriz-status-guard-apply.sql");
const ROLLBACK = resolve(root, "restoration/homologacao-h7/88-h7h-matriz-status-guard-rollback.sql");
const POSTCHECK = resolve(root, "restoration/homologacao-h7/86-h7h-matriz-preflight-postcheck.sql");
const MIGRATION = resolve(root, "supabase/migrations/20260927000000_h7h_matriz_status_guard_v1.sql");

const read = (p: string) => readFileSync(p, "utf8");

describe("H7.3 — artefatos canônicos", () => {
  it.each([
    ["apply", APPLY],
    ["rollback", ROLLBACK],
    ["postcheck", POSTCHECK],
    ["migration", MIGRATION],
  ])("%s existe", (_label, path) => {
    expect(existsSync(path)).toBe(true);
  });
});

describe("H7-101 — máquina de estados fechada da regra tributária", () => {
  const sql = read(APPLY);

  it("bloqueia transições fora de DRAFT->PUBLISHED e PUBLISHED->SUPERSEDED", () => {
    expect(sql).toContain("FISCAL_TAX_RULE_STATUS_TRANSITION_FORBIDDEN");
    expect(sql).toMatch(/OLD\.status = 'DRAFT'\s+AND NEW\.status IN \('PUBLISHED'\)/);
    expect(sql).toMatch(/OLD\.status = 'PUBLISHED' AND NEW\.status = 'SUPERSEDED'/);
  });

  it("exige o canal canônico de publicação (autoria e aprovação)", () => {
    expect(sql).toContain("FISCAL_TAX_RULE_PUBLISH_CHANNEL");
    expect(sql).toContain("rpc_fiscal_tax_rule_publish");
  });

  it("torna imutável o conteúdo de versões PUBLISHED e SUPERSEDED", () => {
    expect(sql).toMatch(/OLD\.status IN \('PUBLISHED','SUPERSEDED'\)/);
    expect(sql).toContain("FISCAL_TAX_RULE_IMMUTABLE");
  });

  it("mantém search_path explícito no trigger", () => {
    expect(sql).toContain("SET search_path = public");
  });

  it("é fail-closed quanto ao ambiente (somente staging autorizado)", () => {
    expect(sql).toContain("ikaauvsflpmamgxmkhoq");
    expect(sql).toContain("H7H ABORT");
    expect(sql).not.toContain("navfzbwgwzruipouyfnk");
  });
});

describe("H7-102 — menor privilégio em fiscal_tax_rules", () => {
  const sql = read(APPLY);

  it("revoga DELETE/TRUNCATE de authenticated e tudo de anon", () => {
    expect(sql).toMatch(/REVOKE DELETE, TRUNCATE[^;]*FROM authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON public\.fiscal_tax_rules FROM anon/);
  });

  it("mantém somente leitura/rascunho para authenticated", () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.fiscal_tax_rules TO authenticated/);
  });
});

describe("H7.3/H7.4 — postcheck comportamental", () => {
  const sql = read(POSTCHECK);

  it("prova que ausência de regra publicada bloqueia (nunca isenção)", () => {
    expect(sql).toContain("FISCAL_TAX_RULE_NOT_FOUND");
    expect(sql).toContain("FISCAL_RTC_ENGINE_UNAVAILABLE");
  });

  it("prova que o preflight é server-side e fail-closed", () => {
    expect(sql).toContain("rpc_fiscal_preflight_v1");
  });

  it("não deixa efeitos colaterais no staging", () => {
    expect(sql.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(sql).not.toContain("COMMIT;");
  });
});
