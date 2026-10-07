import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20261007135856_0ba377fd-500e-4bf0-840c-60196df60ee0.sql", "utf8");

describe("Forward-fix B2B técnico — contrato estrutural, não prova funcional SQL", () => {
  it("reutiliza ambas atribuições com cliente, ator, parceiro e active", () => {
    expect(sql).toContain("puc.cliente_id=cl AND puc.user_id=u AND puc.partner_id=p AND puc.active=true");
    expect(sql).toContain("ptc.cliente_id=cl AND ptc.technician_user_id=u AND ptc.partner_id=p AND ptc.active=true");
    expect(sql).toContain("technical_guard_definition_drift");
  });
  it("bloqueia todos os cinco campos financeiros dos itens", () => {
    for (const field of ["valor_unitario_cheio", "subtotal", "preco_tabela_snapshot", "preco_unitario", "desconto_percentual"]) {
      expect(sql).toContain(`coalesce(${field},0)=0`);
    }
    expect(sql.match(/AS RESTRICTIVE FOR ALL TO authenticated/g)).toHaveLength(2);
  });
  it("bloqueia total e conversão técnica forjada, preservando outros perfis", () => {
    expect(sql).toContain("total_cheio=0 AND status IN ('rascunho','enviada_gestor')");
    expect(sql).toContain("converted_order_id IS NULL AND converted_by IS NULL AND converted_at IS NULL");
    expect(sql).toContain("NOT (SELECT public.has_role(auth.uid(),'parceiro_b2b_tecnico')) OR");
  });
  it("mantém initplans somente em predicados independentes da linha", () => {
    expect(sql).toContain("created_by=(SELECT auth.uid())");
    expect(sql).toContain("platform_private.b2b_phase1_partner_visible(partner_id,true)");
    expect(sql).not.toContain("SELECT platform_private.b2b_phase1_partner_visible");
  });
  it("não altera dados históricos nem cria fonte paralela", () => {
    expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|DELETE FROM|UPDATE public\.|INSERT INTO/);
    expect(sql).toContain("FROM PUBLIC,anon");
  });
});