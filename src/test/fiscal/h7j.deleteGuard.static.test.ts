/**
 * FASE H7j — Contrato estático do guard de exclusão do documento fiscal.
 *
 * Finding H7-120 (P1): documento fiscal com trilha (autorizado, cancelado,
 * numerado, com eventos/transmissões) podia ser excluído fisicamente.
 * Estes testes travam o artefato de correção e a higiene de binding, sem
 * tocar no banco.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const APPLY = "restoration/homologacao-h7/89-h7j-delete-guard-apply.sql";
const ROLLBACK = "restoration/homologacao-h7/90-h7j-delete-guard-rollback.sql";
const POSTCHECK = "restoration/homologacao-h7/91-h7j-postcheck.sql";
const RUNNER = "restoration/homologacao-h7/92-h7j-runner.sh";

describe("H7j — guard de exclusão fiscal", () => {
  it("apply cria trigger BEFORE DELETE com código de erro estável", () => {
    const sql = read(APPLY);
    expect(sql).toMatch(/BEFORE DELETE ON public\.fiscal_invoices/);
    expect(sql).toContain("FISCAL_DOCUMENT_DELETE_FORBIDDEN");
    expect(sql).toMatch(/CREATE TRIGGER trg_h7j_fiscal_invoice_delete_guard/);
  });

  it("guard é SECURITY DEFINER com search_path explícito e menor privilégio", () => {
    const sql = read(APPLY);
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.fn_h7j_fiscal_invoice_delete_guard\(\) FROM anon/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.fn_h7j_fiscal_invoice_delete_guard\(\) FROM authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_h7j_fiscal_invoice_delete_guard\(\) TO postgres, service_role/);
  });

  it("revoga TRUNCATE de authenticated nas tabelas do documento fiscal", () => {
    const sql = read(APPLY);
    expect(sql).toContain("REVOKE TRUNCATE ON public.fiscal_invoices FROM authenticated");
    expect(sql).toContain("REVOKE TRUNCATE ON public.fiscal_invoice_items FROM authenticated");
  });

  it("possui rollback, postcheck e runner fail-fast com guard de staging", () => {
    expect(read(ROLLBACK)).toContain("DROP TRIGGER IF EXISTS trg_h7j_fiscal_invoice_delete_guard");
    const post = read(POSTCHECK);
    for (const t of ["H7J-1", "H7J-2", "H7J-3", "H7J-4", "H7J-5", "H7J-6", "H7J-7"]) {
      expect(post).toContain(t);
    }
    expect(post.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    const runner = read(RUNNER);
    expect(runner).toContain("guard-staging.sh");
    expect(runner).toContain("set -euo pipefail");
  });

  it("mantém rascunho descartável (sem regressão de fluxo)", () => {
    expect(read(POSTCHECK)).toContain("rascunho sem trilha descartavel");
  });

  it("não referencia o projeto de produção em nenhum artefato H7j", () => {
    for (const f of [APPLY, ROLLBACK, POSTCHECK, RUNNER]) {
      expect(read(f)).not.toContain("navfzbwgwzruipouyfnk");
    }
  });

  it("binding efetivo do cliente permanece no CultivoFarm autorizado", () => {
    // `.env` é regenerado pela plataforma; a verdade de runtime é o client.ts.
    const client = read("src/integrations/supabase/client.ts");
    expect(client).toContain("swzpzcwiasxmjutrmvkm");
    expect(client).not.toContain("navfzbwgwzruipouyfnk");
  });

});
