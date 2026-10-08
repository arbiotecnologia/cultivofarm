import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("B2B latent channels — real SQL and branding policies, reduced isolated schema", () => {
  it("contains enum bug, cross tenant clients/messages and commercial logo writes", () => {
    const output = execFileSync("python3", ["scripts/tests/b2b-latent-channels-local.py"], { encoding: "utf8" });
    expect(output).toContain("PASS baseline enum text mismatch reproduced");
    expect(output).toContain("PASS admin A reads only coherent A assignment");
    expect(output).toContain("PASS admin B reads only B despite residual A link");
    expect(output).toContain("PASS manager cannot mutate sibling same tenant message");
    expect(output).toContain("PASS commercial owner manager logo upload contained");
    expect(output).toContain("PASS technical messages unavailable");
  }, 60_000);
});