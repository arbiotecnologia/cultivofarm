import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261008031156_a233a75e-1ff4-47ef-99da-db667578f4fa.sql", "utf8");
const proof = readFileSync("scripts/rbac-audit/stock-motor-hardening-proof.sql", "utf8");

describe("P1 motor — contrato estático, não certificação runtime", () => {
  it("usa identidade, RBAC e feature canônicos antes do item", () => {
    for (const token of ["public.h15_actor_organization()", "public.fn_estoque_pode_operar(auth.uid(),p_acao)", "public.saas_has_feature('estoque_embalagens')", "l.organization_id=v_org", "g.organization_id=v_org"])
      expect(sql).toContain(token);
    expect(sql.indexOf("v_org:=platform_private.stock_motor_actor(p_acao)")).toBeLessThan(sql.indexOf("SELECT e.* INTO v_item"));
  });
  it("prende replay ao ator e item de origem, inclusive reserva parcial", () => {
    for (const token of ["v_prev.usuario_id IS DISTINCT FROM v_uid", "stock_request_item", "stock_request_actor", "public.stock_p1_movement_owned", "ESTQ_SEM_TRILHA", "public.fn_estoque_ctx_force(v_ctx)"])
      expect(sql).toContain(token);
    expect(proof).toContain("SPLIT_REPLAY_FAILED");
    expect(proof).toContain("WRONG_ITEM_REPLAY");
  });
  it("preserva políticas e ACL fechadas sem wrapper público", () => {
    expect(sql).not.toMatch(/CREATE (?:OR REPLACE )?(?:POLICY|TABLE)|DROP POLICY/i);
    expect(sql).not.toMatch(/GRANT .* TO authenticated/i);
    expect(sql).toContain("FROM PUBLIC,anon,authenticated");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.");
  });
  it("nega referências não comprovadas e payload que forja autoria", () => {
    expect(sql).toContain("v_rt NOT IN ('entrega','ordem_servico','manual','sistema')");
    expect(sql).toContain("ARRAY['organization_id','tenant_id','usuario_id','user_id','owner_id']");
    expect(sql).toContain("m.estoque_produto_id=p_item AND m.lote_id=p_lote");
  });
  it("a prova usa UUIDs novos e rollback obrigatório sem relaxar triggers", () => {
    expect(proof).toContain("'TEMPORARY_AUDIT_STOCK_MOTOR_'||gen_random_uuid()::text");
    expect(proof).toContain("RAISE EXCEPTION 'STOCK_MOTOR_PROOF_ROLLBACK");
    expect(proof).not.toMatch(/\bCOMMIT\b|DISABLE TRIGGER|session_replication_role/i);
    for (const token of ["'lotes'", "'envases'", "'clientes'", "'fazendas'", "'talhoes'", "'os'", "'stock'", "'moves'"])
      expect(proof).toContain(token);
  });
});