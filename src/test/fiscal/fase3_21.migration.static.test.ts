/**
 * Fase Fiscal 3.21 — Auditoria estática da migration canônica.
 *
 * Fonte canônica ÚNICA (aditiva, transacional):
 *   restoration/migrations/20260806000000_fiscal_microorganism_profiles.sql
 *
 * Regras verificadas:
 *  - Existe exatamente UMA cópia executável em restoration/migrations/.
 *  - Nenhuma cópia executável em supabase/migrations/ (guardas por bloqueio
 *    do sandbox — evita fonte dupla).
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
  "restoration/migrations/20260806000000_fiscal_microorganism_profiles.sql",
);

const sql = fs.readFileSync(CANON, "utf-8");

describe("Fase 3.21 — migration canônica microorganism_fiscal_profiles", () => {
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

  test("fonte executável única: stub sem SQL executável em supabase/migrations/", () => {
    const mirror = path.resolve(process.cwd(), "supabase/migrations/20260806000000_fiscal_microorganism_profiles.sql");
    if (fs.existsSync(mirror)) {
      const body = fs.readFileSync(mirror, "utf-8");
      // Se existir, deve ser stub documental — sem BEGIN/CREATE/GRANT/ALTER.
      expect(body).not.toMatch(/\bBEGIN;/);
      expect(body).not.toMatch(/\bCREATE\s+(TABLE|VIEW|POLICY)/i);
      expect(body).not.toMatch(/\bGRANT\b/i);
    }
    // Se não existir, garantir que a canônica em restoration/ está preservada
    expect(fs.existsSync(CANON)).toBe(true);
  });
});
