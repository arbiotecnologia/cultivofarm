import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const directory = "scripts/owner-orders-20261023/credit-numeric-20261024/current-base-reconciliation-20261024";

it("propagates current financial tenants and rolls back full failed POST commands", async () => {
  const { stdout } = await runPgBattery("python3", [`${directory}/origin/test-local.py`], { timeout: 240_000 });
  expect(stdout).toContain("NULL title tenant exact canonical denial");
  expect(stdout).toContain("crossed installment parent exact canonical denial");
  expect(stdout).toContain("B same fixtures own title three tenant installments positive");
  expect(stdout).toContain("complete candidate.sql.review failing POST preserves catalog");
  expect(stdout).toContain("complete rollback.sql.review failing POST preserves catalog");
  expect(stdout).toContain("TOTAL 91 PASS; synthetic Auth, no hosted JWT/RLS certification");
}, pgBatteryTestTimeout(240_000));

it("keeps current-base downstream containment and refuses independent deadlock certification", async () => {
  const { stdout } = await runPgBattery("python3", [`${directory}/test-current-base.py`], { timeout: 180_000 });
  expect(stdout).toContain("two connections current internal base denial before row receipt no deadlock reproduction");
  expect(stdout).toContain("current writer remains false exact hash");
  expect(stdout).toContain("TOTAL 8 PASS; synthetic Auth; independent wrapper NO-GO");
}, pgBatteryTestTimeout(180_000));