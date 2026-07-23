import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION_PATH =
  "supabase/migrations/20260728000000_fiscal_rls_perfis_split_write.sql";

const TABLES = [
  "product_fiscal_profiles",
  "service_fiscal_profiles",
  "customer_fiscal_profiles",
] as const;

describe("RLS perfis fiscais — split INSERT/UPDATE + DELETE=false", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("remove policies permissivas FOR ALL das três tabelas", () => {
    for (const t of TABLES) {
      expect(sql).toMatch(
        new RegExp(`DROP POLICY IF EXISTS %I ON public\\.%I`),
      );
      // Nenhuma criação FOR ALL deve permanecer na migration
      expect(sql).not.toMatch(new RegExp(`FOR ALL`, "i"));
      // Referência explícita à policy _write sendo removida
      expect(sql).toContain(`'_write'`);
      void t;
    }
  });

  it("cria policies separadas de INSERT e UPDATE via loop", () => {
    expect(sql).toMatch(/FOR INSERT TO authenticated/);
    expect(sql).toMatch(/FOR UPDATE TO authenticated/);
    expect(sql).toContain("'_insert'");
    expect(sql).toContain("'_update'");
    // Restrição a administrador/financeiro em ambos os ramos
    expect(
      (sql.match(/has_role\(auth\.uid\(\),''administrador''\)/g) || []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      (sql.match(/has_role\(auth\.uid\(\),''financeiro''\)/g) || []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("preserva policy READ para admin/gestor/financeiro", () => {
    expect(sql).toMatch(/FOR SELECT TO authenticated/);
    expect(sql).toContain("'_read'");
    expect(sql).toMatch(/has_role\(auth\.uid\(\),''gestor''\)/);
  });

  it("mantém DELETE=false e REVOKE DELETE FROM authenticated", () => {
    expect(sql).toMatch(/FOR DELETE TO authenticated USING \(false\)/);
    expect(sql).toMatch(/REVOKE DELETE ON public\.%I FROM authenticated/);
    expect(sql).toContain("'_delete'");
  });

  it("percorre exatamente as três tabelas de perfis fiscais", () => {
    for (const t of TABLES) {
      expect(sql).toContain(`'${t}'`);
    }
  });

  it("não cria RPC de DELETE nesta fase", () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION[\s\S]*DELETE FROM/i);
  });
});
