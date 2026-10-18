import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  carregarUsuariosAdmin,
  definirStatusUsuario,
  montarArgsListagem,
  RPC_LISTAR_USUARIOS,
  RPC_STATUS_USUARIO,
} from "@/lib/configuracoes/usuariosListQuery";

const page = readFileSync("src/pages/Configuracoes.tsx", "utf8");
const edge = readFileSync("supabase/functions/create-user/index.ts", "utf8");
const passwordEdge = readFileSync("supabase/functions/admin-update-user-password/index.ts", "utf8");
const auth = readFileSync("src/hooks/useAuth.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261005192534_d3208b29-c579-4309-ac0f-29841ef48126.sql", "utf8");
const selfUpdateHardening = readFileSync("supabase/migrations/20261005194435_b6e4bda4-745c-4f51-a916-b76777281391.sql", "utf8");
const transactionalAB = readFileSync("supabase/migrations/20261005194622_91711015-fd68-40ef-a008-24d14cb3be1c.sql", "utf8");

describe("D51.4 Gate 1 — isolamento de usuários", () => {
  it("lista usuários por RPC tenant paginada e chave de cache por identidade", async () => {
    // Wiring da página: delega ao helper real e mantém chave tenant+usuário.
    expect(page).toContain('from "@/lib/configuracoes/usuariosListQuery"');
    expect(page).toContain("carregarUsuariosAdmin(");
    expect(page).toContain('profile?.organization_id, user?.id');
    expect(page).not.toContain('from("profiles")\n          .select("user_id, nome, email');

    // Contrato do helper real com client RPC fake (não apenas strings).
    const calls: Array<{ fn: string; args: unknown }> = [];
    const client = {
      rpc: (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return Promise.resolve({ data: { items: [{ user_id: "u1" }], total: 1 }, error: null });
      },
    };
    const args = montarArgsListagem({ search: " ana ", role: "all", status: "ativo", pagina: 2, porPagina: 10 });
    expect(args).toEqual({ p_search: "ana", p_role: null, p_active: true, p_offset: 10, p_limit: 10 });
    const pagina = await carregarUsuariosAdmin(client, args);
    expect(calls).toEqual([{ fn: RPC_LISTAR_USUARIOS, args }]);
    expect(pagina).toEqual({ items: [{ user_id: "u1" }], total: 1 });

    // Erro da RPC propaga sem mascaramento.
    const falha = { rpc: () => Promise.resolve({ data: null, error: new Error("permissão negada") }) };
    await expect(carregarUsuariosAdmin(falha, args)).rejects.toThrow("permissão negada");

    // Envelope inválido falha fechado.
    const invalido = { rpc: () => Promise.resolve({ data: { total: 0 }, error: null }) };
    await expect(carregarUsuariosAdmin(invalido, args)).rejects.toThrow("Resposta da listagem de usuários inválida.");
  });

  it("altera status somente pela RPC tenant", async () => {
    // Wiring da página: delega ao helper real; sem update direto em profiles.
    expect(page).toContain("definirStatusUsuario(");
    expect(page).not.toMatch(/from\("profiles"\)[\s\S]{0,120}update\(\{ ativo/);

    // Contrato do helper real: mesma RPC para ativar/desativar, retorno conferido.
    const calls: Array<{ fn: string; args: unknown }> = [];
    const client = {
      rpc: (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return Promise.resolve({ data: { success: true, user_id: "u1" }, error: null });
      },
    };
    await definirStatusUsuario(client, "u1", false);
    expect(calls).toEqual([{ fn: RPC_STATUS_USUARIO, args: { p_user_id: "u1", p_active: false } }]);

    // Erro da RPC propaga.
    const falha = { rpc: () => Promise.resolve({ data: null, error: new Error("sem alçada") }) };
    await expect(definirStatusUsuario(falha, "u1", true)).rejects.toThrow("sem alçada");

    // Retorno com user_id divergente é rejeitado (não confirma atualização alheia).
    const errado = { rpc: () => Promise.resolve({ data: { success: true, user_id: "u2" }, error: null }) };
    await expect(definirStatusUsuario(errado, "u1", true)).rejects.toThrow("Não foi possível confirmar a atualização do status.");

    // success ausente/falso também falha fechado.
    const semSucesso = { rpc: () => Promise.resolve({ data: { success: false, user_id: "u1" }, error: null }) };
    await expect(definirStatusUsuario(semSucesso, "u1", true)).rejects.toThrow("Não foi possível confirmar a atualização do status.");
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
    expect(auth).toMatch(/if \(identityChanged \|\| authorizationChanged \|\| !nextUserId\) \{[\s\S]*?queryClient\.clear\(\);/);
  });

  it("valida redefinição de senha no contexto autenticado do ator", () => {
    expect(passwordEdge).toContain("const anonClient = createClient");
    expect(passwordEdge).toContain("Authorization: authHeader");
    expect(passwordEdge).toContain('anonClient.rpc(\n      "admin_can_update_user_password_server"');
  });

  it("impede que autoedição direta altere tenant ou campos estruturais", () => {
    expect(selfUpdateHardening).toContain('DROP POLICY IF EXISTS "Users can update own profile"');
    expect(selfUpdateHardening).toContain('NEW.organization_id IS DISTINCT FROM OLD.organization_id');
    expect(selfUpdateHardening).toContain('NEW.email IS DISTINCT FROM OLD.email');
    expect(selfUpdateHardening).toContain('NEW.ativo IS DISTINCT FROM OLD.ativo');
    expect(selfUpdateHardening).not.toContain("NOT public.has_role(auth.uid(), 'administrador'");
  });

  it("mantém prova transacional A/B e contrato seguro da redefinição de senha", () => {
    expect(transactionalAB).toContain("d51_4_admin_a_profile_b_visible");
    expect(transactionalAB).toContain("d51_4_admin_a_role_b_visible");
    expect(transactionalAB).toContain("d51_4_admin_a_status_b_accepted");
    expect(transactionalAB).toContain("d51_4_admin_a_edit_b_accepted");
    expect(transactionalAB).toContain("d51_4_admin_a_password_b_accepted");
    expect(transactionalAB).toContain("d51_4_admin_a_superadmin_b_accepted");
    expect(transactionalAB).toContain("d51_4_admin_a_self_tenant_move_accepted");
    expect(transactionalAB).toContain("d51_4_admin_b_profile_a_visible");
    expect(transactionalAB).toContain("d51_4_admin_b_role_a_visible");
    expect(selfUpdateHardening).toContain("v_password_security_definer IS DISTINCT FROM false");
  });
});