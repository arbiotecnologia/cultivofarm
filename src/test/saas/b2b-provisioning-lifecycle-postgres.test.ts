import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("B2B provisioning candidate — isolated PostgreSQL and simulated Auth", () => {
  it("claims once, commits owner/role/link/first access and rolls back/compensates failures", () => {
    const output = execFileSync("python3", ["-B", "scripts/tests/b2b-provisioning-lifecycle-local.py"], { encoding: "utf8" });
    expect(output).toContain("PASS claim retry same reserved user not acquired");
    expect(output).toContain("PASS exactly dedicated manager role");
    expect(output).toContain("PASS first access server only recovery required");
    expect(output).toContain("PASS rollback no role link or tenant");
    expect(output).toContain("PASS completed compensation never permits deletion");
    expect(output).toContain("PASS cleanup receipt completed only after deletion");
    expect(output).toContain("PASS revoked iat after claim with service uid null");
    expect(output).toContain("PASS revocation advances existing profile stamp");
    expect(output).toContain("PASS editable metadata receipt denied by SQL");
    expect(output).toContain("PASS two connections claim same reserved ID exactly one acquired");
    expect(output).toContain("PASS two connections profile gate versus finish no deadlock");
    expect(output).toContain("PASS two connections finish versus compensation preserves completed");
    expect(output).toContain("PASS two connections real invitation producer one row lease conflict");
    expect(output).toContain("PASS new associated invite versus finish denies phantom");
    expect(output).toContain("PASS NULL user_id association versus finish denied");
    expect(output).toContain("PASS real finalizer association versus finish denied");
    expect(output).toContain("PASS real access revocation versus finish denied");
    expect(output).toContain("PASS row-before-gate NOWAIT abort no deadlock and finish succeeds");
    expect(output).toContain("PASS finish before revoke preserves completed but denies replay");
  }, 60_000);
});