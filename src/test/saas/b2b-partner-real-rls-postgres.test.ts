import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("canonical partner policies — isolated PostgreSQL, simulated Auth", () => {
  it("reproduces whole-row technical exposure then denies it without widening internal tenants", () => {
    const output = execFileSync("python3", ["scripts/tests/b2b-partner-real-rls-local.py"], { encoding: "utf8" });
    expect(output).toContain("PASS real baseline technical reads own financial row");
    expect(output).toContain("PASS technical direct financial rows denied");
    expect(output).toContain("PASS internal admin A still sees exactly two A partners");
    expect(output.match(/NOTICE: {2}PASS/g)).toHaveLength(13);
  }, 60_000);
});