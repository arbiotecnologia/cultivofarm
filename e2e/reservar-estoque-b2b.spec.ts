/**
 * E2E — Fluxo B2B de reservar estoque no Cockpit do Laboratório.
 *
 * Valida o mesmo fluxo do spec `reservar-estoque.spec.ts`, mas exigindo que
 * a OS aberta seja de origem B2B (titular_tipo = "parceiro"). Cobre:
 *   1. Cabeçalho do diálogo mostra "Parceiro" + número da OP/OS B2B.
 *   2. Recalculagem dos totais (un / L) em tempo real ao editar a quantidade.
 *   3. Validação por embalagem (clamp ao max, erro ao limpar, reabilita ao
 *      voltar para valor válido) — exatamente como no fluxo Cliente.
 *   4. Cancelamento sem persistir alterações.
 *
 * Pré-requisitos:
 *   - E2E_ADMIN_USER / E2E_ADMIN_PASSWORD com acesso ao cockpit.
 *   - Existir ao menos 1 lote no cockpit cuja OS seja B2B com botão
 *     "Reservar" disponível. Caso contrário, o teste é pulado.
 *
 * Execução:
 *   E2E_ADMIN_USER=... E2E_ADMIN_PASSWORD=... \
 *     bunx playwright test e2e/reservar-estoque-b2b.spec.ts
 */
import { test, expect, type Locator } from "../playwright-fixture";
import { loginViaUi } from "./helpers/b2bAuth";

const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "";

test.describe("Cockpit — Reservar estoque (B2B)", () => {
  test.skip(
    !ADMIN_USER || !ADMIN_PASS,
    "Defina E2E_ADMIN_USER e E2E_ADMIN_PASSWORD para rodar este E2E.",
  );

  test("abre uma OS B2B, valida embalagem e recalcula totais", async ({ page }) => {
    await loginViaUi(page, ADMIN_USER, ADMIN_PASS);
    await page.goto("/cockpit-laboratorio");
    await page.waitForLoadState("networkidle");

    const reservarBtns = page.getByRole("button", { name: /reservar/i });
    const total = await reservarBtns.count();
    test.skip(total === 0, "Cockpit sem botões Reservar disponíveis.");

    // Procura o primeiro Reservar cujo diálogo seja de uma OS B2B (Parceiro).
    let dialog: Locator | null = null;
    for (let i = 0; i < Math.min(total, 15); i++) {
      await reservarBtns.nth(i).click();
      const d = page.getByRole("dialog", { name: /reservar estoque/i });
      await expect(d).toBeVisible();
      const isParceiro = await d.getByText(/^Parceiro:/i).count();
      if (isParceiro > 0) {
        dialog = d;
        break;
      }
      await d.getByRole("button", { name: /cancelar/i }).click();
      await expect(d).toBeHidden();
    }

    test.skip(!dialog, "Nenhum lote com OS B2B disponível para reservar.");
    const d = dialog!;

    // 1) Cabeçalho B2B — Parceiro + indicador de origem (b2b).
    await expect(d.getByText(/^Parceiro:/i)).toBeVisible();
    await expect(d.getByText(/\(b2b\)/i)).toBeVisible();

    const qtyInputs = d.locator('input[id^="qty-"]');
    const count = await qtyInputs.count();
    test.skip(count === 0, "Lote B2B sem embalagens disponíveis.");

    const firstQty = qtyInputs.first();
    const maxQty = Number(await firstQty.getAttribute("max"));
    expect(maxQty).toBeGreaterThan(0);

    const confirmBtn = d.getByRole("button", { name: /confirmar reserva/i });
    await expect(confirmBtn).toBeEnabled();
    await expect(d.getByText(/excede o disponível/i)).toHaveCount(0);

    const totalLine = d.locator("text=/Total selecionado:/i").locator("..");
    const totalInicial = (await totalLine.textContent())?.trim() ?? "";

    // 2) Recalculagem em tempo real
    await firstQty.fill("1");
    await expect(confirmBtn).toBeEnabled();
    const totalApos1 = (await totalLine.textContent())?.trim() ?? "";
    expect(totalApos1).not.toBe(totalInicial);
    expect(totalApos1).toMatch(/1 un/);

    // 3) Clamp por embalagem ao tentar exceder o disponível
    await firstQty.fill(String(maxQty + 50));
    await expect(firstQty).toHaveValue(String(maxQty));
    await expect(confirmBtn).toBeEnabled();

    // 4) Estado inválido ao limpar o campo
    await firstQty.fill("");
    await expect(d.getByText(/informe uma quantidade válida/i)).toBeVisible();
    await expect(confirmBtn).toBeDisabled();

    // 5) Volta a um valor válido — erro some, confirm reabilita
    await firstQty.fill("1");
    await expect(d.getByText(/informe uma quantidade válida/i)).toHaveCount(0);
    await expect(confirmBtn).toBeEnabled();

    // Cancela para não persistir
    await d.getByRole("button", { name: /cancelar/i }).click();
    await expect(d).toBeHidden();
  });
});
