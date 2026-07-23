import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = resolve(
  __dirname,
  "../../../supabase/migrations/20260802000000_fiscal_invoice_items_state_guard.sql",
);
const SUBSTITUTION_SRC = resolve(
  __dirname,
  "../../../supabase/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql",
);

const ALLOWED = ["DRAFT", "VALIDATING", "READY", "REJECTED", "ERROR"] as const;
const BLOCKED = [
  "LEGACY_RECORDED",
  "QUEUED",
  "PROCESSING",
  "AUTHORIZED",
  "CANCEL_REQUESTED",
  "CANCELED",
  "SUBSTITUTED",
] as const;
const OPERATIONS = ["INSERT", "UPDATE", "DELETE"] as const;

const sql = readFileSync(MIGRATION, "utf8");
const substitution = readFileSync(SUBSTITUTION_SRC, "utf8");

describe("fiscal_invoice_items state guard (20260802000000)", () => {
  it("declara trigger BEFORE INSERT OR UPDATE OR DELETE em fiscal_invoice_items", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER fiscal_invoice_items_state_guard_trg\s+BEFORE INSERT OR UPDATE OR DELETE ON public\.fiscal_invoice_items\s+FOR EACH ROW EXECUTE FUNCTION public\.fiscal_invoice_items_state_guard\(\)/,
    );
    expect(sql).toMatch(
      /DROP TRIGGER IF EXISTS fiscal_invoice_items_state_guard_trg\s+ON public\.fiscal_invoice_items;/,
    );
  });

  it("resolve pai por NEW/OLD conforme TG_OP e trava linha com FOR UPDATE", () => {
    expect(sql).toMatch(/TG_OP\s*=\s*'DELETE'/);
    expect(sql).toMatch(/v_parent_id\s*:=\s*OLD\.fiscal_invoice_id/);
    expect(sql).toMatch(/v_parent_id\s*:=\s*NEW\.fiscal_invoice_id/);
    expect(sql).toMatch(
      /FROM public\.fiscal_invoices[\s\S]*?WHERE id = v_parent_id[\s\S]*?FOR UPDATE/,
    );
  });

  it.each(OPERATIONS)("cobre a operacao %s no trigger", (op) => {
    // basta que o BEFORE cubra INSERT/UPDATE/DELETE via a mesma trigger
    expect(sql).toContain(op);
  });

  it.each(ALLOWED)("permite mutacao no estado %s (whitelist canonica)", (state) => {
    expect(sql).toContain(`'${state}'`);
  });

  it("whitelist estrita — nao contempla estados terminais/intermediarios bloqueados", () => {
    const whitelist = sql.match(
      /v_status NOT IN \(([^)]*)\)/,
    );
    expect(whitelist, "whitelist NOT IN nao encontrada").toBeTruthy();
    const list = whitelist![1];
    for (const state of ALLOWED) expect(list).toContain(`'${state}'`);
    for (const state of BLOCKED) expect(list).not.toContain(`'${state}'`);
  });

  it("bloqueia estado NULL explicitamente antes do NOT IN", () => {
    expect(sql).toMatch(/v_status IS NULL\s*OR v_status NOT IN/);
  });

  it("levanta P0002 para pai inexistente e P0001 para violacao de estado", () => {
    expect(sql).toMatch(/nota fiscal pai nao encontrada[\s\S]*?ERRCODE = 'P0002'/);
    expect(sql).toMatch(/itens fiscais so podem ser alterados[\s\S]*?ERRCODE = 'P0001'/);
    expect(sql).toMatch(/item fiscal sem nota associada[\s\S]*?ERRCODE = 'P0001'/);
  });

  it("mensagens de erro em pt-BR e sem dados sensiveis (sem UUID/ID literal, sem SELECT *)", () => {
    const raises = sql.match(/RAISE EXCEPTION[\s\S]*?USING ERRCODE = '[^']+'/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(3);
    for (const r of raises) {
      expect(r).toMatch(/Operacao bloqueada/);
      expect(r).not.toMatch(/%|v_parent_id|v_status|OLD\.|NEW\./);
    }
  });

  it("nao altera RLS, grants de tabela, audit trigger nem faz backfill", () => {
    const code = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/\bCREATE POLICY\b|\bALTER POLICY\b|\bDROP POLICY\b/);
    expect(code).not.toMatch(/\bENABLE ROW LEVEL SECURITY\b|\bDISABLE ROW LEVEL SECURITY\b/);
    expect(code).not.toMatch(/\bGRANT\b[^;]*ON TABLE/);
    expect(code).not.toMatch(/fiscal_audit_trigger|fiscal_audit_log/);
    expect(code).not.toMatch(/\bUPDATE public\.fiscal_invoice_items\b/);
    expect(code).not.toMatch(/\bDELETE FROM public\.fiscal_invoice_items\b/);
    expect(code).not.toMatch(/\bINSERT INTO public\.fiscal_invoice_items\b/);
  });

  it("funcao com SECURITY INVOKER, search_path fixo e REVOKE de PUBLIC", () => {
    expect(sql).toMatch(/SECURITY INVOKER/);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.fiscal_invoice_items_state_guard\(\) FROM PUBLIC/,
    );
  });

  it("compatibilidade: rpc_fiscal_draft_save so muta itens apos garantir pai em DRAFT", () => {
    // guarda de estado do pai antes do DELETE+INSERT de itens
    expect(substitution).toMatch(
      /IF v_row\.status <> 'DRAFT' THEN\s+RAISE EXCEPTION 'invoice_not_editable'/,
    );
    // sequencia canonica: DELETE FROM fiscal_invoice_items ... depois INSERT
    const draftBlock = substitution.slice(
      substitution.indexOf("invoice_not_editable"),
    );
    expect(draftBlock).toMatch(
      /DELETE FROM public\.fiscal_invoice_items WHERE fiscal_invoice_id = v_new_id;[\s\S]*?INSERT INTO public\.fiscal_invoice_items/,
    );
    // DRAFT esta na whitelist da trigger — compatibilidade textual garantida
    const whitelist = sql.match(/v_status NOT IN \(([^)]*)\)/)![1];
    expect(whitelist).toContain("'DRAFT'");
  });
});
