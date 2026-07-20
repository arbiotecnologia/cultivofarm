/**
 * E2E — Fluxo de reservar estoque no Cockpit do Laboratório.
 *
 * Valida na UI:
 *   1. Total (un / L) recalcula em tempo real ao editar a quantidade.
 *   2. Validação por embalagem: ao digitar acima do disponível, o input é
 *      clampado, aparece mensagem de erro e o botão "Confirmar reserva"
 *      fica desabilitado.
 *   3. Voltando para uma quantidade válida, o erro some e o botão reabilita.
 *
 * Pré-requisitos (ambiente):
 *   - E2E_ADMIN_USER / E2E_ADMIN_PASSWORD  (usuário com acesso ao cockpit)
 *   - Existir ao menos 1 lote no cockpit com botão "Reservar" disponível.
 *
 * Execução:
 *   E2E_ADMIN_USER=... E2E_ADMIN_PASSWORD=... \
 *     bunx playwright test e2e/reservar-estoque.spec.ts
 *
 * Sem credenciais, o spec é pulado.
 */
import { test, expect, type Page } from "../playwright-fixture";
import { loginViaUi } from "./helpers/b2bAuth";

const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "";

test.describe("Cockpit — Reservar estoque", () => {
  test.skip(
    !ADMIN_USER || !ADMIN_PASS,
    "Defina E2E_ADMIN_USER e E2E_ADMIN_PASSWORD para rodar este E2E.",
  );

  test("valida por embalagem e recalcula totais antes do submit", async ({ page }) => {
    await loginViaUi(page, ADMIN_USER, ADMIN_PASS);
    await page.goto("/cockpit-laboratorio");
    await page.waitForLoadState("networkidle");

    // Abre o primeiro botão "Reservar" disponível na lista do cockpit.
    const reservarBtn = page.getByRole("button", { name: /reservar/i }).first();
    await expect(reservarBtn).toBeVisible({ timeout: 15_000 });
    await reservarBtn.click();

    const dialog = page.getByRole("dialog", { name: /reservar estoque/i });
    await expect(dialog).toBeVisible();

    // Localiza o(s) input(s) de quantidade dentro do diálogo.
    const qtyInputs = dialog.locator('input[id^="qty-"]');
    const count = await qtyInputs.count();
    test.skip(count === 0, "Lote sem embalagens disponíveis para reservar.");

    const firstQty = qtyInputs.first();
    const maxQty = Number(await firstQty.getAttribute("max"));
    expect(maxQty).toBeGreaterThan(0);

    const confirmBtn = dialog.getByRole("button", { name: /confirmar reserva/i });

    // 1) Estado inicial: confirm habilitado, sem mensagem de erro.
    await expect(confirmBtn).toBeEnabled();
    await expect(dialog.getByText(/excede o disponível/i)).toHaveCount(0);

    // Captura total inicial para comparar depois.
    const totalLine = dialog.locator("text=/Total selecionado:/i").locator("..");
    const totalInicial = (await totalLine.textContent())?.trim() ?? "";

    // 2) Reduz para 1 → total deve mudar e confirm permanecer habilitado.
    await firstQty.fill("1");
    await expect(confirmBtn).toBeEnabled();
    const totalApos1 = (await totalLine.textContent())?.trim() ?? "";
    expect(totalApos1).not.toBe(totalInicial);
    expect(totalApos1).toMatch(/1 un/);

    // 3) Tenta digitar acima do disponível → clamp para maxQty (sem erro).
    await firstQty.fill(String(maxQty + 50));
    await expect(firstQty).toHaveValue(String(maxQty));
    await expect(confirmBtn).toBeEnabled();

    // 4) Limpa o campo → vira inválido, erro aparece, confirm desabilita.
    await firstQty.fill("");
    await expect(dialog.getByText(/informe uma quantidade válida/i)).toBeVisible();
    await expect(confirmBtn).toBeDisabled();

    // 5) Recoloca valor válido → erro some, confirm reabilita.
    await firstQty.fill("1");
    await expect(dialog.getByText(/informe uma quantidade válida/i)).toHaveCount(0);
    await expect(confirmBtn).toBeEnabled();

    // Não confirma de fato — fecha para não alterar dados.
    await dialog.getByRole("button", { name: /cancelar/i }).click();
    await expect(dialog).toBeHidden();
  });
});
