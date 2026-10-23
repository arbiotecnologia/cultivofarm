import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("C2-ORD P1: actual captured finance functions in disposable PostgreSQL, not hosted Auth", () => {
  const output = execFileSync("python3", ["scripts/owner-orders-20261023/test-local.py"], { encoding: "utf8" });
  expect(output).toContain("TOTAL 68 PASS");
  expect(output).toContain("duas conexões reais: replay mesmo UUID");
  expect(output).toContain("RPC aprovação: falha tardia partner_order_financial_links");
  expect(output).toContain("P1 real: ownorg legado/owner autorizados");
}, 60_000);