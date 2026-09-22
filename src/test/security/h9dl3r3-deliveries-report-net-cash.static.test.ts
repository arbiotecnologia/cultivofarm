import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-D-L3 (retificação 3) — gate estático do forward `20261012000000`, aplicado
 * exclusivamente em homologação.
 *
 * Trava as regressões comprovadas dinamicamente antes da correção:
 *  A) `public.get_report_deliveries_billing_status(date,date)` referenciava
 *     `entregas.data_entrega` e `entregas.valor_total`, inexistentes, e falhava
 *     com 42703 para staff financeiro;
 *  C) `get_report_monthly_financial` e `get_report_customer_statement`
 *     expressavam caixa BRUTO (apenas `is_reversal = false`), superestimando o
 *     recebido em R$ 3.000,00 no conjunto vivo;
 *  D) `fn_financial_inconsistencies` NÃO deve ser alterada — a regra viva já
 *     descarta originais estornados via `rp2.reversed_payment_id = rp.id`.
 */
const ROOT = resolve(__dirname, "../../..");
const FORWARD = resolve(
  ROOT,
  "restoration/homologacao-h9/h9d-forwards/20261012000000_h9dl3r3_deliveries_report_and_net_cash_v1.sql",
);
const ROLLBACK = resolve(
  ROOT,
  "restoration/homologacao-h9/h9d-rollbacks/20261012000000_h9dl3r3_deliveries_report_and_net_cash_v1_rollback.sql",
);
const MANIFEST = resolve(ROOT, "restoration/homologacao-h9/h9c-applied-forwards.json");

const forward = readFileSync(FORWARD, "utf8");
/** Apenas o SQL executável: os comentários citam propositalmente os defeitos corrigidos. */
const sql = forward
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
const rollback = readFileSync(ROLLBACK, "utf8");
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  ledger_versoes: number;
  entries: {
    version: string;
    applied_to_staging: boolean;
    required_in_promotion_bundle: boolean;
    dados_financeiros_alterados?: boolean;
  }[];
};

describe("H9-D-L3R3 — relatório de entregas e regime caixa líquido (20261012000000)", () => {
  it("não referencia as colunas inexistentes de entregas", () => {
    expect(sql).not.toMatch(/\be\.data_entrega\b/);
    expect(sql).not.toMatch(/\be\.valor_total\b/);
  });

  it("usa as colunas vivas de data de entrega", () => {
    expect(sql).toContain("COALESCE(e.entregue_em::date, e.data_saida)");
  });

  it("deriva o valor da entrega apenas do título vinculado e válido", () => {
    expect(sql).toContain("ar.customer_id = e.cliente_id");
    expect(sql).toContain("ar.status <> 'CANCELED'");
    expect(sql).toContain("COALESCE(ar.total_amount, 0)");
    expect(sql).toContain("(ar.id IS NOT NULL)");
  });

  it("expressa regime caixa líquido sem perder as métricas brutas", () => {
    expect(sql).toContain("'cash_basis', 'NET_OF_REVERSALS'");
    expect(sql).toContain("'received_gross'");
    expect(sql).toContain("'paid_gross'");
    expect(sql).toContain("'received_net_of_reversals'");
    // as somas principais não podem mais filtrar estornos fora
    expect(sql).not.toMatch(/rp\.is_reversal\s*=\s*false\s*\n?\s*AND \(_cost_center/);
    expect(sql).not.toMatch(/pp\.is_reversal\s*=\s*false\s*\n?\s*AND \(_cost_center/);
  });

  it("impede contaminação do delivered por título de outro cliente", () => {
    expect(sql).toContain("ar.customer_id = _customer_id");
  });

  it("preserva guarda financeira, período validado, ACL e search_path", () => {
    const guardas = sql.match(/IF NOT is_financial_staff\(auth\.uid\(\)\) THEN RAISE EXCEPTION 'Acesso negado'/g);
    expect(guardas?.length).toBe(3);
    expect(sql.match(/ERRCODE = '22023'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql.match(/SET search_path TO 'public'/g)?.length).toBe(3);
    expect(sql.match(/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC/g)?.length).toBe(3);
    expect(sql.match(/FROM anon;/g)?.length).toBe(3);
    expect(sql).not.toMatch(/GRANT EXECUTE[^;]*TO (PUBLIC|anon)/);
  });

  it("não altera fn_financial_inconsistencies nem dados financeiros", () => {
    expect(sql).not.toMatch(/fn_financial_inconsistencies/);
    expect(sql).not.toMatch(/\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\b/i);
  });

  it("não usa SELECT * nem subconsulta correlacionada por linha", () => {
    expect(sql).not.toMatch(/SELECT \*/);
  });

  it("possui rollback reversível para as três assinaturas", () => {
    expect(rollback).toContain("get_report_deliveries_billing_status");
    expect(rollback).toContain("get_report_monthly_financial");
    expect(rollback).toContain("get_report_customer_statement");
    expect(rollback).toContain("e.data_entrega"); // restaura o estado anterior fielmente
  });

  it("o forward está rastreado no manifesto de applied-forwards com ledger 679", () => {
    expect(manifest.ledger_versoes).toBe(684);
    const entry = manifest.entries.find((e) => e.version === "20261012000000");
    expect(entry).toBeDefined();
    expect(entry?.applied_to_staging).toBe(true);
    expect(entry?.required_in_promotion_bundle).toBe(true);
    expect(entry?.dados_financeiros_alterados).toBe(false);
  });
});
