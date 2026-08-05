// Fixture E2E autossuficiente: apenas re-exporta o runner oficial do
// Playwright. Sem dependência de pacote de harness externo.
export { test, expect } from "@playwright/test";
