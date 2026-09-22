import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-D-L3 (retificação 2) — gate estático do forward `20261011000000`, aplicado
 * exclusivamente em homologação.
 *
 * Trava a regressão comprovada dinamicamente antes da correção:
 * `public.get_report_customer_statement(uuid,date,date)` referenciava colunas
 * inexistentes (`entregas.valor_total`, `entregas.data_entrega` e
 * `accounts_receivable_installments.amount`) e falhava com 42703 para chamadores
 * autorizados, derrubando também `get_report_accountability(jsonb)`.
 */
const ROOT = resolve(__dirname, "../../..");
const FORWARD = resolve(
  ROOT,
  "restoration/homologacao-h9/h9d-forwards/20261011000000_h9dl3r2_customer_statement_live_columns_v1.sql",
);
const ROLLBACK = resolve(
  ROOT,
  "restoration/homologacao-h9/h9d-rollbacks/20261011000000_h9dl3r2_customer_statement_live_columns_v1_rollback.sql",
);
const MANIFEST = resolve(ROOT, "restoration/homologacao-h9/h9c-applied-forwards.json");
const DIAGNOSTICO = resolve(
  ROOT,
  "restoration/homologacao-h9/h9d-inventario/relatorio-integridade-received-amount.md",
);

const forward = readFileSync(FORWARD, "utf8");
/** Apenas o SQL executável: os comentários citam propositalmente os defeitos corrigidos. */
const sql = forward
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
const rollback = readFileSync(ROLLBACK, "utf8");
const diagnostico = readFileSync(DIAGNOSTICO, "utf8");
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  ledger_versoes: number;
  entries: { version: string; applied_to_staging: boolean; required_in_promotion_bundle: boolean }[];
};

describe("H9-D-L3R2 — extrato do cliente com colunas vivas", () => {
  it("é um forward de homologação, sem menção à produção", () => {
    expect(forward).toContain("ikaauvsflpmamgxmkhoq");
    expect(forward).not.toContain("navfzbwgwzruipouyfnk");
    expect(rollback).not.toContain("navfzbwgwzruipouyfnk");
  });

  it("remove as colunas inexistentes do SQL executável", () => {
    expect(sql).not.toMatch(/\bvalor_total\b/);
    expect(sql).not.toMatch(/\bdata_entrega\b/);
    expect(sql).not.toMatch(/\bi\.amount\b/);
    expect(sql).toContain("COALESCE(e.entregue_em::date, e.data_saida)");
    expect(sql).toContain("ar.total_amount");
  });

  it("usa a fórmula canônica de saldo em aberto das funções já corrigidas", () => {
    expect(sql).toContain("i.original_amount - COALESCE(i.received_amount,0) - COALESCE(i.discount_amount,0)");
  });

  it("preserva a guarda financeira antes de qualquer leitura e valida o período", () => {
    const corpo = sql.slice(sql.indexOf("AS $function$"));
    const guarda = corpo.indexOf("IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'");
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(corpo.indexOf("FROM entregas"));
    expect(sql).toContain("Período inválido");
    expect(sql).toContain("22023");
  });

  it("preserva o contrato JSON e documenta a base de delivered sem estimativas", () => {
    for (const chave of ["'customer_id'", "'period'", "'delivered'", "'billed'", "'received'", "'open_balance'"]) {
      expect(sql).toContain(chave);
    }
    expect(sql).toContain("'delivered_basis', 'accounts_receivable_linked_to_confirmed_deliveries'");
    expect(sql).toContain("'delivered_unlinked_count'");
    expect(sql).toContain("'received_net_of_reversals'");
  });

  it("evita dupla contagem de entregas que apontem ao mesmo título", () => {
    expect(sql).toMatch(/SELECT DISTINCT ep\.receivable_id/);
    expect(sql).not.toMatch(/SELECT \*/);
  });

  it("mantém ACL explícita, sem PUBLIC nem anon, e search_path fixo", () => {
    expect(sql).toContain("SET search_path TO 'public'");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_report_customer_statement\(uuid,date,date\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_report_customer_statement\(uuid,date,date\) FROM anon/);
    for (const papel of ["postgres", "authenticated", "service_role"]) {
      expect(sql).toContain(`TO ${papel};`);
    }
    expect(sql).not.toMatch(/GRANT[^;]*\bTO\b[^;]*\b(PUBLIC|anon)\b/);
  });

  it("o rollback restaura exatamente a definição anterior, com os defeitos originais", () => {
    expect(rollback).toMatch(/\bi\.amount\b/);
    expect(rollback).toContain("SUM(valor_total)");
    expect(rollback).toContain("data_entrega::date");
    expect((rollback.match(/CREATE OR REPLACE FUNCTION/g) ?? [])).toHaveLength(1);
  });

  it("o diagnóstico de integridade registra 0 divergências reais e nenhuma alteração de dados", () => {
    expect(diagnostico).toContain("**0 divergências reais. As 58 parcelas reconciliam.**");
    expect(diagnostico).toContain("div_liquido = 0");
    expect(diagnostico).toContain("estornos_sem_par = 0");
    expect(diagnostico).toContain("fn_recalc_receivable_installment");
    expect(diagnostico).toContain("fn_reverse_payment");
    expect(diagnostico).toContain("**Nenhuma.**");
    // a divergência aparente não pode voltar a ser descrita como risco de dado
    expect(diagnostico).not.toMatch(/risco de dado/);
    // o risco de relatório foi resolvido na rodada 9 (regime caixa líquido)
    expect(diagnostico).toContain("cash_basis = NET_OF_REVERSALS");
    expect(diagnostico).toContain("20261012000000");
  });

  it("o forward está rastreado no manifesto de applied-forwards com ledger 679", () => {
    expect(manifest.ledger_versoes).toBe(684);
    const e = manifest.entries.find((x) => x.version === "20261011000000");
    expect(e).toBeDefined();
    expect(e!.applied_to_staging).toBe(true);
    expect(e!.required_in_promotion_bundle).toBe(true);
  });
});
