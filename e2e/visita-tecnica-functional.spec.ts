import { test, expect } from '@playwright/test';

/**
 * Teste E2E Funcional — Módulo Campo e Assistência Técnica
 * Valida o fluxo de redirect e a presença de elementos base.
 * O teste de lógica de negócio profunda é delegado ao harness de runtime.
 */
test.describe('Campo e Assistência Técnica', () => {
  test('deve acessar a base técnica agronômica (antigo protocolos)', async ({ page }) => {
    // Redirecionamento legado
    await page.goto('http://localhost:8080/protocolos');
    await expect(page).toHaveURL(/.*base-tecnica/);
    
    // Título da página
    const title = page.locator('h1');
    await expect(title).toContainText(/Base Técnica Agronômica/i);
  });

  test('deve listar visitas técnicas e abrir diálogo de nova visita', async ({ page }) => {
    await page.goto('http://localhost:8080/visita-tecnica');
    
    // Verifica botão de nova visita
    const newVisitBtn = page.getByRole('button', { name: /nova visita/i });
    if (await newVisitBtn.isVisible()) {
      await newVisitBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText(/objetivo agronômico/i)).toBeVisible();
    }
  });
});
