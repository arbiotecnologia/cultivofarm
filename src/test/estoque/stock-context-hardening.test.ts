import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20261008032313_a2c2834d-dd81-4e55-9632-56dfa3a5996d.sql", "utf8");
const policy = readFileSync("supabase/migrations/20261008032343_9c122697-5bb2-4e8b-b375-f7b86696b06a.sql", "utf8");
const fix = readFileSync("supabase/migrations/20261008032551_89d41651-3fa6-4111-a96f-cc6f40a3790a.sql", "utf8");
const proof = readFileSync("scripts/rbac-audit/stock-context-hardening-proof.sql", "utf8");
describe("P1 contexto — estrutural, não prova browser", () => {
  it("reserva valida contexto privado por txid/ator/item e argumentos", () => {
    for (const token of ["c.txid=txid_current() AND c.actor=auth.uid() AND c.item=p_item_id", "reserve_args", "stock_motor_context_set(NULL)", "stock_motor_context_set(v_ctx)"])
      expect(sql).toContain(token);
    expect(fix).toContain("jsonb_strip_nulls(jsonb_build_object");
  });
  it("contexto privado nega clientes sem regrant operacional", () => {
    expect(sql).toContain("REVOKE ALL ON platform_private.stock_motor_context FROM PUBLIC,anon,authenticated");
    expect(policy).toContain("USING(false) WITH CHECK(false)");
    expect(sql).not.toMatch(/GRANT .* TO authenticated/i);
  });
  it("ledger tem prefixo literal e destinatários ativos da mesma empresa", () => {
    for (const token of ["left(idempotency_key,length(v_key)+1) = v_key || '#'", "pr.ativo IS TRUE", "l.organization_id=pr.organization_id", "o.ativo IS TRUE"])
      expect(sql).toContain(token);
  });
  it("tipos inválidos e sentido arbitrário são negados antes do item", () => {
    for (const token of ["jsonb_each(p_payload)", "jsonb_typeof(e.value) NOT IN ('string','null')", "NOT IN ('entrada','saida')", "v_origem_mov uuid;"])
      expect(sql).toContain(token);
  });
  it("prova inclui pré-forja, wildcard, payload, replay e rollback", () => {
    for (const token of ["FORGED_CONTEXT_LEAK", "FORGED_SPLIT_CONTEXT", "INVALID_PAYLOAD_ACCEPTED", "CONTEXT_NOT_CLOSED", "SPLIT_REPLAY_FAILED", "denied<>14", "Xajuste#0", "_%_perda", "STOCK_CONTEXT_PROOF_ROLLBACK"])
      expect(proof).toContain(token);
    expect(proof).not.toMatch(/\bCOMMIT\b|DISABLE TRIGGER|session_replication_role/i);
  });
});
