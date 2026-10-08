import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261008174953_15bb1a17-af95-4bb1-b587-feb65afc749e.sql", "utf8");
describe("P1A reviewed reader ACL — static, not SQL/JWT proof", () => {
  for (const signature of [
    "rpc_b2b_financial_kpis(date,date,uuid)", "rpc_b2b_governance_kpis()",
    "rpc_b2b_aging(uuid)", "rpc_b2b_aging_detalhado(date,date,uuid,text)",
    "rpc_b2b_partner_profitability(date,date,uuid)", "rpc_b2b_executive_alerts()",
    "rpc_portal_partner_financial()", "rpc_portal_partner_financial(uuid)",
  ]) {
    it(`${signature} closes every caller role without widening technical privileges`, () => {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC,anon,authenticated;`);
    });
  }
  it("preserves BF02/03, rows, definitions and already guarded credit endpoints", () => {
    const statements = sql.replace(/--[^\n]*/g, "");
    expect(statements).not.toMatch(/\b(GRANT|INSERT|UPDATE|DELETE|DROP|CREATE)\b/i);
    expect(statements).not.toContain("rpc_b2b_partner_credit");
    expect(statements).not.toContain("bf02_assignment_contract_containment");
  });
});