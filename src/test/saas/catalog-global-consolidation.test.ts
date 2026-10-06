import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20261006190720_e2db3d80-7c5c-4117-9ff4-e632456202ca.sql", "utf8");

describe("Consolidação catálogo global / preço B2B", () => {
  it("resolvedores com partner_id arbitrário ficam só para service_role", () => {
    for (const fn of ["fn_resolve_b2b_cart", "fn_b2b_cart_hash", "fn_resolve_commercial_price"]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`));
    }
  });
  it("remove mutação de catálogo global por papel de tenant", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Staff manage global products" ON public.produtos;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Admin and Agronomo can insert/update microrganismos" ON public.microrganismos;');
  });
  it("leitura interna exige entitlement catalogo_precos com bypass explícito de superadmin", () => {
    expect(sql).toContain("public.is_platform_superadmin(_uid)");
    expect(sql).toContain("public.fn_authz_uid_scope_ok(_uid)");
    expect(sql).toContain("e.feature_key = 'catalogo_precos'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.can_view_catalog_internal(uuid) FROM PUBLIC, anon;");
  });
});
