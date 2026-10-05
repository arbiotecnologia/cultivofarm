import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/Configuracoes.tsx", "utf8");
const edge = readFileSync("supabase/functions/create-user/index.ts", "utf8");
const passwordEdge = readFileSync("supabase/functions/admin-update-user-password/index.ts", "utf8");
const auth = readFileSync("src/hooks/useAuth.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261005192534_d3208b29-c579-4309-ac0f-29841ef48126.sql", "utf8");

describe("D51.4 Gate 1 — isolamento de usuários", () => {
  it("lista usuários por RPC tenant paginada e chave de cache por identidade", () => {
    expect(page).toContain('rpc("tenant_admin_list_users"');
    expect(page).toContain('profile?.organization_id, user?.id');
    expect(page).not.toContain('from("profiles")\n          .select("user_id, nome, email');
  });

  it("altera status somente pela RPC tenant", () => {
    expect(page).toContain('rpc("tenant_admin_set_user_active"');
    expect(page).not.toMatch(/from\("profiles"\)[\s\S]{0,120}update\(\{ ativo/);
  });

  it("create-user deriva organização do ator e proíbe escopo enviado pelo browser", () => {
    expect(edge).toContain('.eq("user_id", callerId)');
    expect(edge).toContain("organization_id: actorOrganizationId");
    expect(edge).not.toMatch(/const \{[^}]*organization_id[^}]*\} = body/);
    expect(edge).toContain("tenant_role_unavailable");
    expect(edge).toContain("tenant_link_scope_unavailable");
    expect(edge).toContain("deleteUser(userId)");
  });

  it("RLS e RPCs usam organização derivada e bloqueiam superadmin", () => {
    expect(migration).toContain("platform_private.current_user_organization_id()");
    expect(migration).toContain("platform_private.is_tenant_admin_for_user");
    expect(migration).toContain("NOT public.is_platform_superadmin");
    expect(migration).toContain("role <> 'superadmin'");
    expect(migration).toContain("user_edit_unscoped_links_forbidden");
  });

  it("troca de identidade limpa todo o cache antes de carregar o próximo tenant", () => {
    expect(auth).toMatch(/if \(identityChanged\) \{[\s\S]*?queryClient\.clear\(\);/);
  });

  it("valida redefinição de senha no contexto autenticado do ator", () => {
    expect(passwordEdge).toContain("const scopedClient = createClient");
    expect(passwordEdge).toContain("Authorization: authHeader");
    expect(passwordEdge).toContain('scopedClient.rpc(\n      "admin_can_update_user_password_server"');
  });
});