import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const settingsPage = readFileSync("src/pages/Configuracoes.tsx", "utf8");
const appearance = readFileSync("src/components/configuracoes/AparenciaTab.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const aiRefresh = readFileSync("supabase/functions/ai-refresh-fichas/index.ts", "utf8");
const aiField = readFileSync("supabase/functions/ai-generate-ficha-campo/index.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261005220903_6e5adb57-2142-4c4e-a9ba-98fcf039d918.sql",
  "utf8",
);

describe("D51.5 P1 sistêmico — configuração global", () => {
  it("exibe a edição da identidade global somente ao Superadmin de Plataforma", () => {
    expect(settingsPage).toContain('const isPlatformSuperadmin = (roles ?? []).includes("superadmin")');
    expect(settingsPage).toMatch(/isPlatformSuperadmin && \([\s\S]*?value="aparencia"/);
    expect(settingsPage).not.toMatch(/isAdmin && \([\s\S]{0,160}?value="aparencia"/);
  });

  it("não aceita deep-link da aparência para usuário tenant", () => {
    expect(settingsPage).toContain('tabParam === "aparencia" && isPlatformSuperadmin');
    expect(settingsPage).not.toContain('["perfil", "empresa", "aparencia", "catalogos"');
  });

  it("grava logos globais somente no namespace reservado da plataforma", () => {
    expect(appearance).toContain('const path = `platform/logo-${Date.now()}.${ext}`');
    expect(appearance).toContain("Identidade visual global exibida para todas as empresas");
  });

  it("protege a atualização global do catálogo na rota de plataforma", () => {
    expect(app).toMatch(/<Route element={<PlataformaGuard \/>}>[\s\S]*?path="\/configuracoes\/catalogo-ia"/);
    expect(app).not.toContain('<RoleGuard><ConfigCatalogoIA /></RoleGuard>');
    expect(settingsPage).toMatch(/isPlatformSuperadmin && \([\s\S]*?to="\/configuracoes\/catalogo-ia"/);
  });

  it("valida Superadmin no servidor antes de usar service role no catálogo global", () => {
    for (const source of [aiRefresh, aiField]) {
      expect(source).toContain("userClient.rpc('is_platform_superadmin'");
      expect(source).toContain("if (!isSuperadmin) return j(origin, { error: 'forbidden' }, 403)");
      expect(source).not.toContain("'Access-Control-Allow-Origin': '*'");
    }
  });

  it("mantém superfícies sem ownership determinístico em fail-closed", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.bank_accounts FROM PUBLIC, anon, authenticated");
    expect(migration).toContain('CREATE POLICY "d51_5_bank_accounts_fail_closed"');
    expect(migration).toContain("USING (false)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.rpc_bi_visitas_por_cliente");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.rpc_b2b_executive_dashboard()");
  });

  it("combina papel e organização nos logs operacionais alcançáveis", () => {
    expect(migration).toContain('CREATE POLICY "d51_5_agenda_sync_tenant_read"');
    expect(migration).toContain("c.organization_id = public.h15_actor_organization()");
  });
});