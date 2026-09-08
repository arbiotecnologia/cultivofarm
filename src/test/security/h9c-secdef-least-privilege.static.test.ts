import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-C — Gate estático da correção de menor privilégio 20261005000000_h9c1.
 *
 * Invariantes protegidos:
 *  - o forward e o rollback nominal existem;
 *  - o forward revoga EXECUTE de authenticated/anon/PUBLIC nas duas funções vulneráveis;
 *  - o forward NÃO reconcede EXECUTE a authenticated/anon (apenas service_role);
 *  - o forward não altera corpo de função, RLS, cron, Auth ou Storage;
 *  - o inventário determinístico das 378 funções permanece no repositório.
 */
const ROOT = resolve(__dirname, "../../..");
const FORWARD = resolve(
  ROOT,
  "restoration/homologacao-h9/h9c-forwards/20261005000000_h9c1_least_privilege_secdef_v1.sql",
);
const ROLLBACK = resolve(
  ROOT,
  "restoration/homologacao-h9/h9c-rollbacks/20261005000000_h9c1_least_privilege_secdef_v1_rollback.sql",
);
const INVENTORY = resolve(
  ROOT,
  "restoration/homologacao-h9/h9c-inventario/secdef-authenticated-inventory-pre-h9c1.tsv",
);
const CLASSIFICATION = resolve(
  ROOT,
  "restoration/homologacao-h9/h9c-inventario/secdef-authenticated-classificacao.tsv",
);

const TARGETS = [
  "public.check_partner_order_sla()",
  "public.rpc_fiscal_xml_record_v1(uuid, text, jsonb)",
] as const;

describe("H9-C — menor privilégio em SECURITY DEFINER", () => {
  it("mantém forward e rollback nominal versionados", () => {
    expect(existsSync(FORWARD)).toBe(true);
    expect(existsSync(ROLLBACK)).toBe(true);
  });

  it("revoga EXECUTE de authenticated, anon e PUBLIC nas duas funções", () => {
    const sql = readFileSync(FORWARD, "utf8");
    for (const fn of TARGETS) {
      for (const role of ["PUBLIC", "anon", "authenticated"]) {
        expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION ${fn} FROM ${role};`);
      }
    }
  });

  it("não reconcede EXECUTE a authenticated ou anon no forward", () => {
    const sql = readFileSync(FORWARD, "utf8");
    const grants = sql.match(/GRANT EXECUTE ON FUNCTION[^;]+;/g) ?? [];
    expect(grants.length).toBe(2);
    for (const grant of grants) {
      expect(grant).toMatch(/TO service_role;$/);
      expect(grant).not.toMatch(/\b(authenticated|anon|PUBLIC)\b/);
    }
  });

  it("não altera corpo de função, RLS, cron, Auth nem Storage", () => {
    const sql = readFileSync(FORWARD, "utf8");
    const body = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    for (const forbidden of [
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i,
      /DROP\s+FUNCTION/i,
      /CREATE\s+POLICY|DROP\s+POLICY|ALTER\s+POLICY/i,
      /ALTER\s+TABLE/i,
      /cron\.(schedule|alter_job|unschedule)/i,
      /\b(auth|storage)\./i,
    ]) {
      expect(body).not.toMatch(forbidden);
    }
  });

  it("restaura exatamente o EXECUTE de authenticated no rollback", () => {
    const sql = readFileSync(ROLLBACK, "utf8");
    for (const fn of TARGETS) {
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated;`);
    }
    expect(sql).toContain("'20261005000000'");
  });

  it("preserva o inventário determinístico das 378 funções", () => {
    const rows = readFileSync(INVENTORY, "utf8").trim().split("\n");
    expect(rows[0].split("\t")).toHaveLength(18);
    expect(rows.length - 1).toBe(378);

    const classified = readFileSync(CLASSIFICATION, "utf8").trim().split("\n");
    expect(classified.length - 1).toBe(378);
    const corrected = classified.filter((r) => r.endsWith("AUTH_AUSENTE_CORRIGIDA_H9C1"));
    expect(corrected).toHaveLength(2);
  });
});
