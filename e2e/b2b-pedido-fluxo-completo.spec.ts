/**
 * E2E B2B — Motor de Condições Comerciais (FASE 17)
 *
 * Cobre três fluxos do motor comercial:
 *   A) Pedido à vista (sem aprovação financeira)
 *   B) Pedido safra pendente → aprovar → gerar contas a receber
 *   C) Pedido safra reprovado → geração de AR bloqueada
 *
 * Fluxo validado ponta a ponta:
 *   Catálogo → Carrinho → Plano de pagamento → Simulação → Pedido → Aprovação/Faturamento
 *
 * Pré-requisitos (variáveis de ambiente):
 *   - E2E_PARTNER_USER       (default: fagner@arbio.com)
 *   - E2E_PARTNER_PASSWORD   (obrigatório)
 *   - E2E_ADMIN_USER         (obrigatório — administrador ou financeiro)
 *   - E2E_ADMIN_PASSWORD     (obrigatório)
 *
 * Em CI sem credenciais o spec inteiro é automaticamente pulado (test.skip).
 */
import { test, expect, type Page } from "../playwright-fixture";
import { loginViaUi, logout } from "./helpers/b2bAuth";

const PARTNER_USER = process.env.E2E_PARTNER_USER ?? "fagner@arbio.com";
const PARTNER_PASS = process.env.E2E_PARTNER_PASSWORD ?? "";
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "";

const dismissToasts = async (page: Page) => {
  await page
    .locator("[data-sonner-toast]")
    .first()
    .waitFor({ state: "hidden", timeout: 5_000 })
    .catch(() => {});
};

/** Adiciona o primeiro item disponível do catálogo B2B ao carrinho. */
async function adicionarPrimeiroItem(page: Page) {
  await page.goto("/portal-parceiro/catalogo");
  const primeiroAdd = page.getByRole("button", { name: /^adicionar$/i }).first();
  await expect(primeiroAdd, "botão Adicionar do catálogo").toBeVisible({ timeout: 20_000 });
  await primeiroAdd.click();

  const confirmarAdd = page
    .getByRole("button", { name: /adicionar ao carrinho|confirmar/i })
    .last();
  await expect(confirmarAdd).toBeVisible({ timeout: 10_000 });
  await confirmarAdd.click();
  await dismissToasts(page);
}

/**
 * Avança do carrinho para a etapa de condição de pagamento, seleciona o plano
 * cujo nome/rótulo bate com `planRegex`, aguarda o resumo financeiro e envia.
 * Retorna o número do pedido (PED-...).
 */
async function selecionarPlanoEEnviar(page: Page, planRegex: RegExp) {
  const btnContinuar = page.getByRole("button", {
    name: /continuar para condi|condi[cç][aã]o de pagamento/i,
  });
  await expect(btnContinuar, "botão para etapa de pagamento").toBeVisible({ timeout: 15_000 });
  await btnContinuar.click();

  // Selector do plano — os planos aparecem como radios/cards clicáveis.
  const planoCard = page
    .locator("label, [role=radio], [role=button]")
    .filter({ hasText: planRegex })
    .first();
  await expect(planoCard, `plano ${planRegex}`).toBeVisible({ timeout: 15_000 });
  await planoCard.click();

  // Resumo financeiro (PaymentSimulationSummary) — obrigatório antes do envio.
  await expect(page.getByText(/valor de tabela/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/desconto comercial/i)).toBeVisible();
  await expect(page.getByText(/base l[ií]quida/i)).toBeVisible();
  await expect(page.getByText(/total final/i)).toBeVisible();

  const btnEnviar = page
    .getByRole("button", { name: /enviar pedido|enviar para an[áa]lise|confirmar pedido/i })
    .first();
  await expect(btnEnviar, "botão de envio do pedido").toBeEnabled({ timeout: 10_000 });
  await btnEnviar.click();

  await page.waitForURL(/portal-parceiro\/pedidos/i, { timeout: 20_000 });
  const numeroText = await page.locator("text=/PED-\\d+/i").first().innerText();
  const numero = numeroText.match(/PED-\d+/i)?.[0] ?? "";
  expect(numero, "número do pedido recém-criado").toMatch(/PED-\d+/);
  return numero;
}

