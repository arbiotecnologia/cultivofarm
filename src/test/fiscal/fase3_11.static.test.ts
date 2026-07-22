/**
 * Fase Fiscal 3.11.1 — Testes estáticos do harness SQL-nativo executável.
 *
 * Falham se o SQL contiver placeholder/pending/loops de skip, ou se
 * faltar setup/execução real/teardown/guard.
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

describe("Fase Fiscal 3.11.1 — harness SQL executável (não placeholder)", () => {
  test("guia declara explicitamente que 3.11 era placeholder e foi substituída", () => {
    expect(GUIDE).toMatch(/placeholder/i);
    expect(GUIDE).toMatch(/substituída integralmente|substituida integralmente/i);
    expect(GUIDE).toMatch(/3\.11\.1/);
  });

  test("proíbe indicadores de placeholder no SQL certificador", () => {
    const forbidden = [
      /Placeholder/i,
      /a preencher/i,
      /SEÇÃO EXECUTIVA \(a preencher/i,
      /planejamento registrado/i,
      /requer usuários sintéticos semeados/i,
    ];
    for (const rx of forbidden) {
      expect(SQL, `SQL não pode conter ${rx}`).not.toMatch(rx);
    }
  });

  test("não emite status='skipped' em massa nem loop de expectativa vazio", () => {
    // 'skipped' aceito apenas em: CHECK constraint + 3 usos na query de resumo
    // (WHERE status <> 'skipped', WHERE status='skipped', WHERE status IN (...)).
    const skippedLiterals = [...SQL.matchAll(/'skipped'/g)];
    expect(skippedLiterals.length).toBeLessThanOrEqual(5);
    expect(SQL).toMatch(/status IN \('passed','failed','error','skipped'\)/);
    // Nenhum INSERT direto de status='skipped' fora do CHECK constraint
    expect(SQL).not.toMatch(/,\s*'skipped'\s*,/);
  });

  test("APTO exige zero skipped e total planejado atingido", () => {
    expect(SQL).toMatch(
      /status IN \('failed','error','skipped'\)\)=0[\s\S]{0,200}'APTO'/,
    );
    expect(SQL).toMatch(/=677[\s\S]{0,100}'APTO'|=\s*677/);
  });

  test("guard anti-produção presente e literal", () => {
    expect(SQL).toMatch(/ABORT 3\.11\.1/);
    expect(SQL).toMatch(/navfzbwgwzruipouyfnk/);
    expect(SQL).toMatch(/_fiscal_staging_marker/);
    expect(SQL).toMatch(/marker\s*=\s*'STAGING'/);
  });

  test("cria fixtures reais (auth.users + roles + clientes + AR + fiscal)", () => {
    expect(SQL).toMatch(/INSERT INTO auth\.users/);
    expect(SQL).toMatch(/INSERT INTO public\.user_roles/);
    expect(SQL).toMatch(/INSERT INTO public\.clientes/);
    expect(SQL).toMatch(/INSERT INTO public\.user_clientes/);
    expect(SQL).toMatch(/INSERT INTO public\.accounts_receivable/);
    expect(SQL).toMatch(/INSERT INTO public\.fiscal_invoices/);
    expect(SQL).toMatch(/INSERT INTO public\.fiscal_invoice_items/);
    expect(SQL).toMatch(/INSERT INTO public\.fiscal_events/);
    expect(SQL).toMatch(/INSERT INTO public\.fiscal_idempotency_keys/);
    expect(SQL).toMatch(/INSERT INTO public\.company_fiscal_settings/);
    expect(SQL).toMatch(/INSERT INTO public\.product_fiscal_profiles/);
    expect(SQL).toMatch(/INSERT INTO public\.service_fiscal_profiles/);
    expect(SQL).toMatch(/INSERT INTO public\.customer_fiscal_profiles/);
  });

  test("executa as 4 operações reais via EXECUTE ou statement direto", () => {
    // Executor por tabela tem os 4 ramos
    expect(SQL).toMatch(/IF p_op='SELECT'/);
    expect(SQL).toMatch(/ELSIF p_op='INSERT'/);
    expect(SQL).toMatch(/ELSIF p_op='UPDATE'/);
    expect(SQL).toMatch(/ELSIF p_op='DELETE'/);
    // Cada ramo usa EXECUTE ou statement DML real
    expect(SQL).toMatch(/EXECUTE format\('SELECT count\(\*\) FROM public\.%I/);
    expect(SQL).toMatch(/UPDATE public\.fiscal_invoices SET/);
  });

  test("cinco views executadas via _fiscal_3111_run_view", () => {
    expect(SQL).toMatch(/_fiscal_3111_run_view/);
    for (const v of FISCAL_VIEWS) expect(SQL).toContain(v);
  });

  test("RPC chamada de verdade com 4 casos e verificação de metadados", () => {
    expect(SQL).toMatch(/rpc_fiscal_event_manual\(v_invoice/);
    expect(SQL).toMatch(/event_source='USER'/);
    expect(SQL).toMatch(/performed_by = p_uid/);
    expect(SQL).toMatch(/notes = v_notes/);
    // 4 casos negativos identificados
    expect(SQL).toMatch(/p_case=2/);
    expect(SQL).toMatch(/p_case=3/);
    expect(SQL).toMatch(/p_case=4/);
    expect(SQL).toMatch(/evento persistido apesar do deny/);
  });

  test("ownership produtor A vê próprio, B não vê alheio", () => {
    expect(SQL).toMatch(/_fiscal_3111_run_ownership/);
    expect(SQL).toMatch(/O-prodA-own/);
    expect(SQL).toMatch(/O-prodB-other/);
    expect(SQL).toMatch(/scope\s*(=|when)?\s*'own'/i);
    expect(SQL).toMatch(/scope\s*(=|when)?\s*'other'/i);
  });

  test("classificação diferencia RLS (42501) de constraint (error)", () => {
    expect(SQL).toMatch(/WHEN insufficient_privilege THEN/);
    expect(SQL).toMatch(/check_violation OR not_null_violation OR foreign_key_violation/);
    // constraint nunca cai em 'deny'
    expect(SQL).toMatch(/v_status\s*:=\s*'error'[\s\S]{0,60}constraint/);
  });

  test("teardown completo + verificação zero-resíduos", () => {
    expect(SQL).toMatch(/post_cleanup/);
    expect(SQL).toMatch(/ABORT 3\.11\.1: resíduos sintéticos/);
    // remove auth.users sintéticos
    expect(SQL).toMatch(/DELETE FROM auth\.users\s+WHERE id::text LIKE 'ff5c3111-%'/);
    // preserva marker
    expect(SQL).not.toMatch(/DELETE FROM public\._fiscal_staging_marker/);
    expect(SQL).not.toMatch(/DROP TABLE public\._fiscal_staging_marker/);
  });

  test("todos os writes usam namespace sintético", () => {
    const deletes = [...SQL.matchAll(/DELETE\s+FROM\s+(auth|public)\.\w+\s+WHERE\s+([^;]+);/gi)];
    for (const d of deletes) {
      const where = d[2];
      // deve conter marcador sintético OU ser a linha "WHERE 1=0" usada em DELETE dummy
      const ok =
        where.includes("FISCAL_TEST_3111_") ||
        where.includes("ff5c3111-") ||
        where.includes("1=0");
      expect(ok, `DELETE fora do namespace sintético: ${d[0]}`).toBe(true);
    }
  });

  test("matriz canônica com total 677 (justificado matematicamente)", () => {
    const planned =
      MATRIX.length +                    // 15*9*4 = 540
      VIEW_MATRIX.length +                // 15*5   = 75
      RPC_EXPECTATIONS.length * RPC_CASES_PER_ROLE + // 15*4 = 60
      OWNERSHIP_CELLS.length;             // 2
    expect(planned).toBe(677);
    expect(ROLES.length).toBe(15);
    expect(FISCAL_TABLES.length).toBe(9);
    expect(FISCAL_VIEWS.length).toBe(5);
    // Sanidade dentro do SQL: matriz deve ter check total explícito
    expect(SQL).toMatch(/ABORT 3\.11\.1: matriz com % asserções \(esperado 677\)/);
  });

  test("flags fiscais permanecem false", () => {
    const fiscalFlags = Object.entries(FEATURE_FLAGS).filter(([k]) =>
      /fiscal/i.test(k),
    );
    expect(fiscalFlags.length).toBeGreaterThan(0);
    for (const [, v] of fiscalFlags) expect(v).toBe(false);
  });

  test("nenhum indicador de provider/emissão/certificado/webhook/secret", () => {
    const forbidden = [
      "focusnfe","focus-nfe","plugnotas","nfse.gov.br","sefaz",
      "certificate","certificado","webhook","cantransmit","access_token",
      "service_role","bearer eyj",
    ];
    for (const t of forbidden) {
      expect(SQL.toLowerCase()).not.toContain(t.toLowerCase());
    }
  });

  test("nenhum SQL migration/policy alterada nesta fase", () => {
    // O script referencia policies existentes por nome mas não CREATE/DROP POLICY
    expect(SQL).not.toMatch(/^\s*CREATE POLICY\b/mi);
    expect(SQL).not.toMatch(/^\s*DROP POLICY\b/mi);
    expect(SQL).not.toMatch(/^\s*ALTER POLICY\b/mi);
  });

  test("evidência smoke A.2 preservada (31/31), sem inflar em harness completo", () => {
    const ev = JSON.parse(EVID_JSON);
    expect(ev.planned).toBe(31);
    expect(ev.passed).toBe(31);
    expect(ev.harness_completo_aprovado).toBe(false);
    expect(EVID_MD).toMatch(/\b31\b/);
  });

  test("guia lista todos os passos obrigatórios", () => {
    for (const s of [
      "Onde colar", "Como confirmar staging", "O que o script executa",
      "Semântica de assert", "Como exportar", "Como verificar zero resíduos",
      "Como classificar", "NÃO certifica",
    ]) {
      expect(GUIDE).toContain(s);
    }
  });

  test("runner TS existente preservado", () => {
    expect(() => readFileSync(join(ROOT, "src/test/fiscal/rls/runner.ts"), "utf8")).not.toThrow();
    expect(() => readFileSync(join(ROOT, "src/test/fiscal/rls/matrix.ts"), "utf8")).not.toThrow();
  });
});
