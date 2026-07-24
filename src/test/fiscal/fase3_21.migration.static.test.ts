/**
 * Fase Fiscal 3.21 — Auditoria estática da migration canônica.
 *
 * Fonte canônica ÚNICA (aditiva, transacional):
 *   supabase/migrations/20260806000000_fiscal_microorganism_profiles.sql
 *
 * Espelho documental (SEM SQL executável):
 *   restoration/migrations/20260806000000_fiscal_microorganism_profiles.sql
 *
 * Regras verificadas:
 *  - Existe exatamente UMA cópia executável (em supabase/migrations/).
 *  - restoration/ contém apenas stub documental — sem BEGIN/CREATE/ALTER/
 *    GRANT/REVOKE/COMMIT.
 *  - Aditiva: sem DROP TABLE/COLUMN, sem TRUNCATE, sem DELETE.
 *  - Contém CREATE TABLE microorganism_fiscal_profiles + FK para
 *    public.microrganismos + is_active + índice único parcial.
 *  - Contém VIEW v_microorganism_fiscal_readiness com security_invoker.
 *  - RLS habilitado + policies restringindo escrita a
 *    administrador/financeiro (sem tecnico_agronomo).
 *  - GRANTs explícitos para authenticated/service_role.
 */
import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CANON = path.resolve(
  process.cwd(),
  "supabase/migrations/20260806000000_fiscal_microorganism_profiles.sql",
);
const STUB = path.resolve(
  process.cwd(),
  "restoration/migrations/20260806000000_fiscal_microorganism_profiles.sql",
);

const sql = fs.readFileSync(CANON, "utf-8");

describe("Fase 3.21 — migration canônica microorganism_fiscal_profiles", () => {
  test("canônica existe em supabase/migrations/", () => {
    expect(fs.existsSync(CANON)).toBe(true);
  });

  test("aditiva: sem operações destrutivas", () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  test("transacional", () => {
    expect(sql).toMatch(/\bBEGIN;/);
    expect(sql).toMatch(/\bCOMMIT;/);
  });

  test("tabela + FK + índice único parcial + trigger", () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.microorganism_fiscal_profiles/i);
    expect(sql).toMatch(/REFERENCES\s+public\.microrganismos\(id\)/i);
    expect(sql).toMatch(/UNIQUE\s+INDEX[\s\S]+microorganism_id[\s\S]+WHERE\s+is_active\s*=\s*true/i);
    expect(sql).toMatch(/set_updated_at/);
  });

  test("view readiness com security_invoker", () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.v_microorganism_fiscal_readiness/i);
    expect(sql).toMatch(/security_invoker\s*=\s*true/i);
  });

  test("RLS ativo e policies restringem escrita a administrador/financeiro (sem tecnico_agronomo)", () => {
    expect(sql).toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    const writePol = sql.match(/microorganism_fiscal_profiles_write[\s\S]+?WITH\s+CHECK[^;]+;/i);
    expect(writePol).not.toBeNull();
    expect(writePol![0]).toMatch(/'administrador'/);
    expect(writePol![0]).toMatch(/'financeiro'/);
    expect(writePol![0]).not.toMatch(/'tecnico_agronomo'/);
    expect(writePol![0]).not.toMatch(/'gestor'/);
  });

  test("GRANTs explícitos", () => {
    expect(sql).toMatch(/GRANT[^;]+ON\s+public\.microorganism_fiscal_profiles\s+TO\s+authenticated/i);
    expect(sql).toMatch(/GRANT\s+ALL\s+ON\s+public\.microorganism_fiscal_profiles\s+TO\s+service_role/i);
    expect(sql).toMatch(/GRANT\s+SELECT\s+ON\s+public\.v_microorganism_fiscal_readiness\s+TO\s+authenticated/i);
  });

  test("fonte executável única: restoration/ é stub documental sem SQL executável", () => {
    expect(fs.existsSync(STUB)).toBe(true);
    const raw = fs.readFileSync(STUB, "utf-8");
    // Remove linhas de comentário SQL antes de validar ausência de statements.
    const body = raw
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(body).not.toMatch(/\bBEGIN\s*;/i);
    expect(body).not.toMatch(/\bCOMMIT\s*;/i);
    expect(body).not.toMatch(/\bCREATE\s+(TABLE|VIEW|POLICY|INDEX|TRIGGER|OR\s+REPLACE)/i);
    expect(body).not.toMatch(/\bALTER\s+(TABLE|VIEW)/i);
    expect(body).not.toMatch(/\bGRANT\b/i);
    expect(body).not.toMatch(/\bREVOKE\b/i);
    // Aponta para o caminho canônico
    expect(raw).toMatch(/supabase\/migrations\/20260806000000_fiscal_microorganism_profiles\.sql/);
  });
});
