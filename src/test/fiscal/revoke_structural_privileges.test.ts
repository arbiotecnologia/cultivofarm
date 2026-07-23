import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION_PATH =
  "supabase/migrations/20260731000000_fiscal_revoke_structural_privileges.sql";
const FASE2_PATH =
  "supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql";

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

describe("Hardening estrutural fiscal — 20260731000000", () => {
  it("lista exatamente as 10 tabelas fiscais alvo dentro do array canônico", () => {
    for (const t of TARGETS) {
      expect(sql).toMatch(new RegExp(`'${t}'`));
    }
    // Array de tabelas canônico
    expect(sql).toMatch(/fiscal_tables\s+text\[\]\s*:=\s*ARRAY\[/);
  });

  it("revoga TRUNCATE, REFERENCES e TRIGGER de authenticated e anon via loop dinâmico", () => {
    expect(sql).toMatch(
      /REVOKE TRUNCATE, REFERENCES, TRIGGER ON public\.%I FROM authenticated/,
    );
    expect(sql).toMatch(
      /REVOKE TRUNCATE, REFERENCES, TRIGGER ON public\.%I FROM anon/,
    );
    expect(sql).toMatch(/FOREACH\s+t\s+IN ARRAY\s+fiscal_tables/i);
  });

  it("aplica hardening extra em fiscal_idempotency_keys revogando INSERT/UPDATE/DELETE de authenticated e anon", () => {
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON public\.fiscal_idempotency_keys FROM authenticated/,
    );
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON public\.fiscal_idempotency_keys FROM anon/,
    );
  });

  it("não concede nenhum privilégio estrutural (TRUNCATE/REFERENCES/TRIGGER) nem devolve DML revogado", () => {
    expect(sql).not.toMatch(/GRANT\s+[^;]*\b(TRUNCATE|REFERENCES|TRIGGER)\b/i);
    // Nenhum GRANT INSERT/UPDATE/DELETE reintroduzido para authenticated/anon na idempotência
    expect(sql).not.toMatch(
      /GRANT[^;]*ON public\.fiscal_idempotency_keys[^;]*TO\s+(authenticated|anon)/i,
    );
  });

  it("não altera policies, RLS, funções, service_role nem SELECT de authenticated", () => {
    expect(sql).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY|ALTER\s+POLICY/i);
    expect(sql).not.toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY|DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|DROP\s+FUNCTION/i);
    expect(sql).not.toMatch(/\b(REVOKE|GRANT)\b[^;]*service_role/i);
    // Não revoga SELECT em nenhum lugar (SELECT administrativo preservado)
    expect(sql).not.toMatch(/REVOKE[^;]*\bSELECT\b/i);
  });

  it("preserva grants DML/SELECT legítimos declarados em 20260721000000_fiscal_fase2_fundacao.sql", () => {
    const fase2 = readFileSync(FASE2_PATH, "utf8");
    // Confirma que os grants base ainda existem no histórico canônico
    expect(fase2).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.company_fiscal_settings TO authenticated/,
    );
    expect(fase2).toMatch(
      /GRANT SELECT ON public\.fiscal_idempotency_keys TO authenticated/,
    );
    // E que a nova migration não os desfaz
    expect(sql).not.toMatch(
      /REVOKE[^;]*\bSELECT\b[^;]*ON public\.company_fiscal_settings/i,
    );
    expect(sql).not.toMatch(
      /REVOKE[^;]*\bSELECT\b[^;]*ON public\.fiscal_idempotency_keys/i,
    );
  });

  it("é aditiva/idempotente: apenas REVOKE, sem CREATE/ALTER/DROP TABLE ou dados", () => {
    expect(sql).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE\s+TABLE/i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b|\bUPDATE\s+public\.|\bDELETE\s+FROM\b/i);
  });
});
