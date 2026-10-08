import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EstoqueMotorError, mensagemErroEstoque } from "@/lib/estoque/motorEstoque";
const sql = readFileSync("supabase/migrations/20261008033250_99e7db4f-2aa4-455d-a027-e0703d367047.sql", "utf8");
const proof = readFileSync("scripts/rbac-audit/stock-numeric-hardening-proof.sql", "utf8");
describe("P1 numeric — estrutura, não browser", () => {
  it("nega especiais e não positivos nos dois contratos", () => {
    for (const token of ["p_quantidade::text IN ('NaN','Infinity','-Infinity')", "p_qty::text IN ('NaN','Infinity','-Infinity')", "p_quantidade <= 0", "p_qty <= 0"])
      expect(sql).toContain(token);
  });
  it("autoriza antes do gate e instala antes do item/replay", () => {
    expect(sql.indexOf("PERFORM platform_private.stock_motor_actor(p_acao)")).toBeLessThan(sql.indexOf("IF (p_quantidade IS NULL"));
    expect(sql).toContain("gate||'  PERFORM platform_private.stock_motor_item");
    expect(sql).toContain("PERFORM platform_private.stock_motor_actor('reserva')");
  });
  it("preserva estorno NULL e default negando sentido arbitrário", () => {
    for (const token of ["p_acao IS DISTINCT FROM 'estorno_expedicao'", "p_quantidade IS NOT NULL AND", "p_payload->>'sentido' IS NOT NULL", "NOT IN ('entrada','saida')"])
      expect(sql).toContain(token);
  });
  it("é idempotente e mantém ACL fechado", () => {
    expect(sql).toContain("STOCK_NUMERIC_MOTOR_BASELINE_CHANGED");
    expect(sql).toContain("IF position('p_qty::text");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated");
    expect(sql).not.toMatch(/GRANT .* TO authenticated|DROP POLICY|UPDATE public\./i);
  });
  it("prova 59 negativas, pré-forja, replay e rollback", () => {
    for (const token of ["numeric_denied<>59", "INVALID_NUMERIC_ACCEPTED", "RESERVE_INVALID_NUMERIC_ACCEPTED", "FORGED_CONTEXT_LEAK", "SPLIT_REPLAY_FAILED", "'estorno_expedicao',target,NULL", "STOCK_NUMERIC_PROOF_ROLLBACK"])
      expect(proof).toContain(token);
    expect(proof).not.toMatch(/\bCOMMIT\b|DISABLE TRIGGER|session_replication_role/i);
  });
  it("traduz o código estável", () => {
    const err = new EstoqueMotorError("ESTQ_QUANTIDADE_INVALIDA: valor inválido");
    expect(err.codigo).toBe("ESTQ_QUANTIDADE_INVALIDA");
    expect(err.isPermissao).toBe(false);
    expect(mensagemErroEstoque(err)).toBe("Informe uma quantidade finita e maior que zero.");
  });
});