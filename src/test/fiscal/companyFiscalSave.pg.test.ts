import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runPgBattery, pgBatteryTestTimeout } from "@/test/helpers/pgBatterySlot";
it("payloads reais do SDK exercitam CHECK/H15/CAS no espelho componente descartável", async () => {
  const { stdout } = await runPgBattery("python3", ["scripts/fiscal-company-save-20261112/test_pg.py"], { timeout: 120_000 });
  expect(stdout).toContain("26 PostgreSQL checks PASS");
  const result = JSON.parse(readFileSync("scripts/fiscal-company-save-20261112/evidence/pg.json", "utf8")) as { checks: Array<{ pass: boolean }> };
  expect(result.checks).toHaveLength(26);
  expect(result.checks.every((item) => item.pass)).toBe(true);
}, pgBatteryTestTimeout(120_000));