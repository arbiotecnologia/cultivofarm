import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION_PATH =
  "supabase/migrations/20260729000000_fiscal_financial_documents_no_hard_delete.sql";
const PANEL_PATH = "src/components/financeiro/DocumentosPanel.tsx";

describe("RLS financial_documents — sem hard delete", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("remove as duas policies permissivas FOR ALL antigas", () => {
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS\s+"Financial staff full access"\s+ON public\.financial_documents/,
    );
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS\s+"fd_staff_all"\s+ON public\.financial_documents/,
    );
  });

  it("não introduz nenhuma nova policy FOR ALL", () => {
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*?FOR ALL/i);
  });

  it("cria policies separadas de INSERT e UPDATE restritas ao staff financeiro", () => {
    expect(sql).toMatch(
      /CREATE POLICY\s+"fd_staff_insert"[\s\S]*?FOR INSERT TO authenticated[\s\S]*?WITH CHECK\s*\(\s*public\.is_financial_staff\(auth\.uid\(\)\)\s*\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY\s+"fd_staff_update"[\s\S]*?FOR UPDATE TO authenticated[\s\S]*?USING\s*\(\s*public\.is_financial_staff\(auth\.uid\(\)\)\s*\)[\s\S]*?WITH CHECK\s*\(\s*public\.is_financial_staff\(auth\.uid\(\)\)\s*\)/,
    );
  });

  it("mantém DELETE=false via fd_no_hard_delete", () => {
    expect(sql).toMatch(
      /CREATE POLICY\s+"fd_no_hard_delete"[\s\S]*?FOR DELETE TO authenticated USING \(false\)/,
    );
  });

  it("revoga DELETE em financial_documents do papel authenticated", () => {
    expect(sql).toMatch(
      /REVOKE DELETE ON public\.financial_documents FROM authenticated/,
    );
  });

  it("DocumentosPanel usa soft delete via UPDATE de deleted_at, nunca .delete()", () => {
    const panel = readFileSync(PANEL_PATH, "utf8");
    expect(panel).toMatch(/from\(\s*["']financial_documents["']\s*\)[\s\S]*?\.update\(\s*\{[\s\S]*?deleted_at:/);
    // Nenhuma chamada .delete() sobre financial_documents no painel
    expect(panel).not.toMatch(/from\(\s*["']financial_documents["']\s*\)[\s\S]{0,200}\.delete\(/);
  });
});
