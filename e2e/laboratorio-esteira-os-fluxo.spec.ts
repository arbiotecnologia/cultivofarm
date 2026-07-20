/**
 * E2E Laboratório — Fluxo completo da esteira até a finalização da OS.
 *
 * Cobre, para uma OS existente e já com programação de produção ativa,
 * cada transição de status conduzida pelo Cockpit Operacional:
 *
 *   PCP → Em produção → Lote gerado → Enviado p/ CQ → CQ aprovado
 *       → Liberado envase → Envase concluído → Reserva de estoque
 *       → Entrega confirmada → OS finalizada
 *
 * A cada passo, valida:
 *   - o CTA correspondente some do EsteiraStepper (etapa vira "done");
 *   - o badge de status oficial da esteira no cockpit é atualizado;
 *   - ao final, o status da OS aparece como "finalizada" em /ordens-servico.
 *
 * Pré-requisitos (variáveis de ambiente):
 *   - E2E_ADMIN_USER            (obrigatório — gestor com acesso ao Cockpit)
 *   - E2E_ADMIN_PASSWORD        (obrigatório)
 *   - E2E_ESTEIRA_OS_NUMERO     (obrigatório — número da OS já programada
 *                                que percorreremos na esteira)
 *
 * Sem as três variáveis, o spec é automaticamente pulado — assim como
 * `b2b-pedido-fluxo-completo.spec.ts`.
 *
 * Como cada diálogo intermediário (Gerar Lote, Registrar CQ, Envase,
 * Reservar Estoque, Entrega) tem campos específicos do domínio, este
 * spec preenche apenas o mínimo necessário via helpers heurísticos:
 * confirma o primeiro botão de submit disponível ("Salvar", "Confirmar",
 * "Registrar", "Concluir", "Finalizar"). Para cenários de teste com
 * campos obrigatórios adicionais, use dados pré-semeados.
 */
import { test, expect, type Page } from "../playwright-fixture";
import { loginViaUi } from "./helpers/b2bAuth";

const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "";
const OS_NUMERO = process.env.E2E_ESTEIRA_OS_NUMERO ?? "";

const STEP_TIMEOUT = 20_000;

async function dismissToasts(page: Page) {
  await page
    .locator("[data-sonner-toast]")
    .first()
    .waitFor({ state: "hidden", timeout: 5_000 })
    .catch(() => {});
}

/** Seleciona o card/linha da esteira correspondente ao número da OS. */
async function selecionarOs(page: Page, numero: string) {
  await page.goto("/cockpit-laboratorio");
  const alvo = page.getByText(new RegExp(numero, "i")).first();
  await alvo.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
  await alvo.click();
  // Aguarda o painel lateral com o EsteiraStepper carregar
  await page
    .getByText(/Passo a passo da esteira/i)
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT });
}

/** Confirma um diálogo qualquer clicando no primeiro botão de submit compatível. */
async function confirmarDialogoGenerico(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
  const submit = dialog
    .getByRole("button", {
      name: /^(salvar|confirmar|registrar|concluir|finalizar|enviar|liberar|reservar)$/i,
    })
    .first();
  await submit.click();
  await dialog.waitFor({ state: "hidden", timeout: STEP_TIMEOUT });
  await dismissToasts(page);
}

/**
 * Executa uma etapa da esteira: clica o CTA pelo rótulo e aguarda o
 * próximo rótulo aparecer (o CTA anterior deve sumir = etapa "done").
 */
async function avancarEtapa(
  page: Page,
  ctaAtual: RegExp,
  proximoCta: RegExp | null,
  opts: { comDialogo?: boolean } = {},
) {
  const btn = page.getByRole("button", { name: ctaAtual }).first();
  await btn.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
  await btn.click();
  if (opts.comDialogo) {
    await confirmarDialogoGenerico(page);
  }
  await dismissToasts(page);
  // O CTA anterior deve sumir; se houver próximo, deve aparecer.
  await expect(page.getByRole("button", { name: ctaAtual }).first()).toBeHidden({
    timeout: STEP_TIMEOUT,
  });
  if (proximoCta) {
    await page
      .getByRole("button", { name: proximoCta })
      .first()
      .waitFor({ state: "visible", timeout: STEP_TIMEOUT });
  }
}

