/**
 * E2E — RBAC: acesso admin vs não-admin
 *
 * Cobre:
 *  1. Não autenticado → rotas protegidas redirecionam para /auth.
 *  2. Admin autenticado:
 *     - login redireciona para fora de /auth;
 *     - NUNCA fica preso em /selecionar-portal ou /acesso-pendente
 *       (bypass reforçado no front + backend via `is_admin`);
 *     - consegue abrir rotas administrativas por URL direta
 *       (/dashboard/geral, /configuracoes, /auditoria).
 *  3. Não-admin (ex: produtor) autenticado:
 *     - não acessa rotas administrativas por URL direta
 *       (é redirecionado para sua home ou /sem-permissao / /acesso-pendente).
 *
 * Variáveis:
 *   E2E_ADMIN_USER, E2E_ADMIN_PASSWORD
 *   E2E_NONADMIN_USER, E2E_NONADMIN_PASSWORD  (opcional — pula bloco 3 se ausente)
 *
 * Sem credenciais de admin o spec inteiro é pulado.
 */
import { test, expect, type Page } from "../playwright-fixture";
import { loginViaUi, logout } from "./helpers/b2bAuth";

const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "";
const NONADMIN_USER = process.env.E2E_NONADMIN_USER ?? "";
const NONADMIN_PASS = process.env.E2E_NONADMIN_PASSWORD ?? "";

const PROTECTED_ROUTES = [
  "/dashboard/geral",
  "/configuracoes",
  "/auditoria",
];

const ADMIN_ONLY_ROUTES = [
  "/configuracoes",
  "/auditoria",
];

async function currentPath(page: Page): Promise<string> {
  return new URL(page.url()).pathname;
}

/** Aguarda estabilizar o path (após redirects do guard/RPC). */
async function settlePath(page: Page, timeoutMs = 8000): Promise<string> {
  const start = Date.now();
  let last = await currentPath(page);
  // Poll até path não mudar por 800ms.
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(400);
    const now = await currentPath(page);
    if (now === last) {
      await page.waitForTimeout(400);
      const again = await currentPath(page);
      if (again === now) return now;
    }
    last = now;
  }
  return last;
}

test.describe("RBAC — acesso a rotas protegidas", () => {
  test.skip(!(ADMIN_USER && ADMIN_PASS), "E2E_ADMIN_USER/PASSWORD não configurados");

  test.describe("Não autenticado", () => {
    for (const route of PROTECTED_ROUTES) {
      test(`bloqueia ${route} e redireciona para /auth`, async ({ page }) => {
        await logout(page);
        await page.goto(route);
        const path = await settlePath(page);
        expect(path.startsWith("/auth")).toBeTruthy();
      });
    }
  });

  test.describe("Admin autenticado", () => {
    test.beforeEach(async ({ page }) => {
      await logout(page);
      await loginViaUi(page, ADMIN_USER, ADMIN_PASS);
    });

    test("após login não fica preso em /selecionar-portal nem /acesso-pendente", async ({ page }) => {
      const path = await settlePath(page);
      expect(path).not.toBe("/selecionar-portal");
      expect(path).not.toBe("/acesso-pendente");
      expect(path.startsWith("/auth")).toBeFalsy();
    });

    test("bypass do seletor ao acessar /selecionar-portal diretamente", async ({ page }) => {
      await page.goto("/selecionar-portal");
      const path = await settlePath(page);
      expect(path).not.toBe("/selecionar-portal");
      expect(path).not.toBe("/acesso-pendente");
    });

    test("bypass de /acesso-pendente ao acessar diretamente", async ({ page }) => {
      await page.goto("/acesso-pendente");
      const path = await settlePath(page);
      expect(path).not.toBe("/acesso-pendente");
      expect(path).not.toBe("/selecionar-portal");
    });

    for (const route of ADMIN_ONLY_ROUTES) {
      test(`acessa ${route} por URL direta`, async ({ page }) => {
        await page.goto(route);
        const path = await settlePath(page);
        expect(path).toBe(route);
        expect(path.startsWith("/auth")).toBeFalsy();
        expect(path).not.toBe("/sem-permissao");
        expect(path).not.toBe("/acesso-pendente");
      });
    }
  });

  test.describe("Não-admin autenticado", () => {
    test.skip(!(NONADMIN_USER && NONADMIN_PASS), "Credenciais não-admin ausentes");

    test.beforeEach(async ({ page }) => {
      await logout(page);
      await loginViaUi(page, NONADMIN_USER, NONADMIN_PASS);
    });

    for (const route of ADMIN_ONLY_ROUTES) {
      test(`não acessa ${route} por URL direta`, async ({ page }) => {
        await page.goto(route);
        const path = await settlePath(page);
        // Não pode aterrissar na rota admin-only.
        expect(path).not.toBe(route);
        // Destino esperado: home do próprio papel, /sem-permissao ou /acesso-pendente.
        const acceptable =
          path === "/sem-permissao" ||
          path === "/acesso-pendente" ||
          path.startsWith("/portal") ||
          path.startsWith("/app") ||
          path.startsWith("/b2b") ||
          path.startsWith("/dashboard");
        expect(acceptable, `path inesperado: ${path}`).toBeTruthy();
      });
    }

    test("acessando /auth já logado é redirecionado para fora", async ({ page }) => {
      await page.goto("/auth");
      const path = await settlePath(page);
      expect(path.startsWith("/auth")).toBeFalsy();
    });
  });
});
