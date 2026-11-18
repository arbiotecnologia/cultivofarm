import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const dir = "scripts/b2b-financeiro-role-20261117/receipt-shape";
it("recibo real nega Financeiro antes do delta e conclui claim/perfil/finish exclusivo depois, com Auth sintética", async () => {
  const before = readFileSync(`${dir}/02-install.sql.review`, "utf8");
  await promisify(execFile)("python3", [`${dir}/build.py`]);
  expect(readFileSync(`${dir}/02-install.sql.review`, "utf8")).toBe(before);
  const { stdout } = await runPgBattery("python3", [`${dir}/test_pg.py`], { encoding: "utf8" });
  for (const name of ["old_claim_reproduces_23514", "old_claim_no_partial_receipt", "finance_singleton",
    "legacy_null", "legacy_three", "deny_finance_plus_parceiro_b2b", "deny_finance_plus_parceiro_b2b_tecnico",
    "deny_finance_plus_cliente_produtor", "deny_finance_plus_financeiro", "deny_empty", "deny_null_element",
    "auth_trigger_unprivileged_profile", "finish_real", "finish_exclusive_role", "finish_exact_link",
    "rollback_history_refused", "post_rollback", "drift_aborts"]) {
    expect(stdout).toContain(`PASS ${name}\n`);
  }
  expect(stdout).toContain("TOTAL 71 PASS");
}, pgBatteryTestTimeout(120_000));