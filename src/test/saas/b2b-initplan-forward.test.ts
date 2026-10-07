import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20261007150152_8c86721c-fb42-4d92-ac00-c1e13c9e42c9.sql", "utf8");

describe("B2B initplans focais — contrato estrutural", () => {
  it("altera somente as quatro policies existentes", () => {
    expect(sql.match(/ALTER POLICY/g)).toHaveLength(4);
    expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY|INSERT INTO|UPDATE public|DELETE FROM/);
    expect(sql).toContain("has_role((SELECT auth.uid())");
  });
  it("preserva total, estados, conversão e cinco preços brutos", () => {
    expect(sql).toContain("total_cheio=0 AND status IN ('rascunho','enviada_gestor')");
    expect(sql).toContain("converted_order_id IS NULL AND converted_by IS NULL AND converted_at IS NULL");
    for (const field of ["valor_unitario_cheio", "subtotal", "preco_tabela_snapshot", "preco_unitario", "desconto_percentual"]) {
      expect(sql).toContain(`coalesce(${field},0)=0`);
    }
    expect(sql.match(/WITH CHECK/g)).toHaveLength(2);
  });
});