/**
 * Fase Fiscal 3.11 — Testes estáticos do harness SQL-nativo.
 *
 * Não acessa banco. Apenas inspeciona o SQL, evidências e flags para
 * garantir invariantes (anti-produção, marker, matriz, teardown, etc.).
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MATRIX, VIEW_MATRIX, RPC_EXPECTATIONS, OWNERSHIP_CELLS,
  RPC_CASES_PER_ROLE, ROLES, FISCAL_TABLES, FISCAL_VIEWS,
} from "./rls/matrix";
import { FEATURE_FLAGS } from "@/config/featureFlags";

const ROOT = process.cwd();
const SQL = readFileSync(join(ROOT, "scripts/fiscal-staging-rls-certify.sql"), "utf8");
const EVID_JSON = readFileSync(join(ROOT, "restoration/fiscal-fase3-11/smoke-a2-evidence.json"), "utf8");
const EVID_MD   = readFileSync(join(ROOT, "restoration/fiscal-fase3-11/smoke-a2-evidence.md"), "utf8");
const GUIDE     = readFileSync(join(ROOT, "docs/fiscal-fase3-11-rls-sql-native.md"), "utf8");

describe("Fase Fiscal 3.11 — invariantes do harness SQL-nativo", () => {
  test("guard anti-produção literal presente", () => {
    expect(SQL).toMatch(/ABORT 3\.11/);
    expect(SQL).toMatch(/navfzbwgwzruipouyfnk/);
    expect(SQL).toMatch(/aponta para PRODUÇÃO/);
  });

  test("marker STAGING obrigatório", () => {
    expect(SQL).toMatch(/_fiscal_staging_marker/);
    expect(SQL).toMatch(/marker\s*=\s*'STAGING'/);
    expect(SQL).toMatch(/project_ref IS NULL OR project_ref = ''|v_ref IS NULL OR v_ref = ''/);
  });

  test("project_ref só exposto mascarado", () => {
    // Nunca imprime v_ref cru diretamente em SELECT
    expect(SQL).toMatch(/masked_ref/);
    expect(SQL).toMatch(/project_ref_masked/);
    expect(SQL).not.toMatch(/SELECT[^;]*project_ref\s+AS\s+project_ref\b/i);
  });

  test("namespace sintético único (FISCAL_TEST_RLS_311_ e ff5c0311-)", () => {
    expect(SQL.match(/FISCAL_TEST_RLS_311_/g)?.length ?? 0).toBeGreaterThan(10);
    expect(SQL).toMatch(/ff5c0311-/);
    // Não deve haver writes fora do namespace
    const deletes = [...SQL.matchAll(/DELETE\s+FROM\s+public\.\w+\s+WHERE\s+([^;]+);/gi)];
    for (const d of deletes) {
      const where = d[1];
      expect(
        where.includes("FISCAL_TEST_RLS_311_") ||
        where.includes("ff5c0311-"),
        `DELETE sem namespace sintético: ${d[0]}`,
      ).toBe(true);
    }
  });

  test("cobertura da matriz canônica (não força 632)", () => {
    const planned =
      MATRIX.length +
      VIEW_MATRIX.length +
      RPC_EXPECTATIONS.length * RPC_CASES_PER_ROLE +
      OWNERSHIP_CELLS.length;
    // 15 * 9 * 4 + 15 * 5 + 15 * 4 + 2 = 540 + 75 + 60 + 2 = 677
    expect(planned).toBe(677);
    expect(ROLES.length).toBe(15);
    expect(FISCAL_TABLES.length).toBe(9);
    expect(FISCAL_VIEWS.length).toBe(5);
  });

  test("quatro operações SQL cobertas", () => {
    for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      expect(SQL).toContain(op);
    }
  });

  test("cinco views fiscais referenciadas", () => {
    for (const v of FISCAL_VIEWS) expect(SQL).toContain(v);
  });

  test("RPC rpc_fiscal_event_manual referenciado", () => {
    expect(SQL).toContain("rpc_fiscal_event_manual");
  });

  test("ownership produtor A/B", () => {
    expect(SQL).toMatch(/prodA/);
    expect(SQL).toMatch(/prodB/);
    expect(SQL).toMatch(/O-prodA-own/);
    expect(SQL).toMatch(/O-prodB-other/);
  });

  test("teardown e verificação de resíduos zero", () => {
    expect(SQL).toMatch(/cleanup_post/);
    expect(SQL).toMatch(/residuals/);
    expect(SQL).toMatch(/ABORT 3\.11: resíduos/);
  });

  test("skipped não é aceito na classificação APTO", () => {
    expect(SQL).toMatch(/status IN \('failed','error','skipped'\)\) = 0[\s\S]*'APTO'/);
  });

  test("todas as flags fiscais permanecem false", () => {
    const fiscalFlags = Object.entries(FEATURE_FLAGS).filter(([k]) =>
      /fiscal/i.test(k),
    );
    expect(fiscalFlags.length).toBeGreaterThan(0);
    for (const [, v] of fiscalFlags) expect(v).toBe(false);
  });

  test("nenhum provider/SDK/token/webhook no harness", () => {
    const forbidden = [
      "focusnfe", "focus-nfe", "plugnotas", "nfse.gov.br",
      "sefaz", "certificate", "certificado", "webhook",
      "canTransmit", "access_token", "service_role",
    ];
    for (const term of forbidden) {
      expect(SQL.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  test("evidência smoke A.2 é 31/31 e não declara harness completo aprovado", () => {
    const ev = JSON.parse(EVID_JSON);
    expect(ev.planned).toBe(31);
    expect(ev.executed).toBe(31);
    expect(ev.passed).toBe(31);
    expect(ev.failed).toBe(0);
    expect(ev.harness_completo_aprovado).toBe(false);
    expect(ev.project_ref_masked).toMatch(/\*\*\*/);
    expect(ev.origin).toMatch(/execução manual no SQL Editor do staging/);
    expect(EVID_MD).toMatch(/\b31\b/);
    expect(EVID_MD).toMatch(/staging temporário/);
  });

  test("guia não técnico cobre passos obrigatórios", () => {
    for (const s of [
      "Onde colar", "Como confirmar staging", "Como executar",
      "Como exportar", "Como verificar zero resíduos", "Como classificar",
      "NÃO certifica",
    ]) {
      expect(GUIDE).toContain(s);
    }
  });

  test("harness TS existente preservado (rota adicional, não substituto)", () => {
    // runner.ts e matrix.ts continuam presentes
    expect(() => readFileSync(join(ROOT, "src/test/fiscal/rls/runner.ts"), "utf8")).not.toThrow();
    expect(() => readFileSync(join(ROOT, "src/test/fiscal/rls/matrix.ts"), "utf8")).not.toThrow();
  });
});
