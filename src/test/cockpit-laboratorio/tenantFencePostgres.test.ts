import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Cockpit candidate — isolated PostgreSQL, simulated Auth and reduced schema", () => {
  it("filters tenants before counting and denies unsupported roles and missing entitlement", () => {
    const output = execFileSync("python3", ["scripts/tests/cockpit-esteira-fence-local.py"], { encoding: "utf8" });
    expect(output).toContain("PASS AR admin own tenant only");
    expect(output).toContain("PASS FSF cannot see AR");
    expect(output).toContain("PASS carteira cross-tenant zero");
    expect(output).toContain("PASS onfarm not widened");
    expect(output).toContain("PASS RPC denies without plan feature");
    expect(output.match(/NOTICE: {2}PASS/g)).toHaveLength(14);
  }, 60_000);
});