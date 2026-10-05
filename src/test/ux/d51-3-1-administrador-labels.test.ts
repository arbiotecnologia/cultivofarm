import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACTIVE_ROLES, ROLE_LABELS, canAccess, getHomeForRole } from "@/lib/permissions";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("D51.3.1 — rótulo do administrador da empresa", () => {
  it("exibe o nome contextual sem alterar a chave interna", () => {
    expect(ROLE_LABELS.administrador).toBe("Administrador da empresa");
    expect(ACTIVE_ROLES).toContain("administrador");
    expect(ACTIVE_ROLES).not.toContain("Administrador da empresa");
  });

  it("preserva autorização e destino do papel interno", () => {
    expect(canAccess("administrador", "/dashboard/geral")).toBe(true);
    expect(getHomeForRole("administrador")).toBe("/dashboard/geral");
  });

  it("mantém Superadmin como papel distinto", () => {
    expect(ROLE_LABELS.superadmin).toBe("Superadmin de Plataforma");
    expect(getHomeForRole("superadmin")).toBe("/plataforma");
  });

  it("usa o novo rótulo nos seletores sem mudar o valor persistido", () => {
    const comunicacao = read("src/features/comunicacao/ui/ComunicacaoAdminPage.tsx");
    expect(comunicacao).toContain('<option value="administrador">Administrador da empresa</option>');
    expect(comunicacao).not.toContain('<option value="Administrador da empresa">');
  });

  it("centraliza badges e filtros de usuários no mapa de rótulos", () => {
    const configuracoes = read("src/pages/Configuracoes.tsx");
    expect(configuracoes).toContain("{ROLE_LABELS[r]}");
    expect(configuracoes).toContain("{ROLE_LABELS[r] || r}");
  });
});