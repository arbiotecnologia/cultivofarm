/**
 * E2E — Redirect da rota legada /protocolos para /base-tecnica.
 *
 * Valida em runtime (roteador real no navegador) que a query string e o hash
 * são preservados na migração de rota canônica.
 *
 * Ambiente: STAGING apenas (ikaauvsflpmamgxmkhoq). Nunca apontar para produção.
 *
 * Variáveis obrigatórias:
 *   - E2E_ADMIN_USER, E2E_ADMIN_PASSWORD
 * Sem elas o spec é pulado, pois o guard de autenticação intercepta a rota
 * antes do componente de redirect ser montado.
 */
import { test, expect } from "../playwright-fixture";
import { loginViaUi } from "./helpers/b2bAuth";

const USER = process.env.E2E_ADMIN_USER ?? "";
const PASS = process.env.E2E_ADMIN_PASSWORD ?? "";
const HAS_CREDS = Boolean(USER && PASS);

test.describe("Rota legada /protocolos → /base-tecnica", () => {
  test.skip(!HAS_CREDS, "Credenciais E2E de administrador não configuradas");

  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, USER, PASS);
  });

  test("preserva query string e hash no redirect", async ({ page }) => {
    const visited: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) visited.push(frame.url());
    });

    await page.goto("/protocolos?tab=culturas&busca=abc#secao-1");
    await page.waitForURL((url) => url.pathname === "/base-tecnica", { timeout: 15_000 });

    const url = new URL(page.url());
    expect(url.pathname).toBe("/base-tecnica");
    expect(url.search).toBe("?tab=culturas&busca=abc");
    expect(url.hash).toBe("#secao-1");

    // A rota legada não permanece montada nem duplica conteúdo.
    expect(visited.filter((u) => new URL(u).pathname === "/protocolos").length).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Base Técnica Agronômica/i);

    // A aba pedida pela query é a que fica ativa após o redirect.
    await expect(page.getByRole("tab", { selected: true })).toHaveText(/culturas/i);
  });

  test("redireciona a rota legada sem parâmetros", async ({ page }) => {
    await page.goto("/protocolos");
    await page.waitForURL((url) => url.pathname === "/base-tecnica", { timeout: 15_000 });
    expect(new URL(page.url()).search).toBe("");
  });
});
