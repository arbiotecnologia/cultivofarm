/**
 * Fase Fiscal 3.20.2 — Auditoria estática da migration RPC
 * `supabase/migrations/20260805000000_fiscal_rpc_associate_microorganism.sql`.
 *
 * Garante:
 *   - Fonte executável ÚNICA em supabase/migrations/.
 *   - restoration/ mantém apenas stub documental sem SQL executável.
 *   - RPC SECURITY DEFINER com search_path seguro.
 *   - Autoriza somente administrador e financeiro.
 *   - REVOKE public/anon + GRANT EXECUTE authenticated.
 *   - Atualiza SOMENTE microrganismos.product_id; sem DELETE/TRUNCATE.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CANONICAL_PATH =
  "supabase/migrations/20260805000000_fiscal_rpc_associate_microorganism.sql";
const RESTORATION_PATH =
  "restoration/20260805000000_fiscal_rpc_associate_microorganism.sql";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function stripComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

describe("Fase 3.20.2 — migration RPC associação (estática)", () => {
  it("existe em supabase/migrations/ (fonte executável canônica)", () => {
    expect(existsSync(join(process.cwd(), CANONICAL_PATH))).toBe(true);
  });

  it("restoration/ contém APENAS stub documental — nenhum SQL executável", () => {
    expect(existsSync(join(process.cwd(), RESTORATION_PATH))).toBe(true);
    const stub = stripComments(read(RESTORATION_PATH));
    expect(stub).not.toMatch(/\bBEGIN\b/i);
    expect(stub).not.toMatch(/\bCOMMIT\b/i);
    expect(stub).not.toMatch(/\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i);
    expect(stub).not.toMatch(/\bALTER\b/i);
    expect(stub).not.toMatch(/\bGRANT\b/i);
    expect(stub).not.toMatch(/\bREVOKE\b/i);
    // Deve apontar para a fonte canônica.
    expect(read(RESTORATION_PATH)).toMatch(
      /supabase\/migrations\/20260805000000_fiscal_rpc_associate_microorganism\.sql/,
    );
  });

  it("fonte executável é ÚNICA (nenhum outro caminho contém a migration)", () => {
    // Somente o caminho canônico pode conter o corpo executável.
    const other = RESTORATION_PATH;
    if (existsSync(join(process.cwd(), other))) {
      const otherSql = stripComments(read(other));
      expect(otherSql).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION[\s\S]+rpc_associate_microorganism_fiscal_product/i);
    }
    const canonical = read(CANONICAL_PATH);
    expect(canonical).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.rpc_associate_microorganism_fiscal_product/i,
    );
  });

  const sql = read(CANONICAL_PATH);

  it("é SECURITY DEFINER com search_path seguro (public, pg_temp)", () => {
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(/SET\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  });

  it("autoriza SOMENTE administrador e financeiro", () => {
    expect(sql).toMatch(/has_role\(\s*v_uid\s*,\s*'administrador'/);
    expect(sql).toMatch(/has_role\(\s*v_uid\s*,\s*'financeiro'/);
    const stripped = stripComments(sql);
    expect(stripped).not.toMatch(/'tecnico_agronomo'/);
    expect(stripped).not.toMatch(/'gestor'/);
    expect(stripped).not.toMatch(/'consultor'/);
  });

  it("REVOKE de public/anon e GRANT EXECUTE apenas para authenticated", () => {
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION[\s\S]+FROM\s+PUBLIC/i);
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION[\s\S]+FROM\s+anon/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]+TO\s+authenticated/i);
  });

  it("atualiza SOMENTE microrganismos.product_id; sem DELETE/TRUNCATE/DROP", () => {
    const stripped = stripComments(sql);
    expect(stripped).toMatch(/UPDATE\s+public\.microrganismos[\s\S]+SET\s+product_id\s*=\s*p_product_id/i);
    expect(stripped).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(stripped).not.toMatch(/\bTRUNCATE\b/i);
    expect(stripped).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(stripped).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(stripped).not.toMatch(/\bALTER\s+POLICY\b/i);
  });
});
