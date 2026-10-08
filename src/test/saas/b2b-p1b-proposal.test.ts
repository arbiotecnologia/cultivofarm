import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const proposal = readFileSync("restoration/b2b-p1b/mandate-schema.proposed.sql", "utf8");
const executable = proposal.replace(/--[^\n]*/g, "");

describe("P1B proposed inactive schema — static, not PostgreSQL/JWT proof", () => {
  it("cannot approve a mandate, even through a privileged insert", () => {
    expect(executable).toContain("NEW.status IS DISTINCT FROM 'DRAFT'");
    expect(executable).toContain("mandate_activation_unavailable");
    expect(executable).toContain("BEFORE INSERT OR UPDATE OR DELETE");
    expect(executable).toContain("TG_OP <> 'INSERT'");
  });
  it("keeps A and P distinct with explicit creditor and issuer", () => {
    expect(executable).toContain("NEW.contractor_organization_id = NEW.partner_organization_id");
    expect(executable).toContain("p.commercial_owner_organization_id = NEW.contractor_organization_id");
    expect(executable).toContain("o.partner_account_id = NEW.partner_account_id");
    expect(executable).toContain("c.organization_id = NEW.creditor_organization_id");
    expect(executable).toContain("NEW.issuer_organization_id NOT IN");
  });
  it("requires bounded time, exact predecessor and an allowlisted action scope", () => {
    expect(executable).toContain("NEW.valid_until <= NEW.valid_from");
    expect(executable).toContain("NOT isfinite(NEW.valid_until)");
    expect(executable).toContain("NOT NEW.action_scope <@ ARRAY[");
    expect(executable).toContain("m.revision = NEW.revision - 1");
  });
  it("has grants before RLS, but no caller write or activation grants", () => {
    const grants = executable.indexOf("GRANT SELECT ON public.b2b_operation_mandates TO authenticated");
    expect(grants).toBeGreaterThan(0);
    expect(grants).toBeLessThan(executable.indexOf("ENABLE ROW LEVEL SECURITY"));
    expect(executable).toContain("AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)");
    expect(executable).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|EXECUTE)/i);
  });
  it("does not rewrite historical rows or reopen BF/P1A functions", () => {
    expect(executable).not.toMatch(/\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|DROP|TRUNCATE)\b/i);
    expect(executable).not.toMatch(/GRANT[^;]*(?:assign_b2b|cancel_b2b|rpc_b2b|rpc_portal)/i);
    expect(executable).not.toContain("SECURITY DEFINER");
  });
});