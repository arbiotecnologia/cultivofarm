import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const sql = readFileSync("supabase/migrations/20261008173204_54750128-42c5-4dfd-a9d1-4774eb2f71be.sql", "utf8");
describe("BF02/03 static containment, not JWT evidence", () => {
  for (const [name, signature] of [
    ["assign_b2b_user_client_secure", "uuid,uuid,text,boolean,boolean,text"],
    ["unassign_b2b_user_client_secure", "uuid,uuid,text"],
    ["get_b2b_partner_clients_for_assignment_secure", "text"],
    ["cancel_b2b_receivable_secure", "uuid,text"],
  ]) {
    it(`${name} closes ACL and denies before resource lookup or effects`, () => {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      expect(start).toBeGreaterThanOrEqual(0);
      const body = sql.slice(start, sql.indexOf("END $body$;", start));
      expect(body).toContain("SECURITY DEFINER SET search_path TO ''");
      expect(body).toContain("IF auth.uid() IS NULL");
      expect(body).toContain("IF public.h15_actor_organization() IS NULL");
      expect(body).toContain("CONTRACT_UNAVAILABLE");
      expect(body).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE|RETURN QUERY|EXECUTE)\b/i);
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${name}(${signature}) FROM PUBLIC,anon,authenticated;`);
    });
  }
  for (const table of ["partner_clients", "partner_user_clients"]) {
    it(`${table} composes restrictive denial with historical policies`, () => {
      expect(sql).toContain(`ON public.${table} AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)`);
    });
  }
});