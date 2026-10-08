import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("commercial B2B context — isolated PostgreSQL, not live Auth", () => {
  it("executes owner, exclusive role, own RLS, legacy and freshness cases with rollback", () => {
    const output = execFileSync("python3", ["scripts/tests/b2b-commercial-context-local.py"], { encoding: "utf8" });
    expect(output.match(/NOTICE: {2}PASS/g)).toHaveLength(22);
  }, 60_000);
});