/** Confere o badge de status oficial exibido no cockpit. */
async function esperarStatusEsteira(page: Page, status: RegExp) {
  await expect(page.getByText(status).first()).toBeVisible({
    timeout: STEP_TIMEOUT,
  });
}

test.describe("Laboratório — Esteira até finalização da OS", () => {
  test.skip(
    !ADMIN_USER || !ADMIN_PASS || !OS_NUMERO,
    "Defina E2E_ADMIN_USER, E2E_ADMIN_PASSWORD e E2E_ESTEIRA_OS_NUMERO para rodar este E2E.",
  );

  test.setTimeout(240_000);

  test("percorre PCP → produção → lote → CQ → envase → estoque → entrega → OS finalizada", async ({
    page,
  }) => {
    await loginViaUi(page, ADMIN_USER, ADMIN_PASS);

    // ---------- 1. PCP / Assumir produção ----------
    await selecionarOs(page, OS_NUMERO);
    await avancarEtapa(page, /Assumir produção/i, /Gerar lote/i);
    await esperarStatusEsteira(page, /EM\s*PRODU/i);

    // ---------- 2. Gerar lote ----------
    await avancarEtapa(page, /Gerar lote/i, /Enviar para CQ/i, {
      comDialogo: true,
    });
    await esperarStatusEsteira(page, /LOTE|PRODU/i);

    // ---------- 3. Enviar para CQ ----------
    await avancarEtapa(page, /Enviar para CQ/i, /Registrar resultado CQ/i);
    await esperarStatusEsteira(page, /AGUARDANDO\s*CQ/i);

    // ---------- 4. Registrar CQ (aprovado) ----------
    await avancarEtapa(page, /Registrar resultado CQ/i, /Liberar envase/i, {
      comDialogo: true,
    });
    await esperarStatusEsteira(page, /APROVAD/i);

    // ---------- 5. Liberar envase ----------
    await avancarEtapa(page, /Liberar envase/i, /Registrar envase/i);
    await esperarStatusEsteira(page, /ENVASE/i);

    // ---------- 6. Registrar/Concluir envase ----------
    await avancarEtapa(page, /Registrar envase/i, /Reservar estoque/i, {
      comDialogo: true,
    });
    await esperarStatusEsteira(page, /ESTOQUE|RESERVA/i);

    // ---------- 7. Reservar estoque ----------
    // Este CTA leva a /estoque; confirmamos que a navegação ocorreu.
    await page.getByRole("button", { name: /Reservar estoque/i }).first().click();
    await page.waitForURL(/\/estoque/, { timeout: STEP_TIMEOUT });

    // Volta ao cockpit para a próxima etapa (entrega).
    await selecionarOs(page, OS_NUMERO);

    // ---------- 8. Criar / confirmar entrega ----------
    const entregaBtn = page
      .getByRole("button", { name: /Criar \/ confirmar entrega|Reservar e entregar/i })
      .first();
    await entregaBtn.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
    await entregaBtn.click();
    await page.waitForURL(/\/(entregas|estoque)/, { timeout: STEP_TIMEOUT });

    // Confirma a entrega pelo primeiro botão de finalização visível na página.
    const finalizarEntrega = page
      .getByRole("button", { name: /^(confirmar entrega|finalizar entrega|entregue)$/i })
      .first();
    if (await finalizarEntrega.isVisible().catch(() => false)) {
      await finalizarEntrega.click();
      await confirmarDialogoGenerico(page).catch(() => {});
    }

    // ---------- 9. OS finalizada ----------
    await page.goto("/ordens-servico");
    const linhaOs = page.getByRole("row", { name: new RegExp(OS_NUMERO, "i") }).first();
    await linhaOs.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
    await expect(linhaOs.getByText(/finalizada/i)).toBeVisible({
      timeout: STEP_TIMEOUT,
    });
  });
});
