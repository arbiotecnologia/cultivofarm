import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("serializes canonical orders and billing with two real local PostgreSQL connections", async () => {
  const { stdout: output } = await promisify(execFile)("python3", ["scripts/owner-orders-20261023/credit-numeric-20261024/test-concurrency.py"], { encoding: "utf8", timeout: 240_000 });
  expect(output).toContain("TOTAL 148 PASS; synthetic Auth, no hosted JWT/RLS certification");
  expect(output).toContain("two sessions same key exactly one order and identical receipt");
  expect(output).toContain("two sessions changed fingerprint conflict one order");
  expect(output).toContain("two approvals na_entrega one transition no title");
  expect(output).toContain("two generators pre-delivery both denied all effects");
  expect(output).toContain("supported na_aprovacao approval versus generation exactly one title three installments");
  expect(output).toContain("partial technical revocation retains manager create");
  expect(output).toContain("partial manager revocation technical residual cannot create");
  expect(output).toContain("revoked manager cannot replay own earlier receipt");
  expect(output).toContain("concurrency preserves credit LIVE body");
  expect(output).toMatch(/TOTAL \d+ PASS; synthetic Auth, no hosted JWT\/RLS certification/);
}, 240_000);