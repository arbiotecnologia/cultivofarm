import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("creates exact immutable installments once, with tenant isolation and full transaction rollback", async () => {
  const { stdout: output } = await runPgBattery("python3", ["scripts/financial-installments-initial-20261024/test-local.py"], { encoding: "utf8", timeout: 180_000 });
  for (const kind of ["receivable", "payable"]) {
    expect(output).toContain(`baseline ${kind} 1/3 snapshot failure`);
    expect(output).toContain(`${kind} b 1/3 exact initial cents`);
    expect(output).toContain(`${kind} .99/3`);
    expect(output).toContain(`${kind} .01/3`);
    expect(output).toContain(`${kind} custom dates inserted first`);
    expect(output).toContain(`${kind} later snapshot mutation`);
    expect(output).toContain(`${kind} late failure all effects rollback`);
  }
  expect(output).toContain("B foreign customer A");
  expect(output).toContain("full candidate.sql.review POST failure atomic");
  expect(output).toContain("full rollback.sql.review POST failure atomic");
  expect(output).toContain("no hosted JWT/RLS certification");
}, pgBatteryTestTimeout(180_000));