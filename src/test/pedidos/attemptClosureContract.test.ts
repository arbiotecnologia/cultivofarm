import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? (p.startsWith("src/test") ? [] : walk(p)) : [p]; });
import { ATTEMPT_CLOSURE_RPC_ENABLED, parseAttemptClosure } from "@/lib/authz/attemptClosureContract";

const C = "C2_ORDER_ATTEMPT_CLOSURE_V1";
it("consumido somente pelo hook de verificação por clique; create nunca chama close", () => {
  expect(ATTEMPT_CLOSURE_RPC_ENABLED).toBe(true);
  const users = walk("src").filter(p => /\.(ts|tsx)$/.test(p) && readFileSync(p, "utf8").includes("attemptClosureContract"));
  console.log("USERS", users); expect(users).toEqual(["src/hooks/useCloseOrderAttempt.ts"]);
  const rpcUsers = walk("src").filter(p => /\.(ts|tsx)$/.test(p) && readFileSync(p, "utf8").includes("close_partner_order_attempt_v1"));
  expect(rpcUsers).toEqual(["src/hooks/useCloseOrderAttempt.ts"]);
});
it("somente closed libera abandono; committed traz o pedido", () => {
  expect(parseAttemptClosure({ contract: C, state: "closed" })).toEqual({ state: "closed" });
  const id = "405ff73f-1667-43a3-a41c-56d9500dfd8b";
  expect(parseAttemptClosure({ contract: C, state: "committed", order_id: id, numero: "PB-1" }))
    .toEqual({ state: "committed", orderId: id, numero: "PB-1" });
});
it.each([
  [{ contract: C, state: "absent" }], [{ contract: C, state: "committed", order_id: "o1", numero: "PB-1" }],
  [{ contract: C, state: "committed", order_id: "405ff73f-1667-43a3-a41c-56d9500dfd8b", numero: " " }], [{ state: "closed" }],
  [{ contract: "OTHER", state: "closed" }], [null], [[]], ["closed"],
])("ausência/timeout/formato desconhecido => unknown (%j)", data => {
  expect(parseAttemptClosure(data).state).toBe("unknown");
});
it("in_progress é distinto, mas não conclusivo", () => {
  expect(parseAttemptClosure({ contract: C, state: "in_progress" })).toEqual({ state: "in_progress" });
});
