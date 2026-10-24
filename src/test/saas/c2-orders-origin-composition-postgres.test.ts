import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("C2 external origin: captured chain, delivery billing denied and numeric blocker in disposable PostgreSQL", () => {
  const output = execFileSync("python3", ["scripts/owner-orders-20261023/internal-origin-composition-20261023/test-local.py"], { encoding: "utf8", timeout: 120_000 });
  expect(output).toContain("TOTAL 69 PASS; synthetic Auth, no hosted JWT/RLS certification");
  expect(output).toContain("na_entrega external approval no title singleton/cumulative");
  expect(output).toContain("na_entrega before delivery billing denied no effects");
  expect(output).toContain("na_entrega operational still denied entregue");
  expect(output).toContain("known numeric6,2 limit1 exposure180 SQLSTATE22003 no effects");
  expect(output).toContain("known overflow full create rolls back no effects");
  expect(output).toContain("candidate leaves writer containment false");
}, 120_000);