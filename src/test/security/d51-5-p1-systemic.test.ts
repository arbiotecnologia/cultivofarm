import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { requireActiveCatalogSuperadmin } from "@edge-shared/catalog-superadmin-guard";

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

  it("valida Superadmin no servidor antes de usar service role no catálogo global", async () => {
    // Caminho 1 — ai-refresh-fichas: RPC is_platform_superadmin inline, ANTES
    // de criar o client service-role.
    expect(aiRefresh).toContain("userClient.rpc('is_platform_superadmin'");
    expect(aiRefresh).toContain("if (!isSuperadmin) return j(origin, { error: 'forbidden' }, 403)");
    expect(aiRefresh.indexOf("userClient.rpc('is_platform_superadmin'")).toBeLessThan(
      aiRefresh.indexOf("createClient(SUPABASE_URL, SERVICE_ROLE)"),
    );
    expect(aiRefresh).not.toContain("'Access-Control-Allow-Origin': '*'");

    // Caminho 2 — ai-generate-ficha-campo: delega ao guard compartilhado REAL,
    // também ANTES do service-role. Sem duplicar o guard neste teste.
    expect(aiField).toContain("import { requireActiveCatalogSuperadmin } from '../_shared/catalog-superadmin-guard.ts'");
    expect(aiField).toContain("await requireActiveCatalogSuperadmin(userClient, user.id)");
    expect(aiField.indexOf("await requireActiveCatalogSuperadmin(userClient, user.id)")).toBeLessThan(
      aiField.indexOf("createClient(SUPABASE_URL, SERVICE_ROLE)"),
    );
    expect(aiField).not.toContain("'Access-Control-Allow-Origin': '*'");

    // Contrato comportamental do guard REAL com client RPC fake — falha fechada.
    const rpc = (impl: (fn: string) => { data: unknown; error: unknown }) => ({
      rpc: (fn: string) => Promise.resolve(impl(fn)),
    });
    const ok = rpc((fn) => ({ data: true, error: null }));
    await expect(requireActiveCatalogSuperadmin(ok, "u1")).resolves.toEqual({ ok: true });

    // has_role: false, string "true", null e erro => nega.
    for (const data of [false, "true", null]) {
      const c = rpc((fn) => (fn === "has_role" ? { data, error: null } : { data: true, error: null }));
      const r = await requireActiveCatalogSuperadmin(c, "u1");
      expect(r.ok).toBe(false);
    }
    const errActive = rpc((fn) => (fn === "has_role" ? { data: null, error: new Error("x") } : { data: true, error: null }));
    await expect(requireActiveCatalogSuperadmin(errActive, "u1")).resolves.toEqual({ ok: false, status: 500, error: "role_check_failed" });

    // is_platform_superadmin: false, string "true" e erro => nega.
    for (const data of [false, "true"]) {
      const c = rpc((fn) => (fn === "is_platform_superadmin" ? { data, error: null } : { data: true, error: null }));
      const r = await requireActiveCatalogSuperadmin(c, "u1");
      expect(r.ok).toBe(false);
    }
    const errPlatform = rpc((fn) => (fn === "is_platform_superadmin" ? { data: null, error: new Error("x") } : { data: true, error: null }));
    await expect(requireActiveCatalogSuperadmin(errPlatform, "u1")).resolves.toEqual({ ok: false, status: 500, error: "role_check_failed" });

    // Exceção lançada pelo client => falha fechada 500.
    const throwing = { rpc: () => Promise.reject(new Error("rede")) };
    await expect(requireActiveCatalogSuperadmin(throwing, "u1")).resolves.toEqual({ ok: false, status: 500, error: "role_check_failed" });

    // userId inválido => 403 sem chamar RPC.
    let chamadas = 0;
    const contando = { rpc: () => { chamadas++; return Promise.resolve({ data: true, error: null }); } };
    await expect(requireActiveCatalogSuperadmin(contando, "")).resolves.toEqual({ ok: false, status: 403, error: "forbidden" });
    expect(chamadas).toBe(0);
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