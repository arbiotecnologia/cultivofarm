import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Executes the actual read-only audit predicate locally. No Supabase/RLS/JWT proof.
const sql = readFileSync("scripts/rbac-audit/b2b-p1b-contract-cases.readonly.sql", "utf8");
const execution = spawnSync("python3", ["-c", `
import sqlite3,sys,json
c=sqlite3.connect(':memory:')
c.execute("attach database ':memory:' as public")
c.execute('create table public.fiscal_environment_marker(project_ref text)')
c.execute("insert into public.fiscal_environment_marker values ('swzpzcwiasxmjutrmvkm')")
print(json.dumps(c.execute(sys.stdin.read()).fetchall()))
`], { input: sql, encoding: "utf8" });
if (execution.status !== 0) throw new Error("local_audit_predicate_failed");
const rows: [string, number, number, string][] = JSON.parse(execution.stdout);

describe("P1B internal A predicate model — not runtime authorization", () => {
  it("allows authorized A only in its commercial context", () => {
    expect(rows.find(([name]) => name === "internal_A")?.[1]).toBe(1);
  });
  for (const name of ["P_to_A", "A_to_P", "same_cnpj_P_to_A",
    "linked_organization_P_to_A", "cross_tenant", "inactive", "no_org",
    "no_role", "no_feature", "legacy_owner", "resource_P", "creditor_P",
    "issuer_P", "customer_P", "no_scope"]) {
    it(`denies ${name}`, () => {
      expect(rows.find(([key]) => key === name)?.[1]).toBe(0);
    });
  }
});