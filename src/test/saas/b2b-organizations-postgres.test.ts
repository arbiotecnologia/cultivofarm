import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("real organizations policies deny external full rows and residual links, preserving internal tenant", () => {
  const output = execFileSync("python3", ["-B", "scripts/tests/b2b-organizations-local.py"], { encoding: "utf8" });
  for (const proof of ["baseline exposes onboarding", "manager full row denied", "existing context projects own organization", "sibling manager full row denied", "technical full row denied", "extra role cannot bypass", "internal B residual partner link cannot expose A", "internal same tenant preserved", "anonymous actor denied"]) {
    expect(output).toContain(`PASS organizations ${proof}`);
  }
}, 60_000);