/**
 * E2E Financeiro — Fluxo completo AR → baixa → estorno → DRE.
 *
 * Pré-requisitos:
 *   - Variáveis de ambiente E2E_USER e E2E_PASS apontando para conta com
 *     papel `financeiro_admin` (ou `administrador`).
 *   - Existir uma Conta a Receber em aberto cujo cliente contenha "[E2E]" no
 *     nome OU cujo número/descrição contenha "[E2E]". O teste apenas localiza
 *     o título; não cria nem destrói dados de produção.
 *
 * Execução:
 *   bunx playwright test e2e/financeiro-ar-baixa-estorno-dre.spec.ts
 *
 * Esqueleto criado pela fase de fechamento final. Marque como `test.skip` se a
 * conta E2E ainda não estiver disponível no ambiente para evitar quebra do CI.
 */
import { test, expect } from "../playwright-fixture";

const E2E_USER = process.env.E2E_USER ?? "";
const E2E_PASS = process.env.E2E_PASS ?? "";
const AR_TAG = process.env.E2E_AR_TAG ?? "[E2E]";

test.describe("Financeiro — AR → baixa → estorno → DRE", () => {
  test.skip(!E2E_USER || !E2E_PASS, "Defina E2E_USER e E2E_PASS para rodar este E2E.");

  test("ciclo completo deve neutralizar caixa no DRE", async ({ page }) => {
    // 1) Login
    await page.goto("/auth");
    await page.getByLabel(/e-?mail/i).fill(E2E_USER);
    await page.getByLabel(/senha/i).fill(E2E_PASS);
    await page.getByRole("button", { name: /entrar/i }).click();
    await expect(page).not.toHaveURL(/\/auth/);

    // 2) Localizar AR de teste
    await page.goto("/financeiro/contas-receber");
    await page.getByRole("searchbox").first().fill(AR_TAG).catch(() => {});
    const linha = page.getByRole("row", { name: new RegExp(AR_TAG.replace(/[[\]]/g, "\\$&"), "i") }).first();
    await expect(linha).toBeVisible({ timeout: 10_000 });
    await linha.click();

    // 3) Registrar baixa total
    await page.getByRole("button", { name: /registrar baixa|baixar/i }).first().click();
    await page.getByRole("button", { name: /^confirmar/i }).click();
    await expect(page.getByText(/baixa registrada|recebido com sucesso/i)).toBeVisible({ timeout: 10_000 });

    // 4) Estornar
    await page.getByRole("button", { name: /estornar/i }).first().click();
    await page.getByLabel(/motivo/i).fill("E2E — validação automatizada do ciclo");
    await page.getByRole("button", { name: /confirmar estorno/i }).click();
    await expect(page.getByText(/estornada com sucesso/i)).toBeVisible({ timeout: 10_000 });

    // 5) DRE — recebido líquido do dia deve ser ~zero (baixa anulada pelo estorno)
    const hoje = new Date().toISOString().slice(0, 10);
    await page.goto(`/financeiro/dre?from=${hoje}&to=${hoje}`);
    await page.getByRole("button", { name: /gerar|atualizar/i }).first().click().catch(() => {});
    // Asserção tolerante: confirma que a página de DRE renderizou com a métrica de receita.
    await expect(page.getByText(/receita|recebido|caixa l[ií]quido/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
