import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261008022948_3e92d4d7-cfe5-477b-b100-70f5eeff24d6.sql", "utf8");
const proof = readFileSync("scripts/rbac-audit/stock-p1-transactional-proof.sql", "utf8");
const movementMigration = readFileSync("supabase/migrations/20261008024032_daf0ffb8-65f0-4dc1-a52c-f216705b9198.sql", "utf8");
const movementProof = readFileSync("scripts/rbac-audit/stock-p1-movements-proof.sql", "utf8");
const historyLedger = readFileSync("restoration/stock-p1-history/20261008024129_stock_p1_history_tenant_containment.sql", "utf8");

describe("P1 estoque — contrato estrutural (não prova runtime)", () => {
  it("preserva o SQL do ledger Codex sem reaplicação nem relaxamento", () => {
    expect(historyLedger).toContain("CREATE POLICY stock_p1_history_tenant_isolation");
    expect(historyLedger).toContain("AS RESTRICTIVE FOR ALL TO authenticated");
    const using = historyLedger.split("USING (")[1]?.split("WITH CHECK (")[0];
    const check = historyLedger.split("WITH CHECK (")[1]?.split("COMMENT ON POLICY")[0];
    for (const clause of [using, check]) {
      expect(clause).toContain("ep.id = estoque_movimentacoes.estoque_produto_id");
      expect(clause).toContain("ep.lote_id = estoque_movimentacoes.lote_id");
      expect(clause).toContain("public.stock_p1_lote_owned(ep.lote_id)");
    }
    expect(historyLedger).not.toMatch(/\b(?:DROP|ALTER|GRANT|INSERT|UPDATE|DELETE)\b/i);
  });
  it("restringe histórico pelo par estoque/lote pertencente ao ator", () => {
    for (const text of ["AS RESTRICTIVE FOR ALL TO authenticated", "USING(public.stock_p1_movement_owned(estoque_produto_id,lote_id))", "WITH CHECK(public.stock_p1_movement_owned(estoque_produto_id,lote_id))", "e.id=p_stock AND e.lote_id=p_lote", "stock_p1_lote_owned(e.lote_id)"])
      expect(movementMigration).toContain(text);
  });
  it("valida referências sem backfill nem reabrir RPCs", () => {
    for (const text of ["a00_stock_p1_movement_guard BEFORE INSERT", "NEW.lote_id IS DISTINCT FROM v_lote", "NEW.movimentacao_origem_id", "NEW.referencia_id IS DISTINCT FROM NEW.estoque_produto_id", "ESTQ_MOV_REFERENCE_UNSUPPORTED", "public.clientes", "public.entregas", "public.ordens_servico_onfarm"])
      expect(movementMigration).toContain(text);
    expect(movementMigration).not.toMatch(/(?:UPDATE|DELETE FROM)\s+public\.estoque_movimentacoes/i);
    expect(movementMigration).not.toMatch(/GRANT\s+(?:ALL|EXECUTE).*rpc_estoque/i);
  });
  it("prova positiva e negativa inclui view e rollback", () => {
    for (const text of ["OWN_DIRECT", "OWN_VIEW", "CROSS_DIRECT", "CROSS_VIEW", "ORPHAN_DIRECT", "ORPHAN_VIEW", "IF d<>4", "MOV_P1_POST_ROLLBACK", "'iat'", "public.controle_qualidade", "public.envase"])
      expect(movementProof).toContain(text);
    expect(movementProof).not.toMatch(/\bCOMMIT\b/i);
  });
  it("gera run_id único e emite manifesto exato no rollback", () => {
    expect(movementProof).toContain("'TEMPORARY_AUDIT_STOCK_MOV_P1_'||gen_random_uuid()::text");
    for (const text of ["'run_id',r", "'lotes',jsonb_build_array(la,lb)", "'envases',jsonb_build_array(ea,eb)", "'stock',jsonb_build_array(sa,sb)", "'movs',jsonb_build_array(ma,mb)"])
      expect(movementProof).toContain(text);
  });
  it("restringe leitura/escrita pela organização explícita do lote", () => {
    for (const text of ["AS RESTRICTIVE FOR ALL TO authenticated", "USING (public.stock_p1_lote_owned(lote_id))", "WITH CHECK (public.stock_p1_lote_owned(lote_id))", "l.organization_id IS NOT NULL", "l.organization_id = public.h15_actor_organization()"])
      expect(migration).toContain(text);
  });
  it("protege ator, old/new e referências antes dos guards legados", () => {
    for (const text of ["auth.uid() IS NULL OR v_org IS NULL", "stock_p1_lote_owned(OLD.lote_id)", "stock_p1_lote_owned(NEW.lote_id)", "a00_stock_p1_tenant_guard BEFORE INSERT OR UPDATE OR DELETE", "e.lote_id=NEW.lote_id AND e.organization_id=v_org"])
      expect(migration).toContain(text);
    for (const table of ["programacao_producao", "envase", "clientes", "partner_orders", "ordens_servico_onfarm", "ordens_servico"])
      expect(migration).toContain(`public.${table}`);
  });
  it("contém entradas privilegiadas sem alterar dados ou abrir replay", () => {
    expect(migration).toContain("WITH RECURSIVE funcs AS");
    expect(migration).toContain("WHERE prosecdef");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated");
    expect(migration).not.toMatch(/GRANT\s+(?:ALL|EXECUTE).*rpc_estoque/i);
    expect(migration).not.toMatch(/(?:UPDATE|DELETE FROM)\s+public\.estoque_produto/i);
  });
  it("mantém rollback obrigatório e separa SQL de browser", () => {
    for (const text of ["NOT a signed-in browser/API session", "TEMPORARY_AUDIT_STOCK_P1_", "SET LOCAL ROLE authenticated", "STOCK_P1_PROOF_ROLLBACK", "IF denied<>11"])
      expect(proof).toContain(text);
    expect(proof).not.toMatch(/\bCOMMIT\b/i);
  });
});