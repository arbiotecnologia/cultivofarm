import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("docs/auditorias/fixtures-rbac-20261007T214515Z.manifest.json", "utf8"));

describe("manifesto sanitizado de fixtures RBAC", () => {
  it("permanece vinculado exclusivamente à produção canônica", () => {
    expect(manifest.canonical_project_ref).toBe("swzpzcwiasxmjutrmvkm");
    expect(manifest.run_id).toMatch(/^AUDIT-RBAC-20261007-\d{8}T\d{6}Z$/);
  });

  it("separa quatro tenants planejados de registros efetivamente criados", () => {
    expect(manifest.planned_tenants.map((tenant: { plan: string }) => tenant.plan)).toEqual(["base", "essencial", "gestao", "completo"]);
    for (const tenant of manifest.planned_tenants) expect(tenant.name.startsWith(manifest.run_id)).toBe(true);
    expect(manifest.created).toEqual([]);
  });

  it("inclui treze papéis operacionais e não planeja novo superadmin", () => {
    const roles = [...manifest.planned_internal_roles, ...manifest.planned_external_roles];
    expect(new Set(roles).size).toBe(13);
    expect(roles).not.toContain("superadmin");
    expect(manifest.platform_identity).toBe("EXISTING_SUPERADMIN_ONLY");
  });

  it("mantém hashes de baseline e limpeza por IDs sem apagar histórico", () => {
    for (const table of Object.values(manifest.baseline.tables) as { count: number; hash: string }[]) {
      expect(table.count).toBeGreaterThanOrEqual(0);
      expect(table.hash).toMatch(/^[a-f0-9]{32}$/);
    }
    expect(manifest.cleanup.exact_ids_only).toBe(true);
    expect(manifest.cleanup.auth_via_admin_api_only).toBe(true);
    expect(manifest.cleanup.immutable_history_deletion).toBe(false);
  });

  it("não armazena campos de credencial ou tokens", () => {
    const walk = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        expect(key).not.toMatch(/^(password|senha|access_token|refresh_token|service_role_key|action_link|manual_link|jwt)$/i);
        if (typeof child === "string") expect(child).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
        walk(child);
      }
    };
    walk(manifest);
  });
});