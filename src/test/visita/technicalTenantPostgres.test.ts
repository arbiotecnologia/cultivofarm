import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("technical tenant containment — isolated PostgreSQL, simulated Auth", () => {
  it("denies cross-tenant reads/replay while preserving own lifecycle", () => {
    const output = execFileSync("python3", ["scripts/tests/technical-tenant-local.py"], { encoding: "utf8" });
    expect(output).toContain("PASS baseline direct visit zero");
    expect(output).toContain("PASS baseline list cross leak");
    expect(output).toContain("PASS FSF list zero");
    expect(output).toContain("PASS responsible list two");
    expect(output).toContain("PASS create own actual RPC");
    expect(output).toContain("PASS replay own actual RPC");
    expect(output).toContain("PASS cross replay actual RPC");
    expect(output).toContain("PASS start own actual RPC");
    expect(output).toContain("PASS assigned farm before first visit");
    expect(output.match(/NOTICE: {2}PASS/g)).toHaveLength(37);
  }, 60_000);
});