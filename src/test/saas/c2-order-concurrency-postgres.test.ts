import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("serializes canonical orders and billing with two real local PostgreSQL connections", async () => {
  const { stdout: output } = await promisify(execFile)("python3", ["scripts/owner-orders-20261023/credit-numeric-20261024/test-concurrency.py"], { encoding: "utf8", timeout: 240_000 });
  expect(output).toContain("TOTAL 177 PASS; synthetic Auth, no hosted JWT/RLS certification");
  expect(output).toContain("two sessions same key exactly one order and identical receipt");
  expect(output).toContain("two sessions changed fingerprint conflict one order");
  expect(output).toContain("two approvals na_entrega one transition no title");
  expect(output).toContain("two generators pre-delivery both denied all effects");
  expect(output).toContain("supported na_aprovacao approval versus generation exactly one title three installments");
  expect(output).toContain("two first generators supported na_aprovacao exactly one title three installments one link");
  expect(output).toContain("partial technical revocation retains manager create");
  expect(output).toContain("partial manager revocation technical residual cannot create");
  expect(output).toContain("revoked manager cannot replay own earlier receipt");
  expect(output).toContain("concurrency preserves credit LIVE body");
  expect(output).toContain("create first: approval waits on canonical trigger advisory lock");
  expect(output).toContain("approve first: create waits on trigger-held advisory lock");
  expect(output).toContain("baseline intermediate window approve row then generator receipt reproduces 40P01");
  expect(output).toContain("fixed same window generator waits row without receipt and both commit");
  expect(output).toContain("fixed na_entrega still denies premature billing exact 42501 no effects");
  expect(output).toContain("positive credit intermediate create versus approve formal=True");
  expect(output).toContain("same identity link revoked exact authorization and no effects");
  expect(output).toMatch(/TOTAL \d+ PASS; synthetic Auth, no hosted JWT\/RLS certification/);
}, 240_000);