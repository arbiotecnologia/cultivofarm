/**
 * Fase Fiscal 3.11.2 — Testes estáticos do harness SQL-nativo executável.
 *
 * Falham se:
 *  - houver "Placeholder" / "a preencher" / seção não preenchida;
 *  - houver CREATE FUNCTION public._fiscal_3111_* ou CREATE TABLE public._fiscal_test_3111_*;
 *  - houver "WHERE 1=0" no ramo DELETE;
 *  - o ramo DELETE não confirmar presença física após a tentativa;
 *  - houver mass insertion de 'skipped' fora do CHECK constraint;
 *  - APTO for permitido com skips ou total ≠ 677;
 *  - faltar setup/execução real/teardown/guard;
 *  - o UUID ...000f (anon) receber role cliente_produtor;
 *  - houver instrução de DROP TABLE public._fiscal_test_3111_* (cleanup manual).
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

describe("Fase Fiscal 3.11.2 — harness SQL executável e sem resíduos em public", () => {
  test("guia declara que 3.11 (placeholder) e 3.11.1 (helpers em public) foram substituídas", () => {
    expect(GUIDE).toMatch(/3\.11\.2/);
    expect(GUIDE).toMatch(/pg_temp/i);
    expect(GUIDE).toMatch(/placeholder/i);
    expect(GUIDE).toMatch(/substituíd/i);
  });

  test("proíbe indicadores de placeholder no SQL certificador", () => {
    const forbidden = [
      /\bPlaceholder\b/i,
      /a preencher/i,
      /SEÇÃO EXECUTIVA \(a preencher/i,
      /planejamento registrado/i,
      /requer usuários sintéticos semeados/i,
    ];
    for (const rx of forbidden) {
      expect(SQL, `SQL não pode conter ${rx}`).not.toMatch(rx);
    }
  });

  test("proíbe helpers e tabelas de suporte em public", () => {
    // Nenhuma função ou tabela _fiscal_3111_* / _fiscal_test_3111_* pode ser criada em public
    expect(SQL).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\._fiscal_3111_/i);
    expect(SQL).not.toMatch(/CREATE\s+TABLE\s+public\._fiscal_test_3111_/i);
    expect(SQL).not.toMatch(/CREATE\s+TEMPORARY\s+TABLE\s+public\._fiscal_test_3111_/i);
    // E também garantimos que a versão anterior (DROP TABLE public._fiscal_test_3111_*) sumiu
    expect(SQL).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\._fiscal_test_3111_/i);
    // Nem instrução de "cleanup manual"
    expect(SQL).not.toMatch(/usu[aá]rio limpa manualmente/i);
    expect(SQL).not.toMatch(/limpeza manual/i);
  });

  test("todos os helpers residem em pg_temp", () => {
    const helperNames = [
      "_fiscal_3111_sanitize","_fiscal_3111_record","_fiscal_3111_as","_fiscal_3111_as_anon",
      "_fiscal_3111_reset","_fiscal_3111_ensure_fixture_delete","_fiscal_3111_delete_sql",
      "_fiscal_3111_presence_delete","_fiscal_3111_run_table","_fiscal_3111_run_view",
      "_fiscal_3111_run_rpc","_fiscal_3111_run_ownership",
    ];
    for (const n of helperNames) {
      const createRx = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+pg_temp\\.${n}\\b`, "i");
      expect(SQL, `esperado CREATE ... pg_temp.${n}`).toMatch(createRx);
    }
    // Tabelas de suporte como TEMPORARY
    expect(SQL).toMatch(/CREATE\s+TEMPORARY\s+TABLE\s+_fiscal_test_3111_results/i);
    expect(SQL).toMatch(/CREATE\s+TEMPORARY\s+TABLE\s+_fiscal_test_3111_matrix/i);
    // Verificação final: contar zero helpers em public
    expect(SQL).toMatch(/nspname='public'\s+AND\s+p\.proname\s+LIKE\s+'_fiscal_3111_%'/);
    expect(SQL).toMatch(/nspname='public'\s+AND\s+c\.relname\s+LIKE\s+'_fiscal_test_3111_%'/);
  });

  test("ramo DELETE nunca usa WHERE 1=0", () => {
    expect(SQL).not.toMatch(/WHERE\s+1\s*=\s*0/i);
  });

  test("DELETE opera contra fixture identificável real por tabela", () => {
    // Cada uma das 9 tabelas tem um SQL de DELETE explícito
    const deleteTargets: Record<string, RegExp> = {
      company_fiscal_settings:
        /DELETE FROM public\.company_fiscal_settings\s+WHERE cnpj='FISCAL_TEST_3111_DELCNPJ'/,
      product_fiscal_profiles:
        /DELETE FROM public\.product_fiscal_profiles\s+WHERE accounting_notes='FISCAL_TEST_3111_DEL_PROD'/,
      service_fiscal_profiles:
        /DELETE FROM public\.service_fiscal_profiles\s+WHERE source_reference='FISCAL_TEST_3111_DEL_SERV'/,
      customer_fiscal_profiles:
        /DELETE FROM public\.customer_fiscal_profiles\s+WHERE validation_notes='FISCAL_TEST_3111_DEL_CUST'/,
      fiscal_invoices:
        /DELETE FROM public\.fiscal_invoices\s+WHERE notes='FISCAL_TEST_3111_FI_DEL'/,
      fiscal_invoice_items:
        /DELETE FROM public\.fiscal_invoice_items\s+WHERE description='FISCAL_TEST_3111_ITEM_DEL_SLOT'/,
      fiscal_events:
        /DELETE FROM public\.fiscal_events\s+WHERE notes='FISCAL_TEST_3111_EV_DEL'/,
      fiscal_idempotency_keys:
        /DELETE FROM public\.fiscal_idempotency_keys\s+WHERE idempotency_key='FISCAL_TEST_3111_IDEMP_DEL'/,
      fiscal_audit_log:
        /DELETE FROM public\.fiscal_audit_log\s+WHERE \(new_values->>'notes'\)='FISCAL_TEST_3111_AUDIT_DEL'/,
    };
    for (const [name, rx] of Object.entries(deleteTargets)) {
      expect(SQL, `DELETE ausente/inválido para ${name}`).toMatch(rx);
    }
  });

  test("DELETE confirma presença física após a tentativa (allow ausente / deny preservada)", () => {
    // presence_delete existe e retorna contagem
    expect(SQL).toMatch(/pg_temp\._fiscal_3111_presence_delete\(p_table\)/);
    // Semântica allow: ct=1 AND missing
    expect(SQL).toMatch(/allow_requires:ct=1&missing/);
    // Semântica deny: no_delete AND preserved
    expect(SQL).toMatch(/deny_requires:no_delete&preserved/);
    // ensure_fixture é chamada antes E depois da tentativa (restauração)
    const ensureCalls = [...SQL.matchAll(/pg_temp\._fiscal_3111_ensure_fixture_delete\(/g)];
    expect(ensureCalls.length).toBeGreaterThanOrEqual(3);
  });

  test("não emite status='skipped' em massa; APTO exige zero skipped e total=677", () => {
    // 'skipped' aceito apenas em: CHECK constraint + resumo (WHERE status='skipped' etc)
    const skippedLiterals = [...SQL.matchAll(/'skipped'/g)];
    expect(skippedLiterals.length).toBeLessThanOrEqual(5);
    expect(SQL).toMatch(/status IN \('passed','failed','error','skipped'\)/);
    expect(SQL).not.toMatch(/,\s*'skipped'\s*,/);
    // APTO requer 677 e zero falhas/erros/skips
    expect(SQL).toMatch(
      /status IN \('failed','error','skipped'\)\)=0[\s\S]{0,200}'APTO'/,
    );
    expect(SQL).toMatch(/=\s*677[\s\S]{0,100}'APTO'/);
  });

  test("guard anti-produção presente e literal", () => {
    expect(SQL).toMatch(/ABORT 3\.11\.2/);
    expect(SQL).toMatch(/navfzbwgwzruipouyfnk/);
    expect(SQL).toMatch(/_fiscal_staging_marker/);
    expect(SQL).toMatch(/marker\s*=\s*'STAGING'/);
  });

  test("role_map: UUID ...000f (anon) NÃO recebe role; ...0010 recebe cliente_produtor", () => {
    // Bloqueia atribuição do papel ao uuid anônimo (regressão do bug da 3.11.1)
    expect(SQL).not.toMatch(
      /ARRAY\['ff5c3111-0000-0000-0000-00000000000f'\s*,\s*'cliente_produtor'\]/,
    );
    // Guard em SQL: exception se anon uuid tiver role
    expect(SQL).toMatch(
      /anon UUID \(\.\.\.000f\) recebeu role indevidamente|_fiscal_3111_ANON_HAS_ROLE|000f['"]?::uuid\)\s*\)\s*THEN\s*[\s\S]{0,80}RAISE/,
    );
    // ...0010 recebe cliente_produtor
    expect(SQL).toMatch(
      /ARRAY\['ff5c3111-0000-0000-0000-000000000010'\s*,\s*'cliente_produtor'\]/,
    );
  });

  test("cria fixtures reais (auth.users + roles + clientes + AR + fiscal) + delete-slots", () => {
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
    // Delete-slots por tabela (chaves específicas)
    for (const key of [
      "FISCAL_TEST_3111_DELCNPJ", "FISCAL_TEST_3111_DEL_PROD",
      "FISCAL_TEST_3111_DEL_SERV", "FISCAL_TEST_3111_DEL_CUST",
      "FISCAL_TEST_3111_FI_DEL", "FISCAL_TEST_3111_ITEM_DEL_SLOT",
      "FISCAL_TEST_3111_EV_DEL", "FISCAL_TEST_3111_IDEMP_DEL",
      "FISCAL_TEST_3111_AUDIT_DEL",
    ]) {
      expect(SQL, `delete-slot ausente: ${key}`).toContain(key);
    }
  });

  test("executa 4 operações reais + views + RPC + ownership", () => {
    expect(SQL).toMatch(/IF p_op='SELECT'/);
    expect(SQL).toMatch(/ELSIF p_op='INSERT'/);
    expect(SQL).toMatch(/ELSIF p_op='UPDATE'/);
    expect(SQL).toMatch(/ELSIF p_op='DELETE'/);
    expect(SQL).toMatch(/UPDATE public\.fiscal_invoices SET/);
    expect(SQL).toMatch(/_fiscal_3111_run_view/);
    for (const v of FISCAL_VIEWS) expect(SQL).toContain(v);
    // RPC real com metadados
    expect(SQL).toMatch(/rpc_fiscal_event_manual\(v_invoice/);
    expect(SQL).toMatch(/event_source\s*=\s*'USER'/);
    expect(SQL).toMatch(/performed_by\s*=\s*p_uid/);
    expect(SQL).toMatch(/notes\s*=\s*v_notes/);
    expect(SQL).toMatch(/p_case=2/);
    expect(SQL).toMatch(/p_case=3/);
    expect(SQL).toMatch(/p_case=4/);
    expect(SQL).toMatch(/evento persistido apesar do deny/);
    // Ownership A/B
    expect(SQL).toMatch(/_fiscal_3111_run_ownership/);
    expect(SQL).toMatch(/O-prodA-own/);
    expect(SQL).toMatch(/O-prodB-other/);
    expect(SQL).toMatch(/WHEN 'own'/);
    expect(SQL).toMatch(/WHEN 'other'/);
  });

  test("classificação diferencia RLS (42501) de constraint (error)", () => {
    expect(SQL).toMatch(/WHEN insufficient_privilege THEN/);
    expect(SQL).toMatch(/check_violation OR not_null_violation OR foreign_key_violation/);
    expect(SQL).toMatch(/v_status\s*:=\s*'error'[\s\S]{0,60}constraint/);
  });

  test("teardown completo + verificação zero-resíduos + zero helpers em public", () => {
    expect(SQL).toMatch(/post_cleanup/);
    expect(SQL).toMatch(/ABORT 3\.11\.2: resíduos sintéticos/);
    expect(SQL).toMatch(/DELETE FROM auth\.users\s+WHERE id::text LIKE 'ff5c3111-%'/);
    expect(SQL).toMatch(/n_pub_fn/);
    expect(SQL).toMatch(/n_pub_tbl/);
    expect(SQL).not.toMatch(/DELETE FROM public\._fiscal_staging_marker/);
    expect(SQL).not.toMatch(/DROP TABLE public\._fiscal_staging_marker/);
  });

  test("todos os writes usam namespace sintético (sem WHERE 1=0)", () => {
    const deletes = [...SQL.matchAll(/DELETE\s+FROM\s+(auth|public)\.\w+\s+WHERE\s+([^;]+);/gi)];
    for (const d of deletes) {
      const where = d[2];
      const ok =
        where.includes("FISCAL_TEST_3111_") ||
        where.includes("ff5c3111-") ||
        where.includes("'FISCAL_TEST_3111_");
      expect(ok, `DELETE fora do namespace sintético: ${d[0].slice(0, 200)}`).toBe(true);
      expect(where, `DELETE com WHERE 1=0: ${d[0].slice(0,200)}`).not.toMatch(/1\s*=\s*0/);
    }
  });

  test("matriz canônica com total 677 (justificado matematicamente)", () => {
    const planned =
      MATRIX.length +
      VIEW_MATRIX.length +
      RPC_EXPECTATIONS.length * RPC_CASES_PER_ROLE +
      OWNERSHIP_CELLS.length;
    expect(planned).toBe(677);
    expect(ROLES.length).toBe(15);
    expect(FISCAL_TABLES.length).toBe(9);
    expect(FISCAL_VIEWS.length).toBe(5);
    expect(SQL).toMatch(/ABORT 3\.11\.2: matriz com % asserções \(esperado 677\)/);
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
    for (const t of forbidden) {
      expect(SQL.toLowerCase()).not.toContain(t.toLowerCase());
    }
  });

  test("nenhum SQL migration/policy alterada nesta fase", () => {
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
