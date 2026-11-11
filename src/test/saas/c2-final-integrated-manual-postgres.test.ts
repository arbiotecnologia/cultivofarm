import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("integrates reconciled origin, receipt lock order and the LIVE manual installments correction", async () => {
  const directory = "scripts/owner-orders-20261023/credit-numeric-20261024/final-integrated-manual-20261024";
  const { stdout } = await runPgBattery("python3", [`${directory}/origin/test-local.py`], { timeout: 470_000 });
  expect(stdout).toContain("LIVE manual correction bodies and private context table reproduce deployed MD5s");
  expect(stdout).toContain("composed manual receivable 1/3 exact .34/.33/.33 inserted first");
  expect(stdout).toContain("composed manual payable 1/3 exact .34/.33/.33 inserted first");
  expect(stdout).toContain("composed manual receivable custom dates inserted first");
  expect(stdout).toContain("composed manual payable custom dates inserted first");
  expect(stdout).toContain("composed AR is neither historical composed nor plain LIVE manual hash");
  expect(stdout).toContain("composed current baseline intermediate barrier reproduces exact 40P01");
  expect(stdout).toContain("integrated fixed same barrier waits row without receipt both commit");
  expect(stdout).toContain("integrated fixed one title three tenant A installments one link");
  expect(stdout).toContain("B same fixtures own title three tenant installments positive");
  expect(stdout).toContain("complete candidate.synthetic-owner.sql failing POST preserves catalog");
  expect(stdout).toContain("complete containment.sql.review failing POST preserves catalog");
  expect(stdout).toContain("containment preserves corrected wrapper exact hash");
  expect(stdout).toContain("LIVE numeric exact preserved");
  expect(stdout).toContain("revoked manager rejected with no writes");
  expect(stdout).toContain("candidate starts with owner A accounting gate before any guard/DDL");
  for (const label of ["owner A configuration absent", "owner A DRAFT with NULL attestation", "owner A VALIDATED status but NULL accounting_validated_at", "owner A NULL CNPJ", "owner A only inactive configuration"]) {
    expect(stdout).toContain(`direct candidate rejected atomically before DDL: ${label}`);
  }
  expect(stdout).toContain("A attestation cannot change while gate transaction is open");
  expect(stdout).toContain("second active A configuration conflicts on partial unique index");
  expect(stdout).toContain("owner B settings are not locked by A gate");
  expect(stdout).toContain("inactive candidate applied directly with validated synthetic owner");
  expect(stdout).toContain("TOTAL 127 PASS");
  expect(stdout).toContain("synthetic Auth, no hosted JWT/RLS certification");
}, pgBatteryTestTimeout(480_000));
