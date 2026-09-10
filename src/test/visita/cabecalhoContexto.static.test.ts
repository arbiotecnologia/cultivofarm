/**
 * H9-G Bloco 2F — cabeçalho/menu e logout coerentes com o contexto ativo.
 *
 * Reproduções cobertas:
 *  - multipapel no Portal Técnico via rótulo "Gestor B2B" e sem "Trocar de portal";
 *  - logout pelo cabeçalho técnico seguido de novo login caía direto no /app.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPortalDisplayLabel } from "@/lib/portalDisplayLabel";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("rótulo por contexto ativo", () => {
  const roles = ["consultor_tecnico", "parceiro_b2b"] as any;

  it("contexto técnico mostra o papel técnico", () => {
    expect(
      getPortalDisplayLabel({ activeCtx: "technical", primaryRole: "parceiro_b2b" as any, roles }),
    ).toBe("Consultor Técnico");
  });

  it("contexto B2B preserva o rótulo B2B atual", () => {
    expect(
      getPortalDisplayLabel({ activeCtx: "b2b", primaryRole: "parceiro_b2b" as any, roles }),
    ).not.toBe("Consultor Técnico");
  });
});

describe("UserMenu — fonte canônica única", () => {
  const src = read("src/components/UserMenu.tsx");

  it("deriva o rótulo do contexto ativo canônico", () => {
    expect(src).toContain('from "@/lib/navigation/portalRoleContext"');
    expect(src).toContain("readActiveContext()");
    expect(src).toContain("getPortalDisplayLabel(");
  });

  it("oferece 'Trocar de portal' quando há dois contextos reais", () => {
    expect(src).toContain("useAvailableContexts");
    expect(src).toContain("canSwitchPortal");
    expect(src).toContain("useSwitchPortal");
    expect(src).toContain("Trocar de portal");
  });

  it("não duplica lógica nas variantes de cabeçalho", () => {
    const topbar = read("src/components/portal/PortalTopBar.tsx");
    expect(topbar).toContain("<UserMenu");
    for (const layout of [
      "src/pages/app/MobileLayout.tsx",
      "src/components/AppLayout.tsx",
      "src/pages/portal/PortalLayout.tsx",
      "src/pages/portal-parceiro/PortalParceiroLayout.tsx",
    ]) {
      expect(read(layout)).toContain("PortalTopBar");
    }
  });
});

describe("logout e novo login", () => {
  it("logout canônico limpa o contexto ativo", () => {
    const auth = read("src/hooks/useAuth.tsx");
    const idxClear = auth.indexOf("clearActivePortalContext();", auth.indexOf("const signOut"));
    expect(idxClear).toBeGreaterThan(-1);
  });

  it("login de campo passa pelo seletor canônico, sem herdar contexto", () => {
    const login = read("src/pages/app/MobileLogin.tsx");
    expect(login).toContain('<Navigate to="/selecionar-portal" replace />');
    expect(login).not.toContain('<Navigate to="/app" replace />');
  });
});
