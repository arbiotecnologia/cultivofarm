import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION_PATH =
  "supabase/migrations/20260730000000_fiscal_financial_documents_soft_delete_rpc.sql";
const PANEL_PATH = "src/components/financeiro/DocumentosPanel.tsx";
const NO_HARD_DELETE_PATH =
  "supabase/migrations/20260729000000_fiscal_financial_documents_no_hard_delete.sql";

const sql = readFileSync(MIGRATION_PATH, "utf8");

describe("RPC rpc_financial_document_soft_delete — H2 correção soft delete", () => {
  it("declara assinatura canônica (uuid, text) RETURNS uuid SECURITY DEFINER", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION\s+public\.rpc_financial_document_soft_delete\(\s*p_document_id\s+uuid\s*,\s*p_reason\s+text\s*\)\s*RETURNS\s+uuid/i,
    );
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(/SET\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
    expect(sql).toMatch(/LANGUAGE\s+plpgsql/i);
  });

  it("rejeita sessão anônima e usuário sem papel financeiro (42501)", () => {
    expect(sql).toMatch(/v_uid\s+uuid\s*:=\s*auth\.uid\(\)/);
    expect(sql).toMatch(
      /IF v_uid IS NULL THEN[\s\S]*?RAISE EXCEPTION[\s\S]*?USING ERRCODE = '42501'/,
    );
    expect(sql).toMatch(
      /IF NOT public\.is_financial_staff\(v_uid\) THEN[\s\S]*?USING ERRCODE = '42501'/,
    );
  });

  it("exige motivo btrim não vazio com limite de tamanho seguro", () => {
    expect(sql).toMatch(/btrim\(\s*coalesce\(\s*p_reason\s*,\s*''\s*\)\s*\)/);
    expect(sql).toMatch(/length\(v_reason\)\s*=\s*0/);
    expect(sql).toMatch(/length\(v_reason\)\s*>\s*500/);
  });

  it("preenche server-side deleted_at/by/delete_reason e ignora quaisquer valores do cliente", () => {
    // A assinatura só aceita p_document_id e p_reason; nenhum parâmetro de deleted_by/at.
    expect(sql).not.toMatch(/p_deleted_(by|at)/i);
    expect(sql).toMatch(
      /UPDATE\s+public\.financial_documents\s+SET\s+deleted_at\s*=\s*now\(\)\s*,\s*deleted_by\s*=\s*v_uid\s*,\s*delete_reason\s*=\s*v_reason/,
    );
  });

  it("cobre inexistente (P0002) e segunda exclusão (40001)", () => {
    expect(sql).toMatch(/USING ERRCODE = 'P0002'/);
    expect(sql).toMatch(/USING ERRCODE = '40001'/);
    expect(sql).toMatch(/WHERE id = p_document_id\s+AND deleted_at IS NULL/);
  });

  it("protege contra corrida concorrente com SELECT ... FOR UPDATE e checagem estrita de ROW_COUNT", () => {
    // Trava a linha antes de validar deleted_at para serializar chamadas simultâneas.
    expect(sql).toMatch(
      /SELECT\s*\(\s*deleted_at IS NULL\s*\)[\s\S]*?FROM\s+public\.financial_documents[\s\S]*?WHERE\s+id\s*=\s*p_document_id[\s\S]*?FOR\s+UPDATE/i,
    );
    // Usa NOT FOUND (do SELECT travado) para P0002 em vez de flag manual sujeita a corrida.
    expect(sql).toMatch(/IF NOT FOUND THEN[\s\S]*?USING ERRCODE = 'P0002'/);
    // Confere ROW_COUNT do UPDATE e converte 0 linhas em 40001 (conflito), nunca sucesso silencioso.
    expect(sql).toMatch(/GET DIAGNOSTICS\s+v_rows\s*=\s*ROW_COUNT/i);
    expect(sql).toMatch(/IF v_rows\s*<>\s*1 THEN[\s\S]*?USING ERRCODE = '40001'/);
  });


  it("REVOKE ALL de PUBLIC/anon e GRANT EXECUTE somente authenticated", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.rpc_financial_document_soft_delete\(uuid, text\) FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.rpc_financial_document_soft_delete\(uuid, text\) FROM anon/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.rpc_financial_document_soft_delete\(uuid, text\) TO authenticated/,
    );
  });

  it("não cria nenhuma policy FOR ALL nem concede DELETE físico", () => {
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*?FOR ALL/i);
    expect(sql).not.toMatch(/GRANT\s+DELETE/i);
  });

  it("preserva REVOKE DELETE de authenticated instituído em 20260729000000", () => {
    const prev = readFileSync(NO_HARD_DELETE_PATH, "utf8");
    expect(prev).toMatch(
      /REVOKE DELETE ON public\.financial_documents FROM authenticated/,
    );
    // A nova migration não devolve DELETE ao authenticated
    expect(sql).not.toMatch(/GRANT DELETE ON public\.financial_documents/i);
  });

  it("DocumentosPanel remove documentos via RPC, nunca via UPDATE direto ou .delete()", () => {
    const panel = readFileSync(PANEL_PATH, "utf8");
    expect(panel).toMatch(/rpc_financial_document_soft_delete/);
    expect(panel).toMatch(/p_document_id\s*:\s*id/);
    expect(panel).toMatch(/p_reason\s*:/);
    expect(panel).not.toMatch(
      /from\(\s*["']financial_documents["']\s*\)[\s\S]{0,300}\.update\(\s*\{[\s\S]*?deleted_at/,
    );
    expect(panel).not.toMatch(
      /from\(\s*["']financial_documents["']\s*\)[\s\S]{0,200}\.delete\(/,
    );
  });
});
