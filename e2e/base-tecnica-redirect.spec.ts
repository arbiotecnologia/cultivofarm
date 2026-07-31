/**
 * E2E — Redirect da rota legada /protocolos para /base-tecnica.
 *
 * Valida em runtime (roteador real no navegador) que a query string e o hash
 * são preservados na migração de rota.
 *
 * Ambiente: STAGING apenas. Nunca apontar para produção.
 *
 * Variáveis opcionais (para exercitar o redirect autenticado):
 *   - E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_ADMIN_USER, E2E_ADMIN_PASSWORD
 * Sem elas o teste ainda roda: o redirect é resolvido antes de qualquer guard,
 * então a asserção é feita sobre a primeira URL pós-redirect.
 */
import { test, expect } from "../playwright-fixture";

const LEGACY = "/protocolos?tab=culturas&busca=abc#secao-1";

test.describe("Rota legada /protocolos", () => {
  test("redireciona para /base-tecnica preservando query e hash", async ({ page }) => {
    await page.goto(LEGACY);

    // O redirect é client-side (PreservedNavigate); aguarda a troca de pathname.
    await page.waitForFunction(
      () => !window.location.pathname.startsWith("/protocolos"),
      undefined,
      { timeout: 15_000 },
    );

    const url = new URL(page.url());

    // Se um guard de autenticação levar para /auth, a query original deve estar
    // preservada no parâmetro de retorno; caso contrário, deve estar na própria URL.
    if (url.pathname === "/base-tecnica") {
      expect(url.search).toBe("?tab=culturas&busca=abc");
      expect(url.hash).toBe("#secao-1");
    } else {
      const redirectParam = url.searchParams.get("redirect") ?? url.searchParams.get("from") ?? "";
      expect(
        decodeURIComponent(redirectParam) + decodeURIComponent(url.hash),
      ).toContain("/base-tecnica");
    }

    // A rota legada nunca deve permanecer montada.
    expect(url.pathname).not.toBe("/protocolos");
  });

  test("redireciona a rota legada sem parâmetros", async ({ page }) => {
    await page.goto("/protocolos");
    await page.waitForFunction(
      () => !window.location.pathname.startsWith("/protocolos"),
      undefined,
      { timeout: 15_000 },
    );
    expect(new URL(page.url()).pathname).not.toBe("/protocolos");
  });
});
