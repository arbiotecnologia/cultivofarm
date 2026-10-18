import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("F2-B3.2 independent review — disposable PostgreSQL", () => {
  it("detects rowshape exposure, automatic dependency loss and read blocking", () => {
    const output = execFileSync("python3", ["scripts/tests/b2b-f2b32-review-local.py"], { encoding: "utf8" });
    expect(output).toContain("PASS 12 review checks;");
    expect(output).toContain("restrict silently drops local index and check inside transaction");
    expect(output).toContain("old manifest misses rowshape changes");
    expect(output).toContain("access exclusive blocks select and release restores read");
    expect(output).toContain("NO-GO backup/hosted authorization; B3.3 design only");
  }, 60_000);
});