// bun test scripts/financial-report-receivables/helpers.test.ts
import { expect, test } from "bun:test";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const H = import.meta.dir;
const dir = mkdtempSync(join(tmpdir(), "arrep-"));
writeFileSync(join(dir, "fe.ts"), readFileSync(join(H, "frontend-candidate/reportRpcArgs.ts.review"), "utf8"));
const edgeSrc = readFileSync(join(H, "edge-candidate/index.ts.review"), "utf8");
const start = edgeSrc.indexOf("const RECEIVABLES_KEYS"), end = edgeSrc.indexOf("function isBody");
writeFileSync(join(dir, "edge.ts"), edgeSrc.slice(start, end));
const fe = await import(join(dir, "fe.ts"));
const edge = await import(join(dir, "edge.ts"));
const ok = { from: "2026-10-01", to: "2026-10-31" };
for (const [name, fn] of [["frontend", fe.receivablesFilters], ["edge", edge.receivablesFilters]] as const) {
  test(`${name}: allowlisted filters pass`, () => {
    expect(fn({ ...ok, status: "OPEN", customer_id: "" })).toEqual({ ...ok, status: "OPEN" });
  });
  test(`${name}: tenant/unknown keys, legacy nesting and bad dates rejected`, () => {
    for (const bad of [{ ...ok, organization_id: "x" }, { ...ok, tenant_id: "x" }, { _filters: ok }, { from: ok.from },
      { from: "2026-10-31", to: "2026-10-01" }, { from: "01/10/2026", to: ok.to }, { ...ok, status: 1 }]) expect(fn(bad as never)).toBeNull();
  });
}
test("frontend: receivables encapsulated; other reports unchanged (still denied server-side)", () => {
  expect(fe.reportRpcArgs("receivables", ok)).toEqual({ _filters: ok });
  expect(fe.reportRpcArgs("receivables", { _filters: ok })).toBeNull();
  expect(fe.reportRpcArgs("payables", ok)).toBe(ok);
});
test("edge delta vs live v90 touches only receivables encapsulation", () => {
  const live = readFileSync(join(H, "edge-candidate/live-v90.index.ts"), "utf8");
  expect(live).not.toContain("_filters");
  expect(edgeSrc).toContain("rpcArgs = { _filters: filters }");
  expect(edgeSrc).not.toContain("createSignedUrl");
  expect(edgeSrc).not.toContain("SERVICE_ROLE");
  const strip = (s: string) => s.replace(/const RECEIVABLES_KEYS[\s\S]*?\n}\n\n/, "").replace(/    \/\/ Only `receivables`[\s\S]*?await supabase\.rpc\(rpcName, rpcArgs as never\);/, "X")
    .replace(/    \/\/ Call the RPC with filters as params\n    const \{ data, error \} = await supabase\.rpc\(rpcName, body\.filters as never\);/, "X");
  expect(strip(edgeSrc)).toBe(strip(live));
});
