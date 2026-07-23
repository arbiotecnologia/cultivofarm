import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION_PATH =
  "supabase/migrations/20260801000000_fiscal_revoke_anon_table_privileges.sql";

const sql = readFileSync(MIGRATION_PATH, "utf8");

const TARGETS = [
  "company_fiscal_settings",
  "product_fiscal_profiles",
  "service_fiscal_profiles",
  "customer_fiscal_profiles",
  "fiscal_invoices",
  "fiscal_invoice_items",
  "fiscal_events",
  "fiscal_idempotency_keys",
  "fiscal_audit_log",
  "financial_documents",
];

describe("Revoke anon privileges — 20260801000000", () => {
  it("declara exatamente as 10 tabelas fiscais alvo no array canônico", () => {
    for (const t of TARGETS) {
      expect(sql).toMatch(new RegExp(`'${t}'`));
    }
    expect(sql).toMatch(/fiscal_tables\s+text\[\]\s*:=\s*ARRAY\[/);
  });

  it("emite REVOKE ALL PRIVILEGES para anon via loop dinâmico com format('%I')", () => {
    expect(sql).toMatch(/FOREACH\s+t\s+IN ARRAY\s+fiscal_tables/i);
    expect(sql).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM anon/,
    );
  });

  it("não altera authenticated, service_role, policies, RLS nem funções", () => {
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/\bauthenticated\b/i);
    expect(sqlNoComments).not.toMatch(/\bservice_role\b/i);
    expect(sqlNoComments).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY|ALTER\s+POLICY/i);
    expect(sqlNoComments).not.toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY|DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sqlNoComments).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|DROP\s+FUNCTION/i);
  });

  it("é aditiva/idempotente: apenas REVOKE, sem GRANT, DDL de tabela ou DML", () => {
    expect(sql).not.toMatch(/\bGRANT\b/i);
    expect(sql).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE\s+TABLE/i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b|\bUPDATE\s+public\.|\bDELETE\s+FROM\b/i);
  });
});
