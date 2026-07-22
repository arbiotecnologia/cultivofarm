import { describe, it, expect } from "vitest";
import {
  diffParitySnapshots,
  type ParitySnapshot,
} from "@/lib/fiscal/policyParityDiff";

const baseFingerprints = {
  policies: "a",
  rls: "b",
  object_grants: "c",
  views: "d",
  functions: "e",
  function_grants: "f",
  constraints: "g",
  global: "h",
};

function snap(overrides: Partial<ParitySnapshot> = {}): ParitySnapshot {
  return {
    phase: "fiscal-3.12-policy-parity",
    schema: "public",
    expected: { tables: [], views: [], functions: [] },
    policies: { count: 1, items: [{ table: "fiscal_invoices", policy: "p1" }] },
    rls: [{ table: "fiscal_invoices", exists: true, rls_enabled: true, rls_forced: false }],
    object_grants: [{ object: "fiscal_invoices", grantee: "authenticated", privilege: "SELECT" }],
    views: [{ view: "v_fiscal_company_readiness", exists: true, security_invoker: true }],
    functions: [{ name: "rpc_fiscal_event_manual", exists: true, security_definer: true }],
    function_grants: [{ function: "rpc_fiscal_event_manual", grantee: "authenticated", privilege: "EXECUTE" }],
    constraints: [{ table: "fiscal_invoices", name: "fk_x", type: "f" }],
    missing: { tables: [], views: [], functions: [] },
    fingerprints: { ...baseFingerprints },
    ...overrides,
  };
}

describe("diffParitySnapshots — igualdade", () => {
  it("dois snapshots idênticos = paridade total", () => {
    const r = diffParitySnapshots(snap(), snap());
    expect(r.globalEqual).toBe(true);
    for (const c of r.categories) expect(c.equal).toBe(true);
    expect(r.missingDiff.tables.onlyInA).toEqual([]);
    expect(r.missingDiff.tables.onlyInB).toEqual([]);
  });

  it("ordem de chaves não afeta igualdade", () => {
    const a = snap();
    const b = snap({
      rls: [{ rls_forced: false, rls_enabled: true, exists: true, table: "fiscal_invoices" }],
    });
    const r = diffParitySnapshots(a, b);
    expect(r.categories.find((c) => c.category === "rls")?.equal).toBe(true);
  });
});

describe("diffParitySnapshots — divergência", () => {
  it("detecta policy presente só em A", () => {
    const a = snap();
    const b = snap({ policies: { count: 0, items: [] } });
    const r = diffParitySnapshots(a, b);
    expect(r.globalEqual).toBe(false);
    const pol = r.categories.find((c) => c.category === "policies")!;
    expect(pol.equal).toBe(false);
    expect(pol.onlyInA).toHaveLength(1);
    expect(pol.onlyInB).toHaveLength(0);
  });

  it("detecta grant presente só em B", () => {
    const a = snap({ object_grants: [] });
    const b = snap();
    const r = diffParitySnapshots(a, b);
    const g = r.categories.find((c) => c.category === "object_grants")!;
    expect(g.onlyInA).toHaveLength(0);
    expect(g.onlyInB).toHaveLength(1);
  });

  it("detecta divergência em ausências (missing)", () => {
    const a = snap({ missing: { tables: ["fiscal_events"], views: [], functions: [] } });
    const b = snap();
    const r = diffParitySnapshots(a, b);
    expect(r.globalEqual).toBe(false);
    expect(r.missingDiff.tables.onlyInA).toEqual(["fiscal_events"]);
  });

  it("expõe fingerprints globais mesmo em divergência", () => {
    const a = snap();
    const b = snap({ fingerprints: { ...baseFingerprints, global: "z" } });
    const r = diffParitySnapshots(a, b);
    expect(r.globalFingerprintA).toBe("h");
    expect(r.globalFingerprintB).toBe("z");
  });
});
