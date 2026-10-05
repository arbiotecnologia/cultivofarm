import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const settingsPage = readFileSync("src/pages/Configuracoes.tsx", "utf8");
const appearance = readFileSync("src/components/configuracoes/AparenciaTab.tsx", "utf8");

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
});