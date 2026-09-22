import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-D-L3 (retificação funcional e de escopo ativo) — gate estático do forward
 * `20261010000000`, aplicado exclusivamente em homologação.
 *
 * Ele trava três regressões comprovadas dinamicamente antes da correção:
 *   A) relatórios financeiros referenciando colunas inexistentes (`i.amount`,
 *      `ar.cliente_id`) e falhando com 42703 para chamadores autorizados;
 *   B) `lab_request_replanning` citando o valor `laboratorio`, ausente do enum
 *      `app_role`, o que levantava 22P02 antes de qualquer regra de negócio;
 *   C) resolvedores de vínculo aceitando vínculos inativos, revogados, futuros
 *      ou expirados de `public.user_clientes`.
 */
const ROOT = resolve(__dirname, "../../..");
const FORWARD = resolve(
  ROOT,
  "restoration/homologacao-h9/h9d-forwards/20261010000000_h9dl3r_report_columns_lab_role_active_scope_v1.sql",
);
const ROLLBACK = resolve(
  ROOT,
  "restoration/homologacao-h9/h9d-rollbacks/20261010000000_h9dl3r_report_columns_lab_role_active_scope_v1_rollback.sql",
);
const MANIFEST = resolve(ROOT, "restoration/homologacao-h9/h9c-applied-forwards.json");

const forward = readFileSync(FORWARD, "utf8");
/** Apenas o SQL executável: as linhas de comentário citam propositalmente os defeitos corrigidos. */
const sql = forward
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
const rollback = readFileSync(ROLLBACK, "utf8");
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  ledger_versoes: number;
  entries: { version: string; applied_to_staging: boolean; required_in_promotion_bundle: boolean }[];
};

const RELATORIOS = [
  "get_report_monthly_financial",
  "get_report_payables",
  "get_report_receivables",
  "get_report_nfe_pending",
];
const ESCOPO = ["get_cliente_ids_for_user", "get_cliente_id_for_user", "pode_acessar_recomendacao"];

describe("H9-D-L3R — colunas vivas, enum válido e escopo de vínculo ativo", () => {
  it("é um forward de homologação, sem menção à produção", () => {
    expect(forward).toContain("ikaauvsflpmamgxmkhoq");
    expect(forward).not.toContain("navfzbwgwzruipouyfnk");
    expect(rollback).not.toContain("navfzbwgwzruipouyfnk");
  });

  it("substitui as colunas inexistentes pelas colunas vivas nos quatro relatórios", () => {
    expect(sql).not.toMatch(/\bi\.amount\b/);
    expect(sql).not.toMatch(/\bar\.cliente_id\b/);
    for (const fn of RELATORIOS) expect(forward).toContain(`FUNCTION public.${fn}(`);
    expect(forward).toContain("i.original_amount - COALESCE(i.received_amount,0) - COALESCE(i.discount_amount,0)");
    expect(forward).toContain("i.original_amount - COALESCE(i.paid_amount,0) - COALESCE(i.discount_amount,0)");
    expect(forward).toContain("ar.customer_id");
  });

  it("preserva a guarda financeira em todos os relatórios", () => {
    const guardas = forward.match(/IF NOT is_financial_staff\(auth\.uid\(\)\) THEN RAISE EXCEPTION 'Acesso negado'/g);
    expect(guardas ?? []).toHaveLength(RELATORIOS.length);
  });

  it("remove o valor inexistente do enum sem ampliar privilégios do laboratório", () => {
    expect(sql).not.toContain("'laboratorio'::app_role");
    expect(sql).not.toMatch(/'laboratorio'/);
    for (const papel of ["administrador", "producao", "gestor"]) {
      expect(forward).toContain(`public.has_role(v_uid,'${papel}'::app_role)`);
    }
    expect(forward).not.toContain("'administrativo'::app_role");
  });

  it("exige vínculo ativo, não revogado e vigente nos três resolvedores", () => {
    for (const fn of ESCOPO) expect(forward).toContain(`FUNCTION public.${fn}(`);
    const ativos = forward.match(/is_active = true/g) ?? [];
    const revogados = forward.match(/revoked_at IS NULL/g) ?? [];
    expect(ativos.length).toBeGreaterThanOrEqual(4);
    expect(revogados.length).toBe(ativos.length);
    expect(forward).toContain("valid_from IS NULL OR");
    expect(forward).toContain("valid_until IS NULL OR");
  });

  it("preserva o escopo de identidade da L2/L3 e não concede PUBLIC nem anon", () => {
    expect(forward).toContain("public.fn_authz_uid_scope_ok");
    expect(forward).not.toMatch(/GRANT[^;]*\bTO\b[^;]*\b(PUBLIC|anon)\b/);
    for (const fn of [...RELATORIOS, ...ESCOPO, "lab_request_replanning"]) {
      expect(forward).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(`));
    }
  });

  it("fixa search_path em todas as funções redefinidas", () => {
    const defs = forward.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    const paths = forward.match(/SET search_path TO 'public'/g) ?? [];
    expect(defs).toHaveLength(8);
    expect(paths.length).toBe(defs.length);
  });

  it("o rollback restaura exatamente as oito definições anteriores", () => {
    const defs = rollback.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    expect(defs).toHaveLength(8);
    expect(rollback).toMatch(/\bi\.amount\b/);
    expect(rollback).toContain("'laboratorio'");
  });

  it("o forward está rastreado no manifesto de applied-forwards com ledger 679", () => {
    expect(manifest.ledger_versoes).toBe(684);
    const e = manifest.entries.find((x) => x.version === "20261010000000");
    expect(e).toBeDefined();
    expect(e!.applied_to_staging).toBe(true);
    expect(e!.required_in_promotion_bundle).toBe(true);
  });
});
