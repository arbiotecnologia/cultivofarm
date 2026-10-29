import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Price candidato AR Bio x FSF (offline)", () => {
  it("motor Price e rejeições passam sem falhas", () => {
    const out = execFileSync("python3", ["scripts/financial-installments-initial-20261024/price-schedule.py"], { encoding: "utf8" });
    const r = JSON.parse(out.split("\n")[0]);
    expect(r.fail).toBe(0);
    expect(r.total).toBe(314);
  });
});
