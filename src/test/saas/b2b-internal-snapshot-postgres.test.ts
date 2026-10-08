import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Internal A snapshots — isolated PostgreSQL, not live Auth/RLS/JWT", () => {
  it("executes applied triggers with 23 positive and negative scenarios", () => {
    const result = spawnSync("python3", ["scripts/tests/b2b-internal-snapshot-local.py"], {
      encoding: "utf8",
      timeout: 30000,
    });
    expect(result.status, result.stderr).toBe(0);
    const evidence: { passed: number; cases: string[] } = JSON.parse(result.stdout);
    expect(evidence.passed).toBe(23);
    expect(evidence.cases).toContain("own_A_optional_client_origin");
    expect(evidence.cases).toContain("P_to_A");
    expect(evidence.cases).toContain("approval_seals_real_rows");
    expect(evidence.cases).toContain("sealed_planning");
  }, 35000);
});