import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("F2-B scalar candidates — isolated PostgreSQL only", () => {
  it("checks real SQL cardinality, revoked/tenant/profile denial and exact rollback", () => {
    const output = execFileSync("python3", ["scripts/tests/b2b-f2b-helpers-local.py"], { encoding: "utf8" });
    expect(output).toContain("26 behavior assertions, 2 exact rollback hashes");
    expect(output).toContain("expected full installer refusal");
  }, 60_000);
});
