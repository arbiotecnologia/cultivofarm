import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("integrates current origin, receipt lock order, tenants and full-command atomic containment", async () => {
  const directory = "scripts/owner-orders-20261023/credit-numeric-20261024/final-integrated-20261024";
  const { stdout } = await runPgBattery("python3", [`${directory}/origin/test-local.py`], { timeout: 240_000 });
  expect(stdout).toContain("composed current baseline intermediate barrier reproduces exact 40P01");
  expect(stdout).toContain("integrated fixed same barrier waits row without receipt both commit");
  expect(stdout).toContain("integrated fixed one title three tenant A installments one link");
  expect(stdout).toContain("B same fixtures own title three tenant installments positive");
  expect(stdout).toContain("NULL title tenant exact canonical denial");
  expect(stdout).toContain("crossed installment parent exact canonical denial");
  expect(stdout).toContain("complete candidate.sql.review failing POST preserves catalog");
  expect(stdout).toContain("complete containment.sql.review failing POST preserves catalog");
  expect(stdout).toContain("containment preserves corrected wrapper exact hash");
  expect(stdout).toContain("LIVE numeric exact preserved");
  expect(stdout).toContain("revoked manager rejected with no writes");
  expect(stdout).toContain("synthetic Auth, no hosted JWT/RLS certification");
}, pgBatteryTestTimeout(240_000));