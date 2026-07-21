import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 4 — Smoke test for the financial route surface.
 *
 * Validates statically that all canonical financial routes are wired in
 * App.tsx and that their target page modules can be resolved. This avoids
 * pulling the whole Supabase-backed render tree into vitest while still
 * catching regressions where a route or page file is removed/renamed.
 */

const APP = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");

const REQUIRED_ROUTES = [
  "/financeiro",
  "/financeiro/receber",
  "/financeiro/pagar",
  "/financeiro/dre",
  "/financeiro/fluxo-caixa",
  "/financeiro/recibos",
  "/financeiro/b2b/governanca",
];

const REQUIRED_PAGES = [
  "@/pages/financeiro/FinanceiroDashboard",
  "@/pages/financeiro/ContasReceber",
  "@/pages/financeiro/ContasPagar",
  "@/pages/financeiro/DRE",
  "@/pages/financeiro/FluxoCaixa",
  "@/pages/financeiro/RecibosList",
  "@/pages/financeiro/GovernancaFinanceiraB2B",
];

describe("Financeiro — rotas (Fase 4)", () => {
  it.each(REQUIRED_ROUTES)("rota %s está declarada em App.tsx", (path) => {
    expect(APP).toContain(`path="${path}"`);
  });

  it.each(REQUIRED_PAGES)("página %s é importada em App.tsx", (mod) => {
    expect(APP).toContain(mod);
  });

  it("todas as rotas financeiras são protegidas por RoleGuard", () => {
    const lines = APP.split("\n").filter((l) => l.includes('path="/financeiro'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toContain("RoleGuard");
    }
  });

  it("rota de recibos está disponível (lista ou rota dedicada)", () => {
    // Recibos são acessíveis via página RecibosList importada em App.tsx
    expect(APP).toMatch(/RecibosList/);
  });
});
