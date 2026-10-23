import { describe, it, expect } from "vitest";
import { resolveConfiguracoesTab } from "@/lib/configuracoes/configuracoesTabs";

const perms = { isAdmin: true, canFin: true, canMeuPlano: true, isPlatformSuperadmin: false };

describe("resolveConfiguracoesTab (aba ativa via URL, validada por permissão)", () => {
  it("sem parâmetro cai em perfil", () => {
    expect(resolveConfiguracoesTab(null, perms)).toBe("perfil");
  });

  it("usuarios exige administrador", () => {
    expect(resolveConfiguracoesTab("usuarios", perms)).toBe("usuarios");
    expect(resolveConfiguracoesTab("usuarios", { ...perms, isAdmin: false })).toBe("perfil");
  });

  it("financeiro exige canFin", () => {
    expect(resolveConfiguracoesTab("financeiro", perms)).toBe("financeiro");
    expect(resolveConfiguracoesTab("financeiro", { ...perms, canFin: false })).toBe("perfil");
  });

  it("meu-plano exige canMeuPlano e aparencia exige superadmin", () => {
    expect(resolveConfiguracoesTab("meu-plano", perms)).toBe("meu-plano");
    expect(resolveConfiguracoesTab("meu-plano", { ...perms, canMeuPlano: false })).toBe("perfil");
    expect(resolveConfiguracoesTab("aparencia", perms)).toBe("perfil");
    expect(resolveConfiguracoesTab("aparencia", { ...perms, isPlatformSuperadmin: true })).toBe("aparencia");
  });

  it("abas abertas passam sem permissão especial; desconhecida cai em perfil", () => {
    for (const t of ["perfil", "empresa", "catalogos", "sla-b2b"]) {
      expect(resolveConfiguracoesTab(t, { isAdmin: false, canFin: false, canMeuPlano: false, isPlatformSuperadmin: false })).toBe(t);
    }
    expect(resolveConfiguracoesTab("nao-existe", perms)).toBe("perfil");
  });
});
