#!/usr/bin/env node
/**
 * H5b — EVIDÊNCIA T10: concorrência REAL (duas conexões paralelas) no STAGING.
 *
 * Alvo EXCLUSIVO: ikaauvsflpmamgxmkhoq. Produção navfzbwgwzruipouyfnk é RECUSADA.
 * Nunca imprime o DSN nem qualquer segredo.
 *
 * Testes:
 *   A) 2x generate_production_orders_from_partner no MESMO pedido elegível
 *   B) 2x reserva de estoque sobre o MESMO item (soma > disponível) + replay
 *   C) 2x INSERT direto em envase no MESMO lote (soma > volume produzido)
 *
 * Concorrência verdadeira: conexões independentes + barreira de relógio
 * (pg_sleep até um instante comum) + Promise.all. Nada é sequencial.
 *
 * Uso: STAGING_DSN=... node restoration/homologacao-h5/35-h5b-concorrencia.mjs
 */
import pg from "pg";

const PROD_REF = "navfzbwgwzruipouyfnk";
const STAGING_REF = "ikaauvsflpmamgxmkhoq";
const DSN = process.env.STAGING_DSN;
const TAG = `H5B-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;

if (!DSN) {
  console.error("ABORT: STAGING_DSN ausente");
  process.exit(4);
}
if (DSN.includes(PROD_REF)) {
  console.error("ABORT: DSN aponta para PRODUÇÃO");
  process.exit(2);
}

const results = [];
const rec = (gate, ok, detalhe) => {
  results.push({ gate, status: ok ? "PASS" : "FAIL", detalhe });
  console.log(`${ok ? "PASS" : "FAIL"} — ${gate}${detalhe ? ` :: ${detalhe}` : ""}`);
};

// TLS gerenciado pelo provedor (cadeia self-signed); sslmode do DSN é normalizado
// para evitar conflito com a verificação estrita do driver.
const SAFE_DSN = DSN.replace(/([?&])sslmode=[^&]*/g, "$1").replace(/[?&]$/, "");

const connect = async () => {
  const c = new pg.Client({ connectionString: SAFE_DSN, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
};

/** Executa `fn` em transação autenticada como `uid`, sincronizada em `startAt`. */
async function concurrentTx(uid, startAt, fn) {
  const c = await connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE authenticated");
    await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    // barreira de relógio: ambas as conexões acordam no mesmo instante
    await c.query(
      "SELECT pg_sleep(greatest(0, extract(epoch from ($1::timestamptz - clock_timestamp()))))",
      [startAt],
    );
    const out = await fn(c);
    await c.query("COMMIT");
    return { ok: true, out };
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* noop */ }
    return { ok: false, error: { message: e.message, code: e.code } };
  } finally {
    await c.end();
  }
}

const admin = await connect();
let fixtures = null;

async function guard() {
  const r = await admin.query(
    "SELECT project_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1",
  );
  const ref = r.rows[0]?.project_ref;
  if (ref !== STAGING_REF) throw new Error(`STAGING_GUARD: ambiente não autorizado (${ref ?? "null"})`);
}

async function setup() {
  const uid = (
    await admin.query(
      "SELECT user_id FROM public.user_roles WHERE role::text='administrador' ORDER BY user_id LIMIT 1",
    )
  ).rows[0]?.user_id;
  if (!uid) throw new Error("H5B_SEM_USUARIO_ADMIN");

  const produtoId = (
    await admin.query("SELECT id FROM public.produtos WHERE ativo IS NOT false ORDER BY created_at LIMIT 1")
  ).rows[0].id;

  await admin.query("BEGIN");

  // ---- Fixture A: pedido B2B elegível --------------------------------
  const partnerId = (
    await admin.query(
      `INSERT INTO public.partner_accounts (nome_fantasia, razao_social, cnpj, status)
       VALUES ($1, $1, lpad((floor(random()*1e14))::bigint::text, 14, '0'), 'ativo')
       RETURNING id`,
      [`${TAG} PARCEIRO`],
    )
  ).rows[0].id;

  const orderId = (
    await admin.query(
      `INSERT INTO public.partner_orders (partner_id, status, ready_for_production, observacoes,
                                          requires_financial_approval, financial_approval_status)
       VALUES ($1, 'aprovado', true, $2, false, 'not_required') RETURNING id`,
      [partnerId, `${TAG} PEDIDO`],
    )
  ).rows[0].id;

  await admin.query(
    `INSERT INTO public.partner_order_items (order_id, product_id, quantidade, preco_unitario,
                                             subtotal, unidade_medida, produto_nome_snapshot)
     VALUES ($1, $2, 10, 100, 1000, 'litro', $3)`,
    [orderId, produtoId, `${TAG} ITEM`],
  );

  await admin.query(
    `INSERT INTO public.production_planning (partner_order_id, partner_id, status)
     VALUES ($1, $2, 'aguardando_planejamento')`,
    [orderId, partnerId],
  );

  // pedido inelegível (retestes adicionais)
  const orderBlockedId = (
    await admin.query(
      `INSERT INTO public.partner_orders (partner_id, status, ready_for_production, observacoes)
       VALUES ($1, 'pendente', false, $2) RETURNING id`,
      [partnerId, `${TAG} PEDIDO INELEGIVEL`],
    )
  ).rows[0].id;

  // ---- Fixture B: item de estoque disponível -------------------------
  const loteB = (
    await admin.query(
      `INSERT INTO public.lotes (codigo_lote, produto_id, volume_produzido, status)
       VALUES ($1, $2, 10000, 'aprovado') RETURNING id`,
      [`${TAG}-LOTE-B`, produtoId],
    )
  ).rows[0].id;

  const osId = (
    await admin.query(
      `INSERT INTO public.ordens_servico (numero_os, produto_id, volume_total_ml, status, origem, tipo_item)
       VALUES ($1, $2, 10000, 'aprovada', 'b2b', 'produto') RETURNING id`,
      [`${TAG}-OS`, produtoId],
    )
  ).rows[0].id;

  const estoqueId = (
    await admin.query(
      `INSERT INTO public.estoque_produto (produto_id, lote_id, quantidade, volume_total, status)
       VALUES ($1, $2, 10, 10000, 'disponivel') RETURNING id`,
      [produtoId, loteB],
    )
  ).rows[0].id;

  // ---- Fixture C: lote com CQ aprovado, pronto para envase ------------
  const loteC = (
    await admin.query(
      `INSERT INTO public.lotes (codigo_lote, produto_id, volume_produzido, status)
       VALUES ($1, $2, 10000, 'aprovado') RETURNING id`,
      [`${TAG}-LOTE-C`, produtoId],
    )
  ).rows[0].id;

  const cqId = (
    await admin.query(
      `INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel, ph)
       VALUES ($1, 'aprovado', $2, 6.5) RETURNING id`,
      [loteC, `${TAG} QA`],
    )
  ).rows[0].id;

  await admin.query("COMMIT");
  fixtures = { uid, produtoId, partnerId, orderId, orderBlockedId, loteB, loteC, osId, estoqueId, cqId };
}

const startIn = async (ms) =>
  (await admin.query("SELECT (clock_timestamp() + ($1 || ' milliseconds')::interval) AS t", [ms])).rows[0].t;

// ---------------------------------------------------------------------
// TESTE A — geração concorrente de OS a partir do pedido B2B
// ---------------------------------------------------------------------
async function testA() {
  const { uid, orderId } = fixtures;
  const at = await startIn(1500);
  const call = () =>
    concurrentTx(uid, at, async (c) =>
      (await c.query("SELECT public.generate_production_orders_from_partner($1) AS r", [orderId])).rows[0].r,
    );
  const [r1, r2] = await Promise.all([call(), call()]);

  const uniqueViolation = [r1, r2].some((r) => !r.ok && r.error.code === "23505");
  rec("T10-A1 nenhuma unique_violation em geração concorrente", !uniqueViolation,
    JSON.stringify([r1.ok ? r1.out : r1.error, r2.ok ? r2.out : r2.error]));

  rec("T10-A2 ambas as chamadas terminam com sucesso controlado", r1.ok && r2.ok,
    `ok=[${r1.ok},${r2.ok}]`);

  const created = [r1, r2].filter((r) => r.ok).map((r) => r.out.os_created ?? -1);
  const total = created.reduce((a, b) => a + b, 0);
  rec("T10-A3 exatamente um conjunto de OS criado (a segunda é replay os_created=0)",
    total === 1 && created.includes(0), `os_created=${JSON.stringify(created)}`);

  const os = await admin.query(
    "SELECT count(*)::int AS n FROM public.ordens_servico WHERE partner_order_id=$1", [orderId]);
  const link = await admin.query(
    `SELECT count(*)::int AS n, count(DISTINCT partner_order_item_id)::int AS itens
       FROM public.production_order_link WHERE partner_order_id=$1`, [orderId]);
  rec("T10-A4 links 1:1 e nenhuma OS duplicada",
    os.rows[0].n === 1 && link.rows[0].n === 1 && link.rows[0].itens === 1,
    `os=${os.rows[0].n} links=${link.rows[0].n}`);

  const tl = await admin.query(
    "SELECT count(*)::int AS n FROM public.production_timeline_events WHERE partner_order_id=$1 AND event_type='op_gerada'",
    [orderId]);
  rec("T10-A5 histórico não poluído (1 evento op_gerada)", tl.rows[0].n === 1, `eventos=${tl.rows[0].n}`);

  const prog = await admin.query(
    `SELECT count(*)::int AS n FROM public.programacao_producao pp
      JOIN public.ordens_servico o ON o.id = pp.ordem_servico_id
      WHERE o.partner_order_id=$1`, [orderId]);
  rec("R1 OS gerada fica programável sem intervenção manual (programação automática)",
    prog.rows[0].n >= 1, `programacoes=${prog.rows[0].n}`);

  const blocked = await concurrentTx(fixtures.uid, await startIn(50), async (c) =>
    (await c.query("SELECT public.generate_production_orders_from_partner($1) AS r", [fixtures.orderBlockedId])).rows[0].r);
  rec("R2 pedido inelegível continua bloqueado para geração de OS",
    !blocked.ok && /aprovado/i.test(blocked.error.message), blocked.ok ? "gerou!" : blocked.error.message);
}

// ---------------------------------------------------------------------
// TESTE B — reservas concorrentes sobre o MESMO item de estoque
// ---------------------------------------------------------------------
async function testB() {
  const { uid, osId, estoqueId } = fixtures;
  const reserve = (key, qtd, at) =>
    concurrentTx(uid, at, async (c) =>
      (await c.query(
        "SELECT public.rpc_estoque_reservar_v1($1,'b2b',$2::jsonb,$3,'{}'::jsonb) AS r",
        [osId, JSON.stringify([{ item_id: estoqueId, quantidade: qtd }]), key],
      )).rows[0].r);

  // B1: chaves distintas, soma (7+7) > disponível (10)
  let at = await startIn(1500);
  const [b1, b2] = await Promise.all([
    reserve(`${TAG}-KEY-A`, 7, at),
    reserve(`${TAG}-KEY-B`, 7, at),
  ]);
  const okCount = [b1, b2].filter((r) => r.ok).length;
  rec("T10-B1 no máximo uma reserva concorrente consome além do limite", okCount === 1,
    JSON.stringify([b1.ok ? "ok" : b1.error.message, b2.ok ? "ok" : b2.error.message]));

  const saldo = await admin.query(
    `SELECT COALESCE(min(quantidade),0) AS min_qtd,
            COALESCE(sum(quantidade),0) AS total
       FROM public.estoque_produto WHERE lote_id=$1`, [fixtures.loteB]);
  rec("T10-B2 saldo nunca negativo e conservação de quantidade",
    Number(saldo.rows[0].min_qtd) >= 0 && Number(saldo.rows[0].total) === 10,
    `min=${saldo.rows[0].min_qtd} total=${saldo.rows[0].total}`);

  // B2: mesma idempotency key concorrente => replay, sem segunda movimentação
  at = await startIn(1500);
  const key = `${TAG}-KEY-REPLAY`;
  const [c1, c2] = await Promise.all([reserve(key, 1, at), reserve(key, 1, at)]);
  const replays = [c1, c2].filter((r) => r.ok && r.out.replay === true).length;
  rec("T10-B3 mesma chave concorrente retorna replay sem segunda movimentação",
    c1.ok && c2.ok && replays === 1,
    JSON.stringify([c1.ok ? c1.out : c1.error.message, c2.ok ? c2.out : c2.error.message]));

  const movs = await admin.query(
    `SELECT count(*)::int AS n FROM public.estoque_movimentacoes
      WHERE idempotency_key = $1 OR idempotency_key LIKE $1 || '#%'`, [key]);
  rec("T10-B4 livro consistente: uma única movimentação para a chave repetida",
    movs.rows[0].n === 1, `movimentacoes=${movs.rows[0].n}`);
}

// ---------------------------------------------------------------------
// TESTE C — envases diretos concorrentes no MESMO lote
// ---------------------------------------------------------------------
async function testC() {
  const { uid, loteC } = fixtures;
  const at = await startIn(1500);
  const insert = () =>
    concurrentTx(uid, at, async (c) =>
      (await c.query(
        `INSERT INTO public.envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade, operador)
         VALUES ($1, (SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                       WHERE t.typname='tipo_embalagem' ORDER BY e.enumsortorder LIMIT 1)::tipo_embalagem,
                 1000, 6, $2) RETURNING id`,
        [loteC, `${TAG} OP`],
      )).rows[0].id);

  const [r1, r2] = await Promise.all([insert(), insert()]);
  const okCount = [r1, r2].filter((r) => r.ok).length;
  const overfill = [r1, r2].filter((r) => !r.ok && /excede o volume produzido/i.test(r.error.message)).length;
  rec("T10-C1 apenas um envase concorrente persiste; o outro falha com overfill",
    okCount === 1 && overfill === 1,
    JSON.stringify([r1.ok ? "ok" : r1.error.message, r2.ok ? "ok" : r2.error.message]));

  const tot = await admin.query(
    "SELECT public.lote_volume_envasado($1) AS envasado, (SELECT volume_produzido FROM public.lotes WHERE id=$1) AS produzido",
    [loteC]);
  rec("T10-C2 total envasado <= volume produzido",
    Number(tot.rows[0].envasado) <= Number(tot.rows[0].produzido),
    `envasado=${tot.rows[0].envasado} produzido=${tot.rows[0].produzido}`);
}

// ---------------------------------------------------------------------
// RETESTES CQ (H5-B03)
// ---------------------------------------------------------------------
async function testCQ() {
  const { uid, loteC, cqId } = fixtures;
  const upd = await concurrentTx(uid, await startIn(50), async (c) =>
    c.query("UPDATE public.controle_qualidade SET resultado='reprovado' WHERE id=$1", [cqId]));
  rec("R3 resultado final de CQ não pode ser sobrescrito",
    !upd.ok && /CQ_RESULTADO_FINAL_IMUTAVEL/.test(upd.error.message), upd.ok ? "sobrescreveu!" : "bloqueado");

  const del = await concurrentTx(uid, await startIn(50), async (c) =>
    c.query("DELETE FROM public.controle_qualidade WHERE id=$1", [cqId]));
  rec("R4 análise de CQ finalizada não pode ser excluída informalmente",
    !del.ok && /CQ_RESULTADO_FINAL_IMUTAVEL/.test(del.error.message), del.ok ? "excluiu!" : "bloqueado");

  const rean = await concurrentTx(uid, await startIn(50), async (c) =>
    (await c.query(
      `INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel, ph)
       VALUES ($1,'reprovado',$2, 4.0) RETURNING id`, [loteC, `${TAG} QA2`])).rows[0].id);
  rec("R5 reanálise cria NOVA linha preservando o histórico", rean.ok,
    rean.ok ? "nova linha criada" : rean.error.message);

  const hist = await admin.query(
    `SELECT count(*)::int AS n,
            (SELECT resultado::text FROM public.controle_qualidade
              WHERE lote_id=$1 ORDER BY created_at DESC, seq DESC LIMIT 1) AS ultimo
       FROM public.controle_qualidade WHERE lote_id=$1`, [loteC]);
  rec("R6 gate usa a última análise (created_at DESC, seq DESC) e mantém histórico",
    hist.rows[0].n === 2 && hist.rows[0].ultimo === "reprovado",
    `linhas=${hist.rows[0].n} ultimo=${hist.rows[0].ultimo}`);

  const env = await concurrentTx(uid, await startIn(50), async (c) =>
    c.query(
      `INSERT INTO public.envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade)
       VALUES ($1, (SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                     WHERE t.typname='tipo_embalagem' ORDER BY e.enumsortorder LIMIT 1)::tipo_embalagem, 100, 1)`,
      [loteC]));
  rec("R7 reprovação posterior volta a bloquear novos envases",
    !env.ok && /Controle de Qualidade aprovado/i.test(env.error.message),
    env.ok ? "permitiu!" : "bloqueado");
}

// ---------------------------------------------------------------------
async function teardown() {
  await admin.query("BEGIN");
  await admin.query("SELECT set_config('app.estoque_purge_fixture','on', true)");
  await admin.query("SELECT set_config('app.cq_purge_fixture','on', true)");
  const { orderId, orderBlockedId, partnerId, loteB, loteC, osId } = fixtures;

  await admin.query(
    `DELETE FROM public.estoque_movimentacoes WHERE estoque_produto_id IN
       (SELECT id FROM public.estoque_produto WHERE lote_id = ANY($1::uuid[]))`, [[loteB, loteC]]);
  await admin.query("DELETE FROM public.estoque_produto WHERE lote_id = ANY($1::uuid[])", [[loteB, loteC]]);
  await admin.query("DELETE FROM public.envase WHERE lote_id = ANY($1::uuid[])", [[loteB, loteC]]);
  await admin.query("DELETE FROM public.controle_qualidade WHERE lote_id = ANY($1::uuid[])", [[loteB, loteC]]);
  await admin.query("DELETE FROM public.production_order_link WHERE partner_order_id = ANY($1::uuid[])",
    [[orderId, orderBlockedId]]);
  await admin.query(
    `DELETE FROM public.programacao_producao WHERE ordem_servico_id IN
       (SELECT id FROM public.ordens_servico WHERE partner_order_id = ANY($1::uuid[]) OR id = $2)`,
    [[orderId, orderBlockedId], osId]);
  await admin.query("DELETE FROM public.ordens_servico WHERE partner_order_id = ANY($1::uuid[]) OR id = $2",
    [[orderId, orderBlockedId], osId]);
  await admin.query("DELETE FROM public.lotes WHERE id = ANY($1::uuid[])", [[loteB, loteC]]);
  await admin.query("DELETE FROM public.production_planning WHERE partner_order_id = ANY($1::uuid[])",
    [[orderId, orderBlockedId]]);
  await admin.query("DELETE FROM public.production_timeline_events WHERE partner_order_id = ANY($1::uuid[])",
    [[orderId, orderBlockedId]]);
  await admin.query("DELETE FROM public.partner_order_audit_logs WHERE order_id = ANY($1::uuid[])",
    [[orderId, orderBlockedId]]);
  await admin.query("DELETE FROM public.partner_order_items WHERE order_id = ANY($1::uuid[])",
    [[orderId, orderBlockedId]]);
  await admin.query("DELETE FROM public.partner_orders WHERE id = ANY($1::uuid[])", [[orderId, orderBlockedId]]);
  await admin.query("DELETE FROM public.partner_accounts WHERE id = $1", [partnerId]);
  await admin.query("COMMIT");

  const residue = await admin.query(
    `SELECT
       (SELECT count(*) FROM public.partner_accounts WHERE nome_fantasia LIKE $1)
     + (SELECT count(*) FROM public.partner_orders WHERE observacoes LIKE $1)
     + (SELECT count(*) FROM public.lotes WHERE codigo_lote LIKE $1)
     + (SELECT count(*) FROM public.ordens_servico WHERE numero_os LIKE $1)
     + (SELECT count(*) FROM public.controle_qualidade WHERE responsavel LIKE $1)
     + (SELECT count(*) FROM public.envase WHERE operador LIKE $1) AS n`, [`${TAG}%`]);
  rec("T10-Z zero resíduos de fixtures H5B", Number(residue.rows[0].n) === 0, `residuos=${residue.rows[0].n}`);
}

try {
  await guard();
  await setup();
  await testA();
  await testB();
  await testC();
  await testCQ();
} catch (e) {
  rec("EXECUÇÃO DO HARNESS", false, e.message);
} finally {
  if (fixtures) {
    try { await teardown(); } catch (e) { rec("TEARDOWN", false, e.message); }
  }
  await admin.end();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n=== H5B RESUMO: ${results.length - failed.length}/${results.length} PASS ===`);
console.log(failed.length === 0 ? "PASS_H5B_CONCORRENCIA" : "FAIL_H5B_CONCORRENCIA");
process.exit(failed.length === 0 ? 0 : 1);
