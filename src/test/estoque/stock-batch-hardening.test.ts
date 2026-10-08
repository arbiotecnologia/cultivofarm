import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readdirSync("supabase/migrations").filter(n => n.startsWith("202610080") && n >= "20261008035712").map(n => readFileSync(`supabase/migrations/${n}`,"utf8")).join("\n");
const proof = readFileSync("scripts/rbac-audit/stock-batch-hardening-proof.sql","utf8");
describe("batch — estrutura não é API/browser", () => {
 it("autoriza antes do replay", () => {
  expect(sql.indexOf("v_org:=platform_private.stock_motor_actor('reserva')")).toBeLessThan(sql.indexOf("SELECT * INTO v_prev"));
  expect(sql.indexOf("stock_motor_item(v_id,'reserva',v_payload)")).toBeLessThan(sql.indexOf("SELECT * INTO v_prev"));
  expect(sql).toContain("v_qty::text IN ('NaN','Infinity','-Infinity')");
 });
 it("vincula recibo e nega colisões sem wildcard", () => {
  for(const token of ["v_prev.actor IS DISTINCT FROM v_actor","v_prev.organization_id IS DISTINCT FROM v_org","v_prev.fingerprint IS DISTINCT FROM v_fp","jsonb_agg(value ORDER BY value->>'item_id')","WHERE idempotency_key=v_key","v_call->>'replay' IS DISTINCT FROM 'false'"]) expect(sql).toContain(token);
  expect(sql).not.toMatch(/idempotency_key LIKE/);
 });
 it("libera só endpoints, não helpers", () => {
  const grants=sql.split("\n").filter(l=>/GRANT EXECUTE.*TO authenticated/.test(l));
  expect(grants).toHaveLength(2);
  expect(grants[0]).toContain("rpc_estoque_operar_v1");
  expect(grants[1]).toContain("rpc_estoque_reservar_v1");
  expect(sql).not.toMatch(/DROP POLICY|DISABLE TRIGGER/);
 });
 it("exige saldo/replay/rollback positivo", () => {
  for(const t of ["gen_random_uuid()","BATCH_BALANCE_WRONG","BATCH_NONATOMIC","BATCH_REPLAY_DUPLICATED","TOTAL_RESERVATION_FAILED","STOCK_BATCH_PROOF_ROLLBACK"]) expect(proof).toContain(t);
  expect(proof).not.toMatch(/\bCOMMIT\b|DISABLE TRIGGER/);
 });
 it("caller exige finitude e ok explícito", () => {
  const caller=readFileSync("src/hooks/useEsteiraLaboratorio.ts","utf8");
  expect(caller).toContain("!Number.isFinite(i.quantidade)");
  expect(caller).toContain("if (data?.ok !== true)");
 });
});
