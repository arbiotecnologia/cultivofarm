import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("origem agronômica e reprogramação: PostgreSQL descartável/Auth sintética, duas ordens de revogação", () => {
  const output = execFileSync("python3", ["scripts/visit-monitoring-plan-20261027/agronomic-origin/test-local.py"], { encoding: "utf8" });
  expect(output).toContain("PASS incompatible talhão rejected 22023");
  expect(output).toContain("PASS alert CAS differs by one microsecond PT409");
  expect(output).toContain("PASS old v1 caller with origin fails safely PT428");
  expect(output).toContain("PASS plan text byte-preserved except date line");
  expect(output).toContain("PASS finalized visit untouched");
  expect(output).toContain("PASS order1 revocation committed before gate release: operation 42501");
  expect(output).toContain("PASS order2 operation serialized before revocation committed");
  expect(output).toMatch(/PASS gate wait bounded by lock_timeout 55P03/);
  expect(output).toContain("TOTAL 55");
}, 120_000);
