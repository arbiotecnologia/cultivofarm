import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("scripts/rbac-audit/proposed-tenant-catalog-visibility.sql", "utf8");
const rb = readFileSync("scripts/rbac-audit/rollback-tenant-catalog-visibility.sql", "utf8");
const rt = readFileSync("scripts/rbac-audit/runtime-test-tenant-catalog-visibility.sql", "utf8");
const code = sql.replace(/--.*$/gm, "");

describe("SQL candidato de visibilidade por empresa", () => {
  it("não altera tabelas globais nem suas policies/grants", () => {
    expect(code).not.toMatch(/ALTER TABLE public\.(produtos|microrganismos|culturas|formulacoes|catalogo_volumes)\b/i);
    expect(code).not.toMatch(/(CREATE|DROP|ALTER) POLICY/i);
    expect(code).not.toMatch(/GRANT[^;]*ON (TABLE )?public\.(produtos|microrganismos|culturas|formulacoes|catalogo_volumes)/i);
    expect(code).not.toMatch(/(UPDATE|DELETE FROM|INSERT INTO) public\.(produtos|microrganismos|culturas|formulacoes|catalogo_volumes)\b/i);
  });
  it("RPCs públicas sem parâmetro de empresa e anon revogado", () => {
    const pub = code.match(/CREATE FUNCTION public\.tenant_catalog_[\s\S]*?\)/g) ?? [];
    expect(pub.length).toBe(4);
    for (const f of pub) expect(f).not.toMatch(/organization|tenant_id|empresa/i);
    expect(code.match(/SECURITY INVOKER/g)?.length).toBe(4);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.tenant_catalog_set_visibility[^;]*FROM PUBLIC,anon/);
  });
  it("cores DEFINER com search_path vazio e tabelas sem grant a clientes", () => {
    const definers = code.match(/SECURITY DEFINER SET search_path=''/g) ?? [];
    expect(definers.length).toBe(5);
    expect(code).toMatch(/REVOKE ALL ON public\.catalog_tenant_visibility, public\.catalog_tenant_visibility_ledger FROM PUBLIC, anon, authenticated/);
    expect(code).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });
  it("SA negado, CAS, lock, idempotência e inativo não reexibido", () => {
    for (const k of ["catalog_visibility_platform_actor_denied", "catalog_visibility_version_conflict", "pg_advisory_xact_lock",
      "catalog_visibility_idempotency_conflict", "catalog_visibility_item_inactive", "ctvl_idem_unique", "catalog_visibility_ledger_immutable"]) {
      expect(code).toContain(k);
    }
  });
  it("rollback só revoga entrada nova, sem DROP/DELETE nem grant global", () => {
    const r = rb.replace(/--.*$/gm, "");
    expect(r).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
    expect(r).not.toMatch(/\bGRANT\b/i);
    expect(r.match(/REVOKE EXECUTE/g)?.length).toBe(8);
  });
  it("lock ator+empresa+chave antes do lock de item (ordem fixa)", () => {
    const k = code.indexOf("'ctvk'"); const i = code.indexOf("'ctv',v_org");
    expect(k).toBeGreaterThan(0); expect(i).toBeGreaterThan(k);
  });
  it("seletor de cultura e ocultos sem gate comercial; mutação e gestão exigem catalogo_precos", () => {
    expect(code).toMatch(/p_mode IN \('mutate','read_catalog','read_management'\) AND NOT public\._saas_user_has_feature\(v_uid, 'catalogo_precos'\)/);
    expect(code).toMatch(/'cultura' THEN 'read_selection_cultura'/);
    expect(code).toMatch(/catalog_tenant_actor\('read_prefs'\)/);
  });
  it("include não duplica página e não rebaixa visível", () => {
    expect(code).toMatch(/\(m\.ativo IS TRUE AND m\.hidden IS FALSE\), false, NULL::bigint/);
    expect(code).toMatch(/m\.id NOT IN \(SELECT pg2\.id FROM page pg2\)/);
  });
  it("runtime separa SKIP e usa authenticated com rollback", () => {
    expect(rt).toMatch(/SET LOCAL ROLE authenticated/);
    expect(rt).toMatch(/FILTER \(WHERE ok AND NOT skipped\) AS pass/);
    expect(rt.trim().endsWith("ROLLBACK;")).toBe(true);
  });
});
