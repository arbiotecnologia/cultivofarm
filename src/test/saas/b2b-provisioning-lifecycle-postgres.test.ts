import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("B2B provisioning candidate — isolated PostgreSQL and simulated Auth", () => {
  it("claims once, commits owner/role/link/first access and rolls back/compensates failures", () => {
    const output = execFileSync("python3", ["scripts/tests/b2b-provisioning-lifecycle-local.py"], { encoding: "utf8" });
    expect(output).toContain("PASS claim retry same reserved user not acquired");
    expect(output).toContain("PASS exactly dedicated manager role");
    expect(output).toContain("PASS first access server only recovery required");
    expect(output).toContain("PASS rollback no role link or tenant");
    expect(output).toContain("PASS completed compensation never permits deletion");
    expect(output).toContain("PASS cleanup receipt completed only after deletion");
  }, 60_000);
});