/** Abre a linha do pedido na lista comercial. */
async function abrirPedidoComoAdmin(page: Page, numero: string) {
  await page.goto("/comercial/pedidos-b2b");
  const linha = page.getByRole("row").filter({ hasText: numero }).first();
  await expect(linha, `linha do pedido ${numero}`).toBeVisible({ timeout: 15_000 });
  await linha.click();
}

test.describe("B2B — Motor de Condições Comerciais (FASE 17)", () => {
  test.skip(
    !PARTNER_PASS || !ADMIN_USER || !ADMIN_PASS,
    "Defina E2E_PARTNER_PASSWORD, E2E_ADMIN_USER e E2E_ADMIN_PASSWORD para rodar este E2E.",
  );

  test.setTimeout(240_000);

  // -----------------------------------------------------------------
  // FLUXO A — Pedido à vista (sem aprovação financeira)
  // -----------------------------------------------------------------
  test("FLUXO A — à vista: pedido criado sem exigir aprovação financeira", async ({ page }) => {
    await loginViaUi(page, PARTNER_USER, PARTNER_PASS);
    await adicionarPrimeiroItem(page);
    const numero = await selecionarPlanoEEnviar(page, /à vista|antecipado/i);

    await logout(page);
    await loginViaUi(page, ADMIN_USER, ADMIN_PASS);
    await abrirPedidoComoAdmin(page, numero);

    // Não deve indicar aprovação financeira pendente.
    const pendente = page.getByText(/aprova[cç][aã]o financeira pendente|exige aprova/i);
    expect(await pendente.count()).toBe(0);

    // Se a ação de gerar AR estiver na UI, deve funcionar sem bloqueio.
    const btnGerarAr = page
      .getByRole("button", { name: /gerar contas? a receber|faturar/i })
      .first();
    if (await btnGerarAr.isVisible().catch(() => false)) {
      await btnGerarAr.click();
      await dismissToasts(page);
      const erro = page.getByText(/exige aprova[cç][aã]o financeira/i);
      expect(await erro.count()).toBe(0);
    }
  });

  // -----------------------------------------------------------------
  // FLUXO B — Safra pendente → aprovar → gerar AR
  // -----------------------------------------------------------------
  test("FLUXO B — safra pendente: bloqueia AR antes da aprovação e libera depois", async ({
    page,
  }) => {
    await loginViaUi(page, PARTNER_USER, PARTNER_PASS);
    await adicionarPrimeiroItem(page);

    // Selecionar plano safra que exige aprovação.
    await page
      .getByRole("button", { name: /continuar para condi|condi[cç][aã]o de pagamento/i })
      .click();
    const planoSafra = page
      .locator("label, [role=radio], [role=button]")
      .filter({ hasText: /safra/i })
      .first();
    await expect(planoSafra).toBeVisible({ timeout: 15_000 });
    await planoSafra.click();

    // Aviso obrigatório do motor.
    await expect(page.getByText(/aprova[cç][aã]o financeira/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/total final/i)).toBeVisible();

    await page
      .getByRole("button", { name: /enviar pedido|enviar para an[áa]lise|confirmar pedido/i })
      .first()
      .click();
    await page.waitForURL(/portal-parceiro\/pedidos/i, { timeout: 20_000 });
    const numero =
      (await page.locator("text=/PED-\\d+/i").first().innerText()).match(/PED-\d+/i)?.[0] ?? "";
    expect(numero).toMatch(/PED-\d+/);

    await logout(page);
    await loginViaUi(page, ADMIN_USER, ADMIN_PASS);
    await abrirPedidoComoAdmin(page, numero);

    await expect(page.getByText(/aprova[cç][aã]o financeira|pendente/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // Tentativa de gerar AR antes da aprovação: deve ser bloqueada.
    const btnGerarArPre = page
      .getByRole("button", { name: /gerar contas? a receber|faturar/i })
      .first();
    if (await btnGerarArPre.isVisible().catch(() => false)) {
      await btnGerarArPre.click();
      await expect(
        page.getByText(/exige aprova[cç][aã]o financeira|aprova.*antes do faturamento/i),
      ).toBeVisible({ timeout: 10_000 });
      await dismissToasts(page);
    }

    // Aprovar condição financeira.
    const btnAprovar = page
      .getByRole("button", { name: /aprovar condi[cç][aã]o|aprovar financeiro|aprovar pagamento/i })
      .first();
    await expect(btnAprovar, "botão de aprovação da condição").toBeVisible({ timeout: 15_000 });
    await btnAprovar.click();
    await dismissToasts(page);

    // Gerar AR agora deve ser aceito.
    const btnGerarArPos = page
      .getByRole("button", { name: /gerar contas? a receber|faturar/i })
      .first();
    if (await btnGerarArPos.isVisible().catch(() => false)) {
      await btnGerarArPos.click();
      await dismissToasts(page);
      const erro = page.getByText(/exige aprova[cç][aã]o financeira/i);
      expect(await erro.count()).toBe(0);
    }
  });

  // -----------------------------------------------------------------
  // FLUXO C — Safra reprovado → geração de AR/produção bloqueada
  // -----------------------------------------------------------------
  test("FLUXO C — safra reprovado: AR e produção permanecem bloqueadas", async ({ page }) => {
    await loginViaUi(page, PARTNER_USER, PARTNER_PASS);
    await adicionarPrimeiroItem(page);

    await page
      .getByRole("button", { name: /continuar para condi|condi[cç][aã]o de pagamento/i })
      .click();
    await page
      .locator("label, [role=radio], [role=button]")
      .filter({ hasText: /safra/i })
      .first()
      .click();
    await expect(page.getByText(/total final/i)).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole("button", { name: /enviar pedido|enviar para an[áa]lise|confirmar pedido/i })
      .first()
      .click();
    await page.waitForURL(/portal-parceiro\/pedidos/i, { timeout: 20_000 });
    const numero =
      (await page.locator("text=/PED-\\d+/i").first().innerText()).match(/PED-\d+/i)?.[0] ?? "";
    expect(numero).toMatch(/PED-\d+/);

    await logout(page);
    await loginViaUi(page, ADMIN_USER, ADMIN_PASS);
    await abrirPedidoComoAdmin(page, numero);

    const btnReprovar = page
      .getByRole("button", {
        name: /reprovar condi[cç][aã]o|reprovar financeiro|rejeitar pagamento/i,
      })
      .first();
    await expect(btnReprovar).toBeVisible({ timeout: 15_000 });
    await btnReprovar.click();

    // Alguns fluxos exigem justificativa em um dialog.
    const motivo = page.getByRole("textbox").first();
    if (await motivo.isVisible().catch(() => false)) {
      await motivo.fill("E2E: reprovação para validar bloqueio de AR/produção.");
      await page
        .getByRole("button", { name: /confirmar|reprovar|enviar/i })
        .last()
        .click();
    }
    await dismissToasts(page);

    // Tentar gerar AR → deve bloquear.
    const btnGerarAr = page
      .getByRole("button", { name: /gerar contas? a receber|faturar/i })
      .first();
    if (await btnGerarAr.isVisible().catch(() => false)) {
      await btnGerarAr.click();
      await expect(
        page.getByText(
          /reprovad|bloqueado|n[aã]o permitido|exige aprova[cç][aã]o financeira/i,
        ),
      ).toBeVisible({ timeout: 10_000 });
      await dismissToasts(page);
    }

    // Produção: botão não deve estar disponível OU deve estar desabilitado.
    const btnProducao = page
      .getByRole("button", { name: /gerar ordem de produ|liberar para produ/i })
      .first();
    if (await btnProducao.isVisible().catch(() => false)) {
      expect(await btnProducao.isDisabled()).toBe(true);
    }
  });
});
