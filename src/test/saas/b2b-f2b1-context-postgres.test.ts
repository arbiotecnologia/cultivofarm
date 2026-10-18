import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("F2-B1 context and actor-target baseline — isolated SQL", () => {
  it("preserves proven legacy structure, denies revoked context and records target-contract blockers", () => {
    const output = execFileSync("python3", ["scripts/tests/b2b-f2b1-context-local.py"], { encoding: "utf8" });
    expect(output).toContain("PASS 32 SQL assertions; exact baseline context rollback");
    expect(output).toContain("B1b full preflight refused missing policy manifest");
  }, 60_000);
});
