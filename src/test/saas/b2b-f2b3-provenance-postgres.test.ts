import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("F2-B3 provenance — structural SQL only", () => {
  it("checks source integrity, unknown legacy and rollback refusal", () => {
    const output = execFileSync("python3", ["scripts/tests/b2b-f2b3-provenance-local.py"], { encoding: "utf8" });
    expect(output).toContain("PASS 14 structural checks;");
    expect(output).toContain("FK rejects mismatched partner_id");
    expect(output).toContain("rollback refuses provenance loss");
    expect(output).toContain("NO-GO hosted/actor/RLS/revocation; synthetic schema only");
  }, 60_000);
});