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
  expect(output).toContain("PASS zero plan notices rejected PT409");
  expect(output).toContain("PASS two plan notices rejected PT409");
  expect(output).toContain("PASS two alerts sharing visit block synchronization PT409");
  expect(output).toContain("PASS link with alert date != plan date rejected (no divergence) 22023");
  expect(output).toContain("PASS plan date change after link blocked PT409");
  expect(output).toContain("PASS ambiguity rejections fully atomic");
  expect(output).toContain("PASS finalized: explicit alert-only mode, visit not synchronized");
  for (const c of ["link visit without plan rejected PT409", "link malformed block (no end marker) rejected PT409", "link plan with null visit date rejected PT409",
    "link plan with 0 notices rejected PT409", "link plan with 2 notices rejected PT409", "link notice date divergent rejected PT409",
    "legacy origin without plan: reschedule rejected PT409", "rejected links left no receipts"]) expect(output).toContain("PASS " + c);
  expect(output).toContain("TOTAL 87");
}, 120_000);
