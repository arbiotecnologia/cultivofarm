import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("credit arithmetic keeps exact decisions, atomic create and delivery billing containment", async () => {
  // Assíncrono: um execFileSync > 60 s bloqueia o event loop do worker e estoura o RPC onTaskUpdate do Vitest.
  const { stdout: output } = await runPgBattery("python3", ["scripts/owner-orders-20261023/credit-numeric-20261024/test-local.py"], { encoding: "utf8", timeout: 180_000 });
  expect(output).toContain("TOTAL 123 PASS; synthetic Auth, no hosted JWT/RLS certification");
  expect(output).toContain("credit overflow fixed");
  expect(output).toContain("credit small limit large exposure");
  expect(output).toContain("approval_required limit1 exposure180 exactly18000");
  expect(output).toContain("OVERDUE_BLOCK precedence");
  expect(output).toContain("numeric create replay idempotent sameID unchanged");
  expect(output).toContain("numeric late create failure rollback order children audits key");
  expect(output).toContain("numeric na_entrega premature billing denied all effects");
  expect(output).toContain("rebased POST full dependencies RLS ACL writerfalse");
}, pgBatteryTestTimeout(180_000));
