import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("F2-B3.1 neutral metadata — disposable PostgreSQL only", () => {
  it("preserves writers and cascades, refuses metadata loss and reproduces unsafe collisions", () => {
    const output = execFileSync("python3", ["scripts/tests/b2b-f2b31-neutral-local.py"], { encoding: "utf8" });
    expect(output).toContain("PASS 22 structural checks;");
    expect(output).toContain("partner parent cascade succeeds and rollback preserves rows");
    expect(output).toContain("client parent cascade succeeds and rollback preserves rows");
    expect(output).toContain("known gap unchanged sync overwrites labelled direct grant");
    expect(output).toContain("rollback refuses metadata loss");
    expect(output).toContain("NO-GO provenance/revocation/RLS hosted");
  }, 60_000);
});