import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runPgBattery, pgBatteryTestTimeout } from "@/test/helpers/pgBatterySlot";
it("declaração MG com null preserva merge/CAS/RLS e CHECKs canônicos no PostgreSQL local", async () => {
  const { stdout } = await runPgBattery("python3", ["scripts/fiscal-company-save-20261112/test_pg.py"], { timeout: 120_000, env: { ...process.env, TEST_ACCREDITATIONS: "1" } });
  expect(stdout).toContain("33 PostgreSQL checks PASS");
  const result = JSON.parse(readFileSync("scripts/fiscal-company-save-20261112/evidence/accreditations/pg.json", "utf8")) as { checks: Array<{ pass: boolean }> };
  expect(result.checks).toHaveLength(33);
  expect(result.checks.every((item) => item.pass)).toBe(true);
}, pgBatteryTestTimeout(120_000));