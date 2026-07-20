import type { Page } from "@playwright/test";

/**
 * Faz login pela UI em /auth. Aguarda o redirect para fora de /auth.
 */
export async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
}

/**
 * Faz logout limpando a sessão do Supabase armazenada em localStorage e recarregando.
 * Estratégia simples e independente da UI (que pode variar entre layouts).
 */
export async function logout(page: Page) {
  await page.evaluate(() => {
    const keys = Object.keys(window.localStorage);
    for (const k of keys) {
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
        window.localStorage.removeItem(k);
      }
    }
  });
  await page.goto("/auth");
}
