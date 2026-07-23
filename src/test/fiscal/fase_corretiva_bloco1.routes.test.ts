/**
 * Fase Corretiva — Bloco 1: rotas do menu fiscal devem existir em
 * App.tsx e em ACCESS_MAP; rotas legadas /fiscal/perfis/* permanecem
 * como legacyRoutes para compat.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";
import { navigation, type NavItem } from "@/config/navigation";
import { canAccess } from "@/lib/permissions";

const APP = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");

const IDS = [
  "fiscal-perfis-produtos",
  "fiscal-perfis-servicos",
  "fiscal-perfis-clientes",
] as const;

const EXPECTED: Record<(typeof IDS)[number], string> = {
  "fiscal-perfis-produtos": "/configuracoes/fiscal/produtos",
  "fiscal-perfis-servicos": "/configuracoes/fiscal/servicos",
  "fiscal-perfis-clientes": "/configuracoes/fiscal/clientes",
};

const LEGACY: Record<(typeof IDS)[number], string> = {
  "fiscal-perfis-produtos": "/fiscal/perfis/produtos",
  "fiscal-perfis-servicos": "/fiscal/perfis/servicos",
  "fiscal-perfis-clientes": "/fiscal/perfis/clientes",
};

function findItem(id: string): NavItem | undefined {
  for (const it of navigation) {
    if (it.id === id) return it;
    for (const c of it.children ?? []) if (c.id === id) return c;
  }
  return undefined;
}

describe("Bloco 1 — rotas fiscais canônicas no menu", () => {
  it.each(IDS)("%s aponta para rota canônica", (id) => {
    const item = findItem(id);
    expect(item, `item ${id} ausente em NAV_ITEMS`).toBeTruthy();
    expect(item!.route).toBe(EXPECTED[id]);
  });

  it.each(IDS)("%s declara rota legada como legacyRoute", (id) => {
    const item = findItem(id)!;
    expect(item.legacyRoutes ?? []).toContain(LEGACY[id]);
  });

  it.each(IDS)("%s rota canônica registrada em App.tsx", (id) => {
    expect(APP).toContain(`path="${EXPECTED[id]}"`);
  });

  it.each(IDS)("%s rota canônica reconhecida por canAccess (admin)", (id) => {
    expect(canAccess("administrador", EXPECTED[id])).toBe(true);
  });
});
