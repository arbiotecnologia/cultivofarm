import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyFinalizeError, finalizeErrorResponse } from "../../../supabase/functions/_shared/platform-invite-errors.ts";

const migration = readFileSync("supabase/migrations/20261002052628_99b10aea-64fa-4968-a315-285560c83671.sql", "utf8");

describe("D51.2 — forward-fix da finalização", () => {
  it("aceita somente perfil sem organização ou da mesma organização", () => {
    expect(migration).toContain("p.organization_id IS NOT NULL");
    expect(migration).toContain("p.organization_id <> j.organization_id");
    expect(migration).toContain("p.organization_id IS NULL");
    expect(migration).toContain("p.organization_id = excluded.organization_id");
    expect(migration).toContain("organization_id = excluded.organization_id");
  });

  it("preserva dados ricos e limita o papel a administrador", () => {
    expect(migration).toContain("nullif(btrim(p.nome), '') IS NOT NULL");
    expect(migration).toContain("nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL");
    expect(migration).toContain("r.role <> 'administrador'::public.app_role");
    expect(migration).not.toContain("'superadmin'::public.app_role)");
  });

  it("mantém segurança, metadata e fencing", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("raw_app_meta_data->>'provisioning_request_id'");
    expect(migration).toContain("lease_token IS DISTINCT FROM p_lease_token");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.platform_finalize_org_admin_provisioning[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.platform_finalize_org_admin_provisioning[\s\S]*TO service_role/);
  });
});

describe("D51.2 — observabilidade allowlisted", () => {
  it.each([
    ["platform_profile_tenant_conflict", "profile_tenant_conflict"],
    ["platform_auth_metadata_mismatch", "auth_metadata_mismatch"],
    ["platform_stale_lease", "stale_lease"],
    ["platform_authorization_failed", "authorization_failed"],
    ["platform_database_constraint", "database_constraint"],
    ["erro interno com dado arbitrário", "finalize_internal_error"],
  ])("classifica %s sem devolver detalhe bruto", (raw, expected) => {
    const code = classifyFinalizeError({ message: raw });
    expect(code).toBe(expected);
    expect(finalizeErrorResponse(code).message).not.toContain(raw);
  });
});