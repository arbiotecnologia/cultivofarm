import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("internal portfolio entry candidate: A/B isolation, accounting gate, hash/idempotency, atomic rollback", async () => {
  const { stdout } = await runPgBattery("python3", ["scripts/commercial-order-entry-20261024/test-local.py"], { timeout: 290_000 });
  for (const line of ["baseline internal A portfolio simulate denied forbidden_partner", "internal A foreign B partner simulate denied, no effects",
    "internal B create on A partner denied, no effects", "technician denial unchanged", "accounting gate preserved: DRAFT create denied, no effects",
    "idempotent replay returns same order with no new writes", "preparation/create generated no title, installment or link",
    "internal+external multi-profile falls back to unchanged LIVE path, no bypass", "rollback restores exact LIVE scope and removes new functions",
    "writer still false", "TOTAL 54 PASS; synthetic Auth, no hosted JWT/RLS certification"]) expect(stdout).toContain(line);
}, pgBatteryTestTimeout(300_000));
