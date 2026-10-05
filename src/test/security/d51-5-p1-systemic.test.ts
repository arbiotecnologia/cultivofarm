import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const settingsPage = readFileSync("src/pages/Configuracoes.tsx", "utf8");
const appearance = readFileSync("src/components/configuracoes/AparenciaTab.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const aiRefresh = readFileSync("supabase/functions/ai-refresh-fichas/index.ts", "utf8");
const aiField = readFileSync("supabase/functions/ai-generate-ficha-campo/index.ts", "utf8");

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
});