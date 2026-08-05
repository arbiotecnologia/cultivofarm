import { defineConfig, devices } from "@playwright/test";

/**
 * Configuração E2E autossuficiente (sem dependências de harness externo).
 *
 * - `E2E_BASE_URL` define o alvo; por padrão o dev server local.
 * - `E2E_SKIP_WEBSERVER=1` desativa o start automático (útil quando o
 *   servidor já está em execução ou quando o alvo é remoto).
 * - Nenhum segredo é lido ou impresso aqui.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const skipWebServer =
  process.env.E2E_SKIP_WEBSERVER === "1" || !baseURL.includes("localhost");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: "npm run dev -- --port 8080 --strictPort",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
