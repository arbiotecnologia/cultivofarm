import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const MIGRATION = "supabase/migrations/20260928000000_h6c_fin_helpers_acl_v1.sql";
const HELPERS = [
  "fn_entrega_valor_faturavel_v1",
  "fn_entrega_guard_faturamento_v1",
  "fn_h6b_reconciliacao_valor_faturavel",
];

const sql = readFileSync(MIGRATION, "utf8");

describe("H6c — ACL dos helpers financeiros SECURITY DEFINER", () => {
  it("revoga PUBLIC, anon e authenticated nos três helpers", () => {
    for (const fn of HELPERS) {
      expect(sql).toContain(fn);
    }
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC");
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM authenticated");
  });

  it("mantém service_role e search_path explícito", () => {
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(sql).toContain("SET search_path = public");
  });

  it("é idempotente (guardas to_regprocedure)", () => {
    expect(sql).toContain("to_regprocedure(fn) IS NOT NULL");
  });

  it("nenhum código do frontend chama os helpers diretamente", () => {
    for (const fn of HELPERS) {
      const found = execSync(
        `rg -l --glob '!**/types.ts' -- ${fn} src || true`,
        { encoding: "utf8" },
      )
        .split("\n")
        .filter((line) => line.trim() !== "" && !line.includes("src/test/"));
      expect(found).toEqual([]);
    }
  });
});
