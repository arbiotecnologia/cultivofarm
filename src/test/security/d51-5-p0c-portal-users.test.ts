import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clearActivePortalContext } from "@/lib/activePortalContext";

const ROOT = resolve(__dirname, "../../..");
const edge = readFileSync(resolve(ROOT, "supabase/functions/list-portal-users/index.ts"), "utf8");
const ui = readFileSync(resolve(ROOT, "src/components/clientes/AcessoPortalTab.tsx"), "utf8");
const auth = readFileSync(resolve(ROOT, "src/hooks/useAuth.tsx"), "utf8");

describe("D51.5 P0-C — isolamento de usuários do portal", () => {
  it("valida JWT, organização ativa e papel antes do acesso privilegiado", () => {
    expect(edge).toContain("auth.getClaims(token)");
    expect(edge).toContain('"h15_actor_organization"');
    expect(edge).toContain('anonClient.rpc("has_role"');
    expect(edge.indexOf('.from("clientes")')).toBeLessThan(edge.indexOf("SUPABASE_SERVICE_ROLE_KEY"));
  });

  it("valida o cliente pela organização derivada do ator", () => {
    expect(edge).toContain("isUuid(clienteId)");
    expect(edge).toContain('.eq("organization_id", actorOrg)');
    expect(edge).not.toMatch(/body\?\.organization_id|body\.organization_id/);
  });

  it("só consulta papéis dos perfis validados no mesmo tenant", () => {
    expect(edge).toContain("const validatedUserIds");
    expect(edge).toContain('.in("user_id", validatedUserIds)');
  });

  it("retorna somente os campos de perfil consumidos pela tela", () => {
    expect(edge).toContain('.select("id, user_id, nome, email, ativo")');
    expect(edge).not.toMatch(/encrypted_password|refresh_token|access_token|phone_confirmed_at/);
  });

  it("usa CORS compartilhado e não aceita origem universal", () => {
    expect(edge).toContain("corsHeadersFor(origin)");
    expect(edge).toContain("isTrustedOrigin(origin)");
    expect(edge).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  it("recarrega na troca de identidade e o Auth limpa o cache", () => {
    expect(ui).toContain("const { user } = useAuth()");
    expect(ui).toContain("[clienteId, user?.id]");
    expect(ui).toContain("if (!current) return");
    expect(auth).toMatch(/if \(identityChanged \|\| authorizationChanged \|\| !nextUserId\) \{[\s\S]*?queryClient\.clear\(\);/);
    expect(auth).toMatch(/const signOut = async \(\) => \{[\s\S]*?queryClient\.clear\(\);/);
    localStorage.setItem("portal_active_cliente_id", "old");
    localStorage.setItem("portal_active_cliente_id:old-actor", "old-client");
    localStorage.setItem("v0-unrelated", "keep");
    clearActivePortalContext();
    expect(localStorage.getItem("portal_active_cliente_id")).toBeNull();
    expect(localStorage.getItem("portal_active_cliente_id:old-actor")).toBeNull();
    expect(localStorage.getItem("v0-unrelated")).toBe("keep");
    localStorage.removeItem("v0-unrelated");
  });
});