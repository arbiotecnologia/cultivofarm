import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("C2 external origin: captured chain, delivery billing denied and numeric blocker in disposable PostgreSQL", async () => {
  // Assíncrono: um execFileSync > 60 s bloqueia o event loop do worker e estoura o RPC onTaskUpdate do Vitest.
  const { stdout: output } = await runPgBattery("python3", ["scripts/owner-orders-20261023/internal-origin-composition-20261023/test-local.py"], { encoding: "utf8", timeout: 400_000 });
  expect(output).toContain("TOTAL 84 PASS; synthetic Auth, no hosted JWT/RLS certification");
  expect(output).toContain("na_entrega external approval no title singleton/cumulative");
  expect(output).toContain("na_entrega before delivery billing denied no effects");
  expect(output).toContain("na_entrega operational still denied entregue");
  expect(output).toContain("known numeric6,2 limit1 exposure180 SQLSTATE22003 no effects");
  expect(output).toContain("known overflow full create rolls back no effects");
  expect(output).toContain("candidate leaves writer containment false");
  expect(output).toContain("containment rejects body drift atomically");
  expect(output).toContain("containment rejects ACL drift atomically");
  expect(output).toContain("contained external approval/billing denied no effects");
  expect(output).toContain("internal approval original downstream denial preserved after containment");
  expect(output).toContain("internal billing original downstream denial preserved after containment");
}, pgBatteryTestTimeout(420_000)); // Postgres descartável: ~60 s isolado, mais lento sob a suíte paralela.
