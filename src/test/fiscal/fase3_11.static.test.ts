/**
 * Fase Fiscal 3.11.3 — Testes estáticos do harness SQL-nativo.
 *
 * Reproduz e bloqueia regressão dos bugs runtime encontrados no staging
 * ikaa***hoq (versão 3.11.2). O harness deve, adicionalmente ao que já era
 * exigido em 3.11.2, satisfazer:
 *
 *  1. Sem meta-comando psql "\set" (SQL Editor não interpreta).
 *  2. Clientes + user_clientes criados ANTES de user_roles cliente_produtor.
 *  3. financial_audit_log deletado ANTES de auth.users (pre e post cleanup).
 *  4. INSERT usa GET DIAGNOSTICS ROW_COUNT (allow condicional).
 *  5. product/customer_fiscal_profiles têm DELETE fixture com id/marker
 *     distinto do SEL/UPDATE (não compartilhada).
 *  6. UPDATE alveja PK/id e muta updated_at para product/service/customer;
 *     fiscal_invoice_items UPDATE muta unit_value por (invoice_id,seq).
 *  7. Fixtures das views v_product_fiscal_readiness / v_service_fiscal_
 *     readiness têm is_active=true (elegíveis à view sem alterar a view).
 *  8. Três result-sets no fim: detalhes, divergências, resumo/classificação.
 *  9. RPC executor faz pre/post count de fiscal_events como postgres
 *     (fora do bloco de exceção sob role sem grant).
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

describe("Fase Fiscal 3.11.3 — harness SQL executável e sem regressões runtime", () => {
  test("guia declara sucessão 3.11 → 3.11.1 → 3.11.2 → 3.11.3", () => {
    expect(GUIDE).toMatch(/3\.11\.3/);
    expect(GUIDE).toMatch(/pg_temp/i);
    expect(GUIDE).toMatch(/placeholder/i);
    expect(GUIDE).toMatch(/substitu/i);
  });

  test("SQL puro — sem meta-comando psql \\set (Supabase SQL Editor)", () => {
    // Bloqueia \set ON_ERROR_STOP e qualquer meta-comando psql (linha começando com \)
    expect(SQL).not.toMatch(/^\\set\b/mi);
    expect(SQL).not.toMatch(/\\set\s+ON_ERROR_STOP/i);
    expect(SQL).not.toMatch(/^\\[a-z]/mi);
  });

  test("proíbe placeholders / massa de skipped", () => {
    for (const rx of [
      /\bPlaceholder\b/i, /a preencher/i, /SEÇÃO EXECUTIVA/i,
      /planejamento registrado/i, /requer usuários sintéticos semeados/i,
    ]) expect(SQL).not.toMatch(rx);
  });

  test("proíbe helpers/tabelas em public", () => {
    expect(SQL).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\._fiscal_3111_/i);
    expect(SQL).not.toMatch(/CREATE\s+TABLE\s+public\._fiscal_test_3111_/i);
    expect(SQL).not.toMatch(/CREATE\s+TEMPORARY\s+TABLE\s+public\._fiscal_test_3111_/i);
    expect(SQL).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\._fiscal_test_3111_/i);
    expect(SQL).not.toMatch(/limpeza manual/i);
  });

  test("helpers residem em pg_temp; tabelas de suporte são TEMPORARY", () => {
    const helperNames = [
      "_fiscal_3111_sanitize","_fiscal_3111_record","_fiscal_3111_as","_fiscal_3111_as_anon",
      "_fiscal_3111_reset","_fiscal_3111_ensure_fixture_delete","_fiscal_3111_delete_sql",
      "_fiscal_3111_presence_delete","_fiscal_3111_run_table","_fiscal_3111_run_view",
      "_fiscal_3111_run_rpc","_fiscal_3111_run_ownership",
    ];
    for (const n of helperNames) {
      expect(SQL).toMatch(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+pg_temp\\.${n}\\b`, "i"));
    }
    expect(SQL).toMatch(/CREATE\s+TEMPORARY\s+TABLE\s+_fiscal_test_3111_results/i);
    expect(SQL).toMatch(/CREATE\s+TEMPORARY\s+TABLE\s+_fiscal_test_3111_matrix/i);
    expect(SQL).toMatch(/nspname='public'\s+AND\s+p\.proname\s+LIKE\s+'_fiscal_3111_%'/);
    expect(SQL).toMatch(/nspname='public'\s+AND\s+c\.relname\s+LIKE\s+'_fiscal_test_3111_%'/);
  });

  test("ordem canônica: user_clientes ANTES de user_roles cliente_produtor", () => {
    // O bloco de user_clientes deve aparecer antes do bloco $seed_roles$
    const iSeedClientes = SQL.indexOf("$seed_clientes$");
    const iSeedRoles = SQL.indexOf("$seed_roles$");
    const iUserClientes = SQL.search(/INSERT INTO public\.user_clientes/);
    const iUserRoles = SQL.search(/INSERT INTO public\.user_roles\(user_id/);
    expect(iSeedClientes).toBeGreaterThan(0);
    expect(iSeedRoles).toBeGreaterThan(iSeedClientes);
    expect(iUserClientes).toBeGreaterThan(0);
    expect(iUserRoles).toBeGreaterThan(iUserClientes);
    // E os produtores A/B (uuids ...000b e ...0010) estão vinculados a cliente
    expect(SQL).toMatch(/ff5c3111-0000-0000-0000-00000000000b[\s\S]{0,400}ff5c3111-c1e1-0000-0000-000000000001/);
    expect(SQL).toMatch(/ff5c3111-0000-0000-0000-000000000010[\s\S]{0,400}ff5c3111-c1e1-0000-0000-000000000002/);
  });

  test("financial_audit_log deletado ANTES de auth.users (pre e post cleanup)", () => {
    // Aparece pelo menos duas vezes (pre_cleanup + post_cleanup)
    const finAuditDeletes = [...SQL.matchAll(/DELETE FROM public\.financial_audit_log\s+WHERE performed_by::text LIKE 'ff5c3111-/g)];
    expect(finAuditDeletes.length).toBeGreaterThanOrEqual(2);
    // E cada uma precede o DELETE em auth.users mais próximo
    const authDeletes = [...SQL.matchAll(/DELETE FROM auth\.users\s+WHERE id::text LIKE 'ff5c3111-/g)];
    expect(authDeletes.length).toBeGreaterThanOrEqual(2);
    for (const auth of authDeletes) {
      const before = SQL.slice(0, auth.index);
      const lastFinAudit = before.lastIndexOf("DELETE FROM public.financial_audit_log");
      expect(lastFinAudit, "financial_audit_log deve preceder auth.users").toBeGreaterThan(0);
      // e o financial_audit_log deve estar próximo (mesmo bloco de cleanup)
      expect(auth.index! - lastFinAudit).toBeLessThan(400);
    }
  });

  test("INSERT usa GET DIAGNOSTICS ROW_COUNT para autorizar allow", () => {
    // No executor de INSERT, deve haver um GET DIAGNOSTICS ROW_COUNT após o bloco de INSERTs
    // e a atribuição do observed condicionada a v_ct.
    expect(SQL).toMatch(/ELSIF p_op='INSERT'[\s\S]{100,6000}GET DIAGNOSTICS v_ct\s*=\s*ROW_COUNT[\s\S]{0,200}v_observed\s*:=\s*CASE WHEN v_ct/);
  });

  test("DELETE fixture separada de UPDATE para product/customer_fiscal_profiles", () => {
    // SEL row id termina em ...0001, DEL row id termina em ...000d (marker distinto)
    expect(SQL).toMatch(/ff5c3111-b12b-0000-0000-000000000001[\s\S]{0,200}FISCAL_TEST_3111_SEL_PROD/);
    expect(SQL).toMatch(/ff5c3111-b12b-0000-0000-00000000000d[\s\S]{0,200}FISCAL_TEST_3111_DEL_PROD/);
    expect(SQL).toMatch(/ff5c3111-c057-0000-0000-000000000001[\s\S]{0,200}FISCAL_TEST_3111_SEL_CUST/);
    expect(SQL).toMatch(/ff5c3111-c057-0000-0000-00000000000d[\s\S]{0,200}FISCAL_TEST_3111_DEL_CUST/);
    // O ensure_fixture_delete de product/customer usa o id ...000d (não o ...0001)
    expect(SQL).toMatch(/ff5c3111-b12b-0000-0000-00000000000d[\s\S]{0,300}FISCAL_TEST_3111_DEL_PROD/);
    expect(SQL).toMatch(/ff5c3111-c057-0000-0000-00000000000d[\s\S]{0,300}FISCAL_TEST_3111_DEL_CUST/);
  });

  test("UPDATE por PK/id — nunca muta marker de identificação", () => {
    // product/service/customer/fiscal_invoices: UPDATE por id, SET updated_at=now()
    expect(SQL).toMatch(/UPDATE public\.product_fiscal_profiles SET updated_at=now\(\)\s+WHERE id='ff5c3111-b12b-0000-0000-000000000001'/);
    expect(SQL).toMatch(/UPDATE public\.service_fiscal_profiles SET updated_at=now\(\)\s+WHERE id='ff5c3111-5e12-0000-0000-000000000001'/);
    expect(SQL).toMatch(/UPDATE public\.customer_fiscal_profiles SET updated_at=now\(\)\s+WHERE id='ff5c3111-c057-0000-0000-000000000001'/);
    expect(SQL).toMatch(/UPDATE public\.fiscal_invoices SET updated_at=now\(\)\s+WHERE id='ff5c3111-f15c-0000-0000-000000000001'/);
    // fiscal_invoice_items por PK composta (invoice_id + item_sequence=1)
    expect(SQL).toMatch(/UPDATE public\.fiscal_invoice_items SET unit_value=100\s+WHERE fiscal_invoice_id='ff5c3111-f15c-0000-0000-000000000001'\s+AND item_sequence=1/);
    // UPDATE não pode ficar mutando o próprio marker (accounting_notes/validation_notes/source_reference)
    expect(SQL).not.toMatch(/UPDATE public\.product_fiscal_profiles SET accounting_notes=/);
    expect(SQL).not.toMatch(/UPDATE public\.customer_fiscal_profiles SET validation_notes=/);
    expect(SQL).not.toMatch(/UPDATE public\.service_fiscal_profiles SET accounting_notes=/);
    expect(SQL).not.toMatch(/UPDATE public\.fiscal_invoice_items SET description=/);
  });

  test("Views v_product/service_fiscal_readiness recebem fixture elegível (is_active=true)", () => {
    // product SEL row is_active=true
    expect(SQL).toMatch(/ff5c3111-b12b-0000-0000-000000000001,\s*[^,]+,\s*true/);
    // service SEL row is_active=true
    expect(SQL).toMatch(/ff5c3111-5e12-0000-0000-000000000001['"]?,\s*'FISCAL_TEST_3111_SEL_SERV',\s*true/);
    // company SEL row is_active=true (também defensivo p/ v_fiscal_company_readiness)
    expect(SQL).toMatch(/ff5c3111-c04f-0000-0000-000000000001['"]?,\s*true/);
  });

  test("RPC executor faz pre/post count como postgres (fora do bloco de exceção do role)", () => {
    // Antes do pre_ct, deve haver _fiscal_3111_reset()
    expect(SQL).toMatch(/_fiscal_3111_reset\(\);\s*(?:--[^\n]*\n\s*)*SELECT count\(\*\) INTO v_pre_ct/);
    // Depois do handler (bloco EXCEPTION), pós-count com reset
    expect(SQL).toMatch(/_fiscal_3111_reset\(\);\s*(?:--[^\n]*(?:\n[^\n]*)*\n\s*)?SELECT count\(\*\) INTO v_post_ct[\s\S]{0,400}evento persistido apesar do deny/);
  });

  test("ramo DELETE nunca usa WHERE 1=0", () => {
    expect(SQL).not.toMatch(/WHERE\s+1\s*=\s*0/i);
  });

  test("DELETE opera contra fixture identificável real por tabela", () => {
    const deleteTargets: Record<string, RegExp> = {
      company_fiscal_settings: /DELETE FROM public\.company_fiscal_settings\s+WHERE cnpj='FISCAL_TEST_3111_DELCNPJ'/,
      product_fiscal_profiles: /DELETE FROM public\.product_fiscal_profiles\s+WHERE accounting_notes='FISCAL_TEST_3111_DEL_PROD'/,
      service_fiscal_profiles: /DELETE FROM public\.service_fiscal_profiles\s+WHERE source_reference='FISCAL_TEST_3111_DEL_SERV'/,
      customer_fiscal_profiles: /DELETE FROM public\.customer_fiscal_profiles\s+WHERE validation_notes='FISCAL_TEST_3111_DEL_CUST'/,
      fiscal_invoices: /DELETE FROM public\.fiscal_invoices\s+WHERE notes='FISCAL_TEST_3111_FI_DEL'/,
      fiscal_invoice_items: /DELETE FROM public\.fiscal_invoice_items\s+WHERE description='FISCAL_TEST_3111_ITEM_DEL_SLOT'/,
      fiscal_events: /DELETE FROM public\.fiscal_events\s+WHERE notes='FISCAL_TEST_3111_EV_DEL'/,
      fiscal_idempotency_keys: /DELETE FROM public\.fiscal_idempotency_keys\s+WHERE idempotency_key='FISCAL_TEST_3111_IDEMP_DEL'/,
      fiscal_audit_log: /DELETE FROM public\.fiscal_audit_log\s+WHERE \(new_values->>'notes'\)='FISCAL_TEST_3111_AUDIT_DEL'/,
    };
    for (const [name, rx] of Object.entries(deleteTargets)) {
      expect(SQL, `DELETE ausente para ${name}`).toMatch(rx);
    }
  });

  test("DELETE confirma presença física (allow=missing, deny=preserved)", () => {
    expect(SQL).toMatch(/pg_temp\._fiscal_3111_presence_delete\(p_table\)/);
    expect(SQL).toMatch(/allow_requires:ct=1&missing/);
    expect(SQL).toMatch(/deny_requires:no_delete&preserved/);
  });

  test("APTO exige zero skipped/failed/error e total=677", () => {
    const skippedLiterals = [...SQL.matchAll(/'skipped'/g)];
    expect(skippedLiterals.length).toBeLessThanOrEqual(5);
    expect(SQL).toMatch(/status IN \('passed','failed','error','skipped'\)/);
    expect(SQL).toMatch(/status IN \('failed','error','skipped'\)\)=0[\s\S]{0,200}'APTO'/);
    expect(SQL).toMatch(/=\s*677[\s\S]{0,100}'APTO'/);
  });

  test("guard anti-produção presente com selo 3.11.3", () => {
    expect(SQL).toMatch(/ABORT 3\.11\.3/);
    expect(SQL).toMatch(/navfzbwgwzruipouyfnk/);
    expect(SQL).toMatch(/_fiscal_staging_marker/);
    expect(SQL).toMatch(/marker\s*=\s*'STAGING'/);
  });

  test("role_map: UUID ...000f (anon) NÃO recebe role; ...0010 recebe cliente_produtor", () => {
    expect(SQL).not.toMatch(/ARRAY\['ff5c3111-0000-0000-0000-00000000000f'\s*,\s*'cliente_produtor'\]/);
    expect(SQL).toMatch(/anon UUID \(\.\.\.000f\) recebeu role indevidamente/);
    expect(SQL).toMatch(/ARRAY\['ff5c3111-0000-0000-0000-000000000010'\s*,\s*'cliente_produtor'\]/);
  });

  test("cria fixtures reais + delete-slots", () => {
    for (const s of [
      /INSERT INTO auth\.users/,
      /INSERT INTO public\.user_roles/,
      /INSERT INTO public\.clientes/,
      /INSERT INTO public\.user_clientes/,
      /INSERT INTO public\.accounts_receivable/,
      /INSERT INTO public\.fiscal_invoices/,
      /INSERT INTO public\.fiscal_invoice_items/,
      /INSERT INTO public\.fiscal_events/,
      /INSERT INTO public\.fiscal_idempotency_keys/,
      /INSERT INTO public\.company_fiscal_settings/,
      /INSERT INTO public\.product_fiscal_profiles/,
      /INSERT INTO public\.service_fiscal_profiles/,
      /INSERT INTO public\.customer_fiscal_profiles/,
    ]) expect(SQL).toMatch(s);
    for (const key of [
      "FISCAL_TEST_3111_DELCNPJ","FISCAL_TEST_3111_DEL_PROD","FISCAL_TEST_3111_DEL_SERV",
      "FISCAL_TEST_3111_DEL_CUST","FISCAL_TEST_3111_FI_DEL","FISCAL_TEST_3111_ITEM_DEL_SLOT",
      "FISCAL_TEST_3111_EV_DEL","FISCAL_TEST_3111_IDEMP_DEL","FISCAL_TEST_3111_AUDIT_DEL",
    ]) expect(SQL).toContain(key);
  });

  test("executa 4 operações reais + views + RPC + ownership", () => {
    expect(SQL).toMatch(/IF p_op='SELECT'/);
    expect(SQL).toMatch(/ELSIF p_op='INSERT'/);
    expect(SQL).toMatch(/ELSIF p_op='UPDATE'/);
    expect(SQL).toMatch(/ELSIF p_op='DELETE'/);
    expect(SQL).toMatch(/_fiscal_3111_run_view/);
    for (const v of FISCAL_VIEWS) expect(SQL).toContain(v);
    expect(SQL).toMatch(/rpc_fiscal_event_manual\(v_invoice/);
    expect(SQL).toMatch(/event_source\s*=\s*'USER'/);
    expect(SQL).toMatch(/performed_by\s*=\s*p_uid/);
    expect(SQL).toMatch(/notes\s*=\s*v_notes/);
    expect(SQL).toMatch(/p_case=2/);
    expect(SQL).toMatch(/p_case=3/);
    expect(SQL).toMatch(/p_case=4/);
    expect(SQL).toMatch(/evento persistido apesar do deny/);
    expect(SQL).toMatch(/_fiscal_3111_run_ownership/);
    expect(SQL).toMatch(/O-prodA-own/);
    expect(SQL).toMatch(/O-prodB-other/);
  });

  test("classificação diferencia RLS (42501) de constraint (error)", () => {
    expect(SQL).toMatch(/WHEN insufficient_privilege THEN/);
    expect(SQL).toMatch(/check_violation OR not_null_violation OR foreign_key_violation/);
    expect(SQL).toMatch(/v_status\s*:=\s*'error'[\s\S]{0,60}constraint/);
  });

  test("teardown + verificação zero-resíduos + zero helpers em public", () => {
    expect(SQL).toMatch(/post_cleanup/);
    expect(SQL).toMatch(/ABORT 3\.11\.3: resíduos sintéticos/);
    expect(SQL).toMatch(/DELETE FROM auth\.users\s+WHERE id::text LIKE 'ff5c3111-%'/);
    expect(SQL).toMatch(/n_pub_fn/);
    expect(SQL).toMatch(/n_pub_tbl/);
  });

  test("três result-sets finais: detalhes, divergências, resumo", () => {
    // Contar SELECTs de output pg_temp._fiscal_test_3111_results antes de COMMIT
    const preCommit = SQL.split(/\bCOMMIT;/)[0];
    const outputs = [...preCommit.matchAll(/FROM pg_temp\._fiscal_test_3111_results/g)];
    // 1 detalhes (linha por linha) + 1 divergências + 6 sub-selects do resumo = 8+; ao menos 3 blocos
    expect(outputs.length).toBeGreaterThanOrEqual(3);
    // Divergências: filtro por status IN ('failed','error') no result-set
    expect(preCommit).toMatch(/WHERE status IN \('failed','error'\)/);
    expect(preCommit).toMatch(/SA[IÍ]DA 2[\s\S]{0,200}diverg/i);
    expect(preCommit).toMatch(/SA[IÍ]DA 3[\s\S]{0,200}resumo/i);
  });

  test("todos os writes usam namespace sintético; nenhum WHERE 1=0", () => {
    const deletes = [...SQL.matchAll(/DELETE\s+FROM\s+(auth|public)\.\w+\s+WHERE\s+([^;]+);/gi)];
    for (const d of deletes) {
      const where = d[2];
      const ok = where.includes("FISCAL_TEST_3111_") || where.includes("ff5c3111-") ||
                 where.includes("'FISCAL_TEST_3111_");
      expect(ok, `DELETE fora do namespace: ${d[0].slice(0,200)}`).toBe(true);
      expect(where).not.toMatch(/1\s*=\s*0/);
    }
  });

  test("matriz canônica com total 677", () => {
    const planned =
      MATRIX.length + VIEW_MATRIX.length +
      RPC_EXPECTATIONS.length * RPC_CASES_PER_ROLE + OWNERSHIP_CELLS.length;
    expect(planned).toBe(677);
    expect(ROLES.length).toBe(15);
    expect(FISCAL_TABLES.length).toBe(9);
    expect(FISCAL_VIEWS.length).toBe(5);
    expect(SQL).toMatch(/ABORT 3\.11\.3: matriz com % asserções \(esperado 677\)/);
  });

  test("flags fiscais permanecem false", () => {
    const fiscalFlags = Object.entries(FEATURE_FLAGS).filter(([k]) => /fiscal/i.test(k));
    expect(fiscalFlags.length).toBeGreaterThan(0);
    for (const [, v] of fiscalFlags) expect(v).toBe(false);
  });

  test("nenhum indicador de provider/emissão/certificado/webhook/secret", () => {
    const forbidden = [
      "focusnfe","focus-nfe","plugnotas","nfse.gov.br","sefaz",
      "certificate","certificado","webhook","cantransmit","access_token",
      "service_role","bearer eyj",
    ];
    for (const t of forbidden) expect(SQL.toLowerCase()).not.toContain(t.toLowerCase());
  });

  test("nenhuma migration/policy alterada", () => {
    expect(SQL).not.toMatch(/^\s*CREATE POLICY\b/mi);
    expect(SQL).not.toMatch(/^\s*DROP POLICY\b/mi);
    expect(SQL).not.toMatch(/^\s*ALTER POLICY\b/mi);
  });

  test("evidência smoke A.2 preservada (31/31)", () => {
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
    ]) expect(GUIDE).toContain(s);
  });

  test("runner TS existente preservado", () => {
    expect(() => readFileSync(join(ROOT, "src/test/fiscal/rls/runner.ts"), "utf8")).not.toThrow();
    expect(() => readFileSync(join(ROOT, "src/test/fiscal/rls/matrix.ts"), "utf8")).not.toThrow();
  });
});
