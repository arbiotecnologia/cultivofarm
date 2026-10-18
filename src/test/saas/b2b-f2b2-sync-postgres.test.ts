import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("F2-B2 contained technical projection — disposable SQL", () => {
  it("checks cleanup, actor containment, concurrency and precise blockers", () => {
    const output = execFileSync("python3", ["scripts/tests/b2b-f2b2-sync-local.py"], { encoding: "utf8" });
    expect(output).toContain("exact baseline rollback hash");
    expect(output).toContain("same PUC concurrent last serialized update projected");
    expect(output).toContain("NO-GO actor/provenance/revocation pipeline; no hosted SQL");
  }, 60_000);
});
