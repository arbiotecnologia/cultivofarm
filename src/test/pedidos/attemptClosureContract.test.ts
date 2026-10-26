import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? (p.startsWith("src/test") ? [] : walk(p)) : [p]; });
import { ATTEMPT_CLOSURE_RPC_ENABLED, parseAttemptClosure } from "@/lib/authz/attemptClosureContract";

const C = "C2_ORDER_ATTEMPT_CLOSURE_V1";
it("permanece desativado e sem consumidores na aplicação", () => {
  expect(ATTEMPT_CLOSURE_RPC_ENABLED).toBe(false);
  const users = walk("src").filter(p => /\.(ts|tsx)$/.test(p) && readFileSync(p, "utf8").includes("attemptClosureContract"));
  expect(users).toEqual([]);
  expect(readFileSync("src/hooks/useCreatePartnerOrder.ts", "utf8")).not.toContain("close_partner_order_attempt_v1");
});
it("somente closed libera abandono; committed traz o pedido", () => {
  expect(parseAttemptClosure({ contract: C, state: "closed" })).toEqual({ state: "closed" });
  expect(parseAttemptClosure({ contract: C, state: "committed", order_id: "o1", numero: "PB-1" }))
    .toEqual({ state: "committed", orderId: "o1", numero: "PB-1" });
});
it.each([
  [{ contract: C, state: "in_progress" }], [{ contract: C, state: "absent" }], [{ state: "closed" }],
  [{ contract: "OTHER", state: "closed" }], [null], [[]], ["closed"],
])("ausência/timeout/formato desconhecido => unknown (%j)", data => {
  expect(parseAttemptClosure(data).state).toBe("unknown");
});
