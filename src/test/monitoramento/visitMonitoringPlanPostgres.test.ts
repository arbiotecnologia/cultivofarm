import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("plano canônico PostgreSQL descartável/Auth sintética: atomicidade/CAS/origem/espera", () => {
  const output = execFileSync("python3", ["scripts/visit-monitoring-plan-20261027/test-local.py"], { encoding: "utf8" });
  expect(output).toContain("PASS rollback receipt");
  expect(output).toContain("PASS concurrent double submit one increment");
  expect(output).toContain("PASS revoke during gate wait PT404");
  expect(output).toContain("TOTAL 19");
}, 90_000);