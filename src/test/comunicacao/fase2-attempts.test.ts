// Testes contratuais estáticos para a semântica de attempts na Fase 2.
// Racional: rpc_claim_communication_outbox (Fase 1) JÁ incrementa attempts
// no momento do claim. Portanto:
//   - rpc_fail_communication_delivery_v2 NÃO pode incrementar attempts
//     novamente e deve comparar r.attempts (não r.attempts + 1) com
//     r.max_attempts. Permanente ⇒ dead_letter imediato.
//   - rpc_defer_communication_delivery deve DESFAZER o incremento do claim
//     via GREATEST(r.attempts - 1, 0), pois canal OFF/config ausente não é
//     tentativa real de provedor.
//
// Estes asserts são realizados por leitura da migration.sql (sem rede).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = readFileSync("restoration/comunicacao-fase2/migration.sql", "utf8");

function extractFn(name: string): string {
  const re = new RegExp(
    String.raw`CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.${name}\s*\([\s\S]*?\$\$;`,
    "i",
  );
  const m = MIGRATION.match(re);
  if (!m) throw new Error(`função ${name} não encontrada em migration.sql`);
  return m[0];
}

describe("Fase 2 · semântica de attempts (contratual)", () => {
  it("fail_v2: NÃO incrementa attempts (claim já incrementou)", () => {
    const body = extractFn("rpc_fail_communication_delivery_v2");
    expect(body).not.toMatch(/attempts\s*=\s*r\.attempts\s*\+\s*1/);
  });

  it("fail_v2: compara r.attempts (não r.attempts + 1) com r.max_attempts", () => {
    const body = extractFn("rpc_fail_communication_delivery_v2");
    expect(body).toMatch(/r\.attempts\s*>=\s*r\.max_attempts/);
    expect(body).not.toMatch(/\(\s*r\.attempts\s*\+\s*1\s*\)\s*>=\s*r\.max_attempts/);
  });

  it("fail_v2: permanente ⇒ dead_letter imediato sem novo attempts++", () => {
    const body = extractFn("rpc_fail_communication_delivery_v2");
    // Existe branch p_is_permanent e transição para dead_letter.
    expect(body).toMatch(/p_is_permanent/);
    expect(body).toMatch(/status\s*=\s*'dead_letter'/);
    // O UPDATE dead_letter não deve conter attempts = r.attempts + 1.
    const deadBranch = body.split(/status\s*=\s*'dead_letter'/)[1] ?? "";
    expect(deadBranch).not.toMatch(/attempts\s*=\s*r\.attempts\s*\+\s*1/);
  });

  it("fail_v2: transitório reagenda sem incremento (backoff em r.attempts)", () => {
    const body = extractFn("rpc_fail_communication_delivery_v2");
    // Backoff deriva de r.attempts (não de r.attempts + 1).
    expect(body).toMatch(/POWER\(\s*2\s*,\s*GREATEST\(\s*r\.attempts\s*-\s*1/);
    // status pending sem attempts = r.attempts + 1 no ramo transitório.
    const pendingIdx = body.lastIndexOf("status = 'pending'");
    expect(pendingIdx).toBeGreaterThan(0);
    const pendingBranch = body.slice(pendingIdx);
    expect(pendingBranch).not.toMatch(/attempts\s*=\s*r\.attempts\s*\+\s*1/);
  });

  it("defer: devolve o incremento do claim via GREATEST(r.attempts - 1, 0)", () => {
    const body = extractFn("rpc_defer_communication_delivery");
    expect(body).toMatch(/GREATEST\(\s*COALESCE\(\s*r\.attempts\s*,\s*0\s*\)\s*-\s*1\s*,\s*0\s*\)/);
    // Escreve attempts = <valor devolvido> no UPDATE.
    expect(body).toMatch(/attempts\s*=\s*v_attempts/);
  });

  it("defer: preserva lease-safety (worker_id checado, locks limpos)", () => {
    const body = extractFn("rpc_defer_communication_delivery");
    expect(body).toMatch(/locked_by\s+IS\s+DISTINCT\s+FROM\s+p_worker_id/);
    expect(body).toMatch(/locked_at\s*=\s*NULL/);
    expect(body).toMatch(/locked_by\s*=\s*NULL/);
    expect(body).toMatch(/lease_expires_at\s*=\s*NULL/);
  });

  it("defer: só opera em outbox 'processing' (não estoura attempts em repetição)", () => {
    const body = extractFn("rpc_defer_communication_delivery");
    // Guard de status processing garante que defer repetido exige novo claim,
    // que reincrementa; ao devolver, nunca fica negativo (GREATEST ..., 0).
    expect(body).toMatch(/status\s*<>\s*'processing'/);
  });

  it("fail_v2 e defer: apenas service_role (REVOKE + insufficient_privilege)", () => {
    for (const name of [
      "rpc_fail_communication_delivery_v2",
      "rpc_defer_communication_delivery",
    ]) {
      const body = extractFn(name);
      expect(body).toMatch(/insufficient_privilege/);
      // Grants globais na migration
      const grantRe = new RegExp(
        String.raw`GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.${name}\s*\([^)]*\)\s+TO\s+service_role`,
        "i",
      );
      const revokeRe = new RegExp(
        String.raw`REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.${name}\s*\([^)]*\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated`,
        "i",
      );
      expect(MIGRATION).toMatch(grantRe);
      expect(MIGRATION).toMatch(revokeRe);
    }
  });
});
