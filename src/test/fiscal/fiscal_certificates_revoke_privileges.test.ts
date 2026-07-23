/**
 * Fase H2 — Migration 20260803000000 (entregue em restoration/,
 * pendente de promoção autorizada a supabase/migrations/).
 * Prova estaticamente a revogação de privilégios em fiscal_certificates.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const CANONICAL =
  "supabase/migrations/20260803000000_fiscal_certificates_revoke_anon_and_structural.sql";
const STAGED =
  "restoration/20260803000000_fiscal_certificates_revoke_anon_and_structural.sql";
const MIGRATION_PATH = existsSync(CANONICAL) ? CANONICAL : STAGED;
const sql = readFileSync(MIGRATION_PATH, "utf8");
const sqlNoComments = sql.replace(/--[^\n]*/g, "");

describe("fiscal_certificates — revoke anon + estrutural authenticated (20260803000000)", () => {
  it("revoga TODOS os privilégios de anon em fiscal_certificates", () => {
    expect(sqlNoComments).toMatch(
      /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+TABLE\s+public\.fiscal_certificates\s+FROM\s+anon/i,
    );
  });

  it("revoga TRUNCATE/REFERENCES/TRIGGER e INSERT/UPDATE/DELETE de authenticated", () => {
    const m = sqlNoComments.match(
      /REVOKE\s+([A-Z, ]+?)\s+ON\s+TABLE\s+public\.fiscal_certificates\s+FROM\s+authenticated/i,
    );
    expect(m).not.toBeNull();
    const privs = (m![1] || "").toUpperCase();
    for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      expect(privs).toContain(p);
    }
    // Não pode revogar SELECT de authenticated — leitura via RLS fc_read_metadata é legítima.
    expect(privs).not.toContain("SELECT");
    expect(privs).not.toContain("ALL");
  });

  it("é aditiva: sem GRANT, sem policies, sem RLS toggle, sem função/trigger, sem DML", () => {
    expect(sqlNoComments).not.toMatch(/\bGRANT\b/i);
    expect(sqlNoComments).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY|ALTER\s+POLICY/i);
    expect(sqlNoComments).not.toMatch(
      /ENABLE\s+ROW\s+LEVEL\s+SECURITY|DISABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
    expect(sqlNoComments).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|DROP\s+FUNCTION|CREATE\s+TRIGGER|DROP\s+TRIGGER/i,
    );
    expect(sqlNoComments).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE\s+TABLE/i);
    expect(sqlNoComments).not.toMatch(/\bINSERT\s+INTO\b|\bUPDATE\s+public\.|\bDELETE\s+FROM\b/i);
  });

  it("não menciona service_role (mantido intacto)", () => {
    expect(sqlNoComments).not.toMatch(/\bservice_role\b/i);
  });

  it("alveja exclusivamente public.fiscal_certificates", () => {
    const targets = sqlNoComments.match(/ON\s+TABLE\s+public\.([a-z_]+)/gi) ?? [];
    expect(targets.length).toBeGreaterThanOrEqual(2);
    for (const t of targets) {
      expect(t.toLowerCase()).toContain("public.fiscal_certificates");
    }
  });
});
