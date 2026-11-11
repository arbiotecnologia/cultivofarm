import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
it("plano canônico PostgreSQL descartável/Auth sintética: atomicidade/CAS/origem/espera", async () => {
  const { stdout: output } = await runPgBattery("python3", ["scripts/visit-monitoring-plan-20261027/test-local.py"], { encoding: "utf8" });
  expect(output).toContain("PASS rollback receipt");
  expect(output).toContain("PASS concurrent double submit one increment");
  expect(output).toContain("PASS revoke during gate wait PT404");
  expect(output).toContain("PASS revoke during visit row wait 42501");
  expect(output).toContain("PASS confirmed replay survives past date");
  expect(output).toContain("PASS new past plan rejected after replay 22023");
  expect(output).toContain("TOTAL 30");
}, pgBatteryTestTimeout(90_000));