/**
 * E2E Laboratório — Fluxo completo da esteira da OS, do nascimento à finalização.
 *
 * FASE 5: o spec NÃO depende mais de uma OS previamente programada.
 * Ele cria sua própria fixture de homologação (numero_os com prefixo
 * `E2E5-`) via API autenticada, percorre a esteira pela UI do Cockpit com
 * seletores determinísticos e remove APENAS a fixture que criou.
 *
 * Pré-requisitos (variáveis de ambiente):
 *   - E2E_ADMIN_USER      (gestor/administrador com acesso ao Cockpit)
 *   - E2E_ADMIN_PASSWORD
 * Sem elas o spec é pulado — nunca reporta PASS falso.
 *
 * Regras aplicadas:
 *   - nenhum `first()` genérico como critério de Salvar/Confirmar;
 *   - a confirmação de entrega exige recebedor físico explícito;
 *   - criar entrega NÃO pode marcar a OS como "entregue";
 *   - replays (duplo clique) não podem duplicar lote/CQ/envase/entrega.
 */
import { test, expect, type Page } from "../playwright-fixture";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loginViaUi } from "./helpers/b2bAuth";

const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

const HABILITADO = Boolean(ADMIN_USER && ADMIN_PASS && SUPABASE_URL && SUPABASE_KEY);
const STEP_TIMEOUT = 20_000;

/** Prefixo obrigatório da fixture — o cleanup só toca em registros com ele. */
const TAG = `E2E5-${Date.now()}`;

let api: SupabaseClient;
let osId = "";
let programacaoId = "";

async function seedOsAberta() {
  api = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { error: authErr } = await api.auth.signInWithPassword({
    email: ADMIN_USER,
    password: ADMIN_PASS,
  });
  if (authErr) throw new Error(`Falha de autenticação da fixture: ${authErr.message}`);

  const { data: talhao } = await api
    .from("talhoes")
    .select("id, fazenda_id, fazendas(cliente_id)")
    .limit(1)
    .maybeSingle();
  if (!talhao) throw new Error("Fixture indisponível: nenhum talhão no ambiente.");

  const { data: produto } = await api.from("produtos").select("id").limit(1).maybeSingle();
  const { data: micro } = await api.from("microrganismos").select("id").limit(1).maybeSingle();

  const { data: os, error } = await api
    .from("ordens_servico")
    .insert({
      numero_os: TAG,
      cliente_id: (talhao as any).fazendas?.cliente_id ?? null,
      fazenda_id: (talhao as any).fazenda_id,
      talhao_id: (talhao as any).id,
      produto_id: produto?.id ?? null,
      microrganismo_id: micro?.id ?? null,
      volume_total_ml: 100000,
      status: "aberta",
      origem: "agronomica",
      tipo_item: "produto",
    } as any)
    .select("id, status")
    .single();
  if (error) throw new Error(`Falha ao criar a OS de fixture: ${error.message}`);

  osId = os.id;
  expect(os.status, "a OS de fixture precisa nascer em 'aberta'").toBe("aberta");

  const { data: prog } = await api
    .from("programacao_producao")
    .select("id")
    .eq("ordem_servico_id", osId)
    .maybeSingle();
  programacaoId = prog?.id ?? "";
}

/** Remove SOMENTE a fixture criada por este spec (prefixo E2E5-). */
async function limparFixture() {
  if (!api || !osId) return;
  await api.from("entregas").delete().eq("ordem_servico_id", osId);
  await api.from("ordens_servico").delete().eq("id", osId).like("numero_os", "E2E5-%");
  await api.auth.signOut();
}

async function statusOs(): Promise<string> {
  const { data } = await api.from("ordens_servico").select("status").eq("id", osId).single();
  return String(data?.status ?? "");
}

async function contar(tabela: string, filtro: (q: any) => any): Promise<number> {
  const { count } = await filtro(api.from(tabela).select("id", { count: "exact", head: true }));
  return count ?? 0;
}

/** Abre o painel da esteira da OS da fixture pelo número exato. */
async function abrirEsteira(page: Page) {
  await page.goto(`/cockpit-laboratorio?busca=${TAG}`);
  const cartao = page.getByText(TAG, { exact: true });
  await cartao.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
  await cartao.click();
  await page
    .getByText(/Passo a passo da esteira/i)
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT });
}

/** Clica um CTA da esteira pelo rótulo EXATO (sem first() genérico). */
async function clicarCta(page: Page, rotulo: string) {
  const btn = page.getByRole("button", { name: rotulo, exact: true });
  await expect(btn).toBeVisible({ timeout: STEP_TIMEOUT });
  await btn.click();
}

/** Confirma um diálogo pelo rótulo EXATO do seu botão de submit. */
async function confirmarDialogo(page: Page, rotuloSubmit: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: STEP_TIMEOUT });
  const submit = dialog.getByRole("button", { name: rotuloSubmit, exact: true });
  await expect(submit).toBeEnabled({ timeout: STEP_TIMEOUT });
  await submit.click();
  await expect(dialog).toBeHidden({ timeout: STEP_TIMEOUT });
}

test.describe("Laboratório — esteira da OS do nascimento à finalização", () => {
  test.skip(
    !HABILITADO,
    "Defina E2E_ADMIN_USER e E2E_ADMIN_PASSWORD (e as VITE_SUPABASE_*) para rodar este E2E.",
  );

  test.setTimeout(300_000);

  test.beforeAll(seedOsAberta);
  test.afterAll(limparFixture);

  test("OS nova percorre programação → produção → lote → CQ → envase → entrega → finalizada", async ({
    page,
  }) => {
    await loginViaUi(page, ADMIN_USER, ADMIN_PASS);

    // 1. OS recém-criada nasce em "aberta".
    expect(await statusOs()).toBe("aberta");

    // 2. Programação: aberta → programada.
    const prog = await api.rpc("rpc_programar_os_v1" as any, {
      p_os_id: osId,
      p_origem: "manual",
      p_data_programada: new Date().toISOString().slice(0, 10),
    });
    expect(prog.error, "programar_os não pode falhar").toBeNull();
    expect(await statusOs()).toBe("programada");

    // 3. Assumir produção pela UI → em_producao.
    await abrirEsteira(page);
    await clicarCta(page, "Assumir produção");
    await expect
      .poll(statusOs, { timeout: STEP_TIMEOUT })
      .toBe("em_producao");

    // 4. Gerar lote + replay sem duplicar.
    const lotesAntes = await contar("lotes", (q) => q.eq("programacao_id", programacaoId));
    await clicarCta(page, "Gerar lote");
    await confirmarDialogo(page, "Gerar lote");
    await expect
      .poll(() => contar("lotes", (q) => q.eq("programacao_id", programacaoId)), {
        timeout: STEP_TIMEOUT,
      })
      .toBe(lotesAntes + 1);

    const replayLote = await api.rpc("rpc_cockpit_gerar_lote_v1" as any, {
      p_programacao_id: programacaoId,
      p_os_id: osId,
      p_origem: "manual",
      p_lote: { codigo_lote: `${TAG}-DUP` },
    });
    expect((replayLote.data as any)?.replay, "replay de lote deve ser idempotente").toBe(true);
    expect(await contar("lotes", (q) => q.eq("programacao_id", programacaoId))).toBe(
      lotesAntes + 1,
    );

    const { data: lote } = await api
      .from("lotes")
      .select("id")
      .eq("programacao_id", programacaoId)
      .single();
    const loteId = lote!.id;

    // 5. Enviar para CQ → em_cq.
    await clicarCta(page, "Enviar para CQ");
    await expect.poll(statusOs, { timeout: STEP_TIMEOUT }).toBe("em_cq");

    // 6. Aprovar CQ + replay sem laudo duplicado.
    await clicarCta(page, "Registrar resultado CQ");
    await confirmarDialogo(page, "Aprovar");
    await expect
      .poll(() => contar("controle_qualidade", (q) => q.eq("lote_id", loteId)), {
        timeout: STEP_TIMEOUT,
      })
      .toBe(1);
    await api.rpc("rpc_avancar_esteira_laboratorio" as any, {
      p_os_id: osId,
      p_origem: "manual",
      p_etapa_destino: "aprovar_cq",
      p_programacao_id: programacaoId,
    });
    expect(await contar("controle_qualidade", (q) => q.eq("lote_id", loteId))).toBe(1);

    // 7. Liberar e registrar envase + replay sem segunda entrada de estoque.
    await clicarCta(page, "Liberar envase");
    await expect.poll(statusOs, { timeout: STEP_TIMEOUT }).toBe("envase");

    const chaveEnvase = `${TAG}:env`;
    const envasePayload = {
      p_lote_id: loteId,
      p_os_id: osId,
      p_origem: "manual",
      p_programacao_id: programacaoId,
      p_linhas: [{ tipo_embalagem: "bombona_20L", quantidade: "5" }],
      p_validade: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
      p_operador: "E2E5",
      p_idempotency_key: chaveEnvase,
    };
    const envase = await api.rpc("rpc_cockpit_registrar_envase_v1" as any, envasePayload);
    expect(envase.error, "registrar envase não pode falhar").toBeNull();
    await api.rpc("rpc_cockpit_registrar_envase_v1" as any, envasePayload);
    expect(await contar("estoque_produto", (q) => q.eq("lote_id", loteId))).toBe(1);

    // 8. Coerência de volume: 5 x bombona_20L = 100 L = 100000 ml da OS.
    const { data: estoque } = await api
      .from("estoque_produto")
      .select("id, quantidade, reservado_para_os_id")
      .eq("lote_id", loteId)
      .single();
    expect(Number(estoque!.quantidade)).toBe(5);
    expect(estoque!.reservado_para_os_id).toBe(osId);

    // 9. pode_finalizar deve ser FALSO antes da confirmação de entrega.
    const integridadeAntes = await api
      .from("vw_os_integridade_esteira")
      .select("pode_finalizar")
      .eq("os_id", osId)
      .eq("origem_os", "manual")
      .maybeSingle();
    expect(integridadeAntes.data?.pode_finalizar ?? false).toBe(false);

    // 10. Criar entrega — GATE: não pode marcar a OS como "entregue".
    const criar = await api.rpc("rpc_cockpit_criar_entrega_v1" as any, {
      p_os_id: osId,
      p_origem: "manual",
      p_estoque_produto_id: estoque!.id,
      p_quantidade: 5,
      p_dados: {},
    });
    const entregaId = (criar.data as any)?.entrega_id as string;
    expect((criar.data as any)?.status).toBe("separado");
    expect(await statusOs(), "criar entrega NÃO pode antecipar 'entregue'").not.toBe("entregue");

    // 11. Replay da criação não duplica entrega.
    await api.rpc("rpc_cockpit_criar_entrega_v1" as any, {
      p_os_id: osId,
      p_origem: "manual",
      p_estoque_produto_id: estoque!.id,
      p_quantidade: 5,
      p_dados: {},
    });
    expect(
      await contar("entregas", (q) =>
        q.eq("estoque_produto_id", estoque!.id).neq("status", "cancelada"),
      ),
    ).toBe(1);

    // 12. Confirmação sem recebedor é NEGADA (contrato fail-closed).
    const semRecebedor = await api.rpc("rpc_cockpit_confirmar_entrega_v1" as any, {
      p_entrega_id: entregaId,
      p_os_id: osId,
      p_origem: "manual",
      p_recebedor: {},
    });
    expect(semRecebedor.error, "confirmar sem recebedor deve falhar").not.toBeNull();

    // 13. Confirmação pela UI, com recebedor físico explícito.
    await page.goto(`/entregas?os=${osId}`);
    const linhaEntrega = page.getByRole("row", { name: new RegExp(TAG, "i") });
    await expect(linhaEntrega).toBeVisible({ timeout: STEP_TIMEOUT });
    await linhaEntrega.getByRole("button", { name: "Confirmar", exact: true }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible({ timeout: STEP_TIMEOUT });
    await dialogo.getByLabel(/nome de quem recebeu|recebido por/i).fill("Recebedor Físico E2E5");
    await confirmarDialogo(page, "Confirmar entrega");

    const { data: entregaConf } = await api
      .from("entregas")
      .select("status, recebido_por_nome, confirmado_por")
      .eq("id", entregaId)
      .single();
    expect(entregaConf!.recebido_por_nome).toBe("Recebedor Físico E2E5");
    expect(entregaConf!.confirmado_por, "operador registrado em confirmado_por").toBeTruthy();

    // 14. Baixa de estoque única (expedição) e replay sem segunda movimentação.
    const movs = await contar("estoque_movimentacoes", (q) =>
      q.eq("os_id", osId).eq("acao", "expedicao"),
    );
    expect(movs).toBe(1);
    await api.rpc("rpc_cockpit_confirmar_entrega_v1" as any, {
      p_entrega_id: entregaId,
      p_os_id: osId,
      p_origem: "manual",
      p_recebedor: { nome: "Recebedor Físico E2E5" },
    });
    expect(
      await contar("estoque_movimentacoes", (q) => q.eq("os_id", osId).eq("acao", "expedicao")),
    ).toBe(1);

    // 15. pode_finalizar verdadeiro só agora; finalização e replay sem evento extra.
    const integridadeDepois = await api
      .from("vw_os_integridade_esteira")
      .select("pode_finalizar")
      .eq("os_id", osId)
      .eq("origem_os", "manual")
      .maybeSingle();
    expect(integridadeDepois.data?.pode_finalizar).toBe(true);

    await api.rpc("rpc_avancar_esteira_laboratorio" as any, {
      p_os_id: osId,
      p_origem: "manual",
      p_etapa_destino: "finalizar_os",
      p_programacao_id: programacaoId,
    });
    const eventosFinalizar = await contar("laboratorio_esteira_eventos", (q) =>
      q.eq("os_id", osId).eq("etapa_nova", "finalizar_os"),
    );
    expect(eventosFinalizar).toBe(1);

    const replayFinal = await api.rpc("rpc_avancar_esteira_laboratorio" as any, {
      p_os_id: osId,
      p_origem: "manual",
      p_etapa_destino: "finalizar_os",
      p_programacao_id: programacaoId,
    });
    expect((replayFinal.data as any)?.replay).toBe(true);
    expect(
      await contar("laboratorio_esteira_eventos", (q) =>
        q.eq("os_id", osId).eq("etapa_nova", "finalizar_os"),
      ),
      "replay de finalização não pode duplicar evento",
    ).toBe(1);

    // 16. Status "finalizada" visível em /ordens-servico.
    expect(await statusOs()).toBe("finalizada");
    await page.goto("/ordens-servico");
    const linhaOs = page.getByRole("row", { name: new RegExp(TAG, "i") });
    await expect(linhaOs).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(linhaOs.getByText(/finalizada/i)).toBeVisible({ timeout: STEP_TIMEOUT });

    // 17. OS finalizada recusa ação operacional incompatível.
    const incompativel = await api.rpc("rpc_avancar_esteira_laboratorio" as any, {
      p_os_id: osId,
      p_origem: "manual",
      p_etapa_destino: "enviar_cq",
      p_programacao_id: programacaoId,
    });
    expect((incompativel.data as any)?.success).toBe(false);
  });
});
