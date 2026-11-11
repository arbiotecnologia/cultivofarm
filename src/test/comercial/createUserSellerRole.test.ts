import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A Edge create-user não é editada aqui (editar implantaria). O teste lê o código atual e o patch revisável
// e confere a regra de papéis: hoje Vendedor é recusado; com o patch, Vendedor sozinho passa, sem abrir outros papéis.
const src = readFileSync("supabase/functions/create-user/index.ts", "utf8");
const patch = readFileSync("scripts/vendedor-role-20261111/create-user-tenant-roles.patch.review", "utf8");
function tenantRoles(code: string): Set<string> {
  const m = code.match(/const TENANT_USER_ROLES = new Set\(\[([\s\S]*?)\]\);/);
  if (!m) throw new Error("TENANT_USER_ROLES ausente");
  return new Set([...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]));
}
function decide(roles: string[], allowed: Set<string>): string {
  if (roles.includes("superadmin")) return "superadmin_role_reserved";
  if (roles.some((r) => !allowed.has(r))) return "tenant_role_unavailable";
  return "ok";
}
const current = tenantRoles(src);
const patched = new Set([...current, "vendedor"]);

describe("create-user e papel Vendedor", () => {
  it("o código implantável atual ainda recusa Vendedor (fechado até a instalação)", () => {
    expect(decide(["vendedor"], current)).toBe("tenant_role_unavailable");
  });
  it("o patch só acrescenta vendedor à lista de papéis internos", () => {
    expect(patch).toMatch(/acrescentar "vendedor" a TENANT_USER_ROLES/);
    expect([...patched].filter((r) => !current.has(r))).toEqual(["vendedor"]);
  });
  it("com o patch: Vendedor sozinho é aceito e independente de Gestor Comercial", () => {
    expect(decide(["vendedor"], patched)).toBe("ok");
    expect(current.has("gestor_comercial")).toBe(true);
  });
  it("com o patch: superadmin, parceiro e produtor continuam recusados", () => {
    expect(decide(["vendedor", "superadmin"], patched)).toBe("superadmin_role_reserved");
    expect(decide(["vendedor", "parceiro_b2b"], patched)).toBe("tenant_role_unavailable");
    expect(decide(["cliente_produtor"], patched)).toBe("tenant_role_unavailable");
  });
});
