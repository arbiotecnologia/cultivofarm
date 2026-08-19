#!/usr/bin/env node
/**
 * H6c-001 + H6c-003 — PROVA MULTI-PREÇO E GUARD INTEGRAL.
 *
 * Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq. Produção navfzbwgwzruipouyfnk é RECUSADA.
 * Nunca imprime DSN, token ou segredo. Fixtures descartáveis, teardown sem resíduos.
 *
 * -------------------------------------------------------------------
 * CENÁRIO MULTI-PREÇO (H6c-001) — fórmula esperada, documentada
 * -------------------------------------------------------------------
 * Pedido B2B com DOIS produtos de preços/subtotais diferentes:
 *   item A: 10 un x R$ 100,00 => subtotal snapshot  R$ 1.000,00
 *   item B: 10 un x R$ 300,00 => subtotal snapshot  R$ 3.000,00
 *   base_itens = 4.000,00
 * Condição de pagamento canônica (snapshot comercial) com desconto global de 10%:
 *   final_amount (total_snapshot) = R$ 3.600,00
 *
 * Conferência parcial por embalagem (volume igual em todas: 500 ml):
 *   produto A: 2 embalagens, ambas ACEITAS            => ratio_A = 1,0
 *   produto B: 2 embalagens, 1 aceita e 1 RECUSADA    => ratio_B = 0,5
 *
 * Cálculo econômico por item (implementado em fn_entrega_valor_faturavel_v1):
 *   base_aceita = 1.000,00 x 1,0 + 3.000,00 x 0,5 = 2.500,00
 *   fator       = base_aceita / base_itens = 2.500 / 4.000 = 0,625
 *   valor       = total_snapshot x fator   = 3.600 x 0,625 = R$ 2.250,00
 *
 * Contraprova (por que um ratio global de QUANTIDADE seria errado):
 *   volume aceito global = 1.500 ml de 2.000 ml => 0,75
 *   valor errado         = 3.600 x 0,75 = R$ 2.700,00  (delta de R$ 450,00)
 * O teste exige 2.250,00 e rejeita explicitamente 2.700,00.
 *
 * -------------------------------------------------------------------
 * GUARD INTEGRAL (H6c-003)
 * -------------------------------------------------------------------
 * Entrega B2B integral (sem conferência), canônico R$ 2.000,00:
 *   G1 total exato        => PASS
 *   G2 total acima (+100) => FAIL (valor_divergente_do_canonico)
 *   G3 total abaixo (-100)=> FAIL (valor_divergente_do_canonico)
 *
 * Uso: STAGING_DSN=... node restoration/homologacao-h6/51-h6c2-multipreco-guard.mjs
 */
import pg from "pg";

const PROD_REF = "navfzbwgwzruipouyfnk";
const STAGING_REF = "ikaauvsflpmamgxmkhoq";
const DSN = process.env.STAGING_DSN;
const TAG = `H6C2-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;

if (!DSN) { console.error("ABORT: STAGING_DSN ausente"); process.exit(4); }
if (DSN.includes(PROD_REF)) { console.error("ABORT: DSN aponta para PRODUÇÃO"); process.exit(2); }
if (!DSN.includes(STAGING_REF)) { console.error("ABORT: DSN não reconhecido como staging"); process.exit(2); }

const results = [];
const rec = (gate, ok, detalhe = "") => {
  results.push({ gate, status: ok ? "PASS" : "FAIL", detalhe });
  console.log(`${ok ? "PASS" : "FAIL"} — ${gate}${detalhe ? ` :: ${detalhe}` : ""}`);
};

const SAFE_DSN = DSN.replace(/([?&])sslmode=[^&]*/g, "$1").replace(/[?&]$/, "");
const connect = async () => {
  const c = new pg.Client({ connectionString: SAFE_DSN, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
};

async function asUser(uid, fn) {
  const c = await connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE authenticated");
    await c.query("SELECT set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const out = await fn(c);
    await c.query("COMMIT");
    return { ok: true, out };
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* noop */ }
    return { ok: false, error: { message: e.message, code: e.code } };
  } finally { await c.end(); }
}

const admin = await connect();
let F = null;

async function guard() {
  const r = await admin.query(
    "SELECT project_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1");
  const ref = r.rows[0]?.project_ref;
  if (ref !== STAGING_REF) throw new Error(`STAGING_GUARD: ambiente não autorizado (${ref ?? "null"})`);
}

async function setup() {
  const adminUid = (await admin.query(
    "SELECT user_id FROM public.user_roles WHERE role::text='administrador' ORDER BY user_id LIMIT 1")).rows[0]?.user_id;
  if (!adminUid) throw new Error("H6C2_SEM_USUARIO_ADMIN");

  await admin.query("BEGIN");

  const categoryId = (await admin.query(
    `INSERT INTO public.financial_categories (name, type, active) VALUES ($1,'RECEITA',true) RETURNING id`,
    [`${TAG} CATEGORIA`])).rows[0].id;
  const clienteId = (await admin.query(
    `INSERT INTO public.clientes (nome) VALUES ($1) RETURNING id`, [`${TAG} CLIENTE`])).rows[0].id;
  const partnerId = (await admin.query(
    `INSERT INTO public.partner_accounts (nome_fantasia, razao_social, cnpj, ativo)
     VALUES ($1,$1, lpad((floor(random()*1e14))::bigint::text,14,'0'), true) RETURNING id`,
    [`${TAG} PARCEIRO`])).rows[0].id;

  const prods = (await admin.query(
    "SELECT id FROM public.produtos WHERE ativo IS NOT false ORDER BY created_at LIMIT 2")).rows;
  if (prods.length < 2) throw new Error("H6C2_PRECISA_DE_2_PRODUTOS");
  const [prodA, prodB] = [prods[0].id, prods[1].id];

  const mkLote = async (produtoId, sufixo) => (await admin.query(
    `INSERT INTO public.lotes (codigo_lote, produto_id, volume_produzido, status)
     VALUES ($1,$2,10000,'aprovado') RETURNING id`, [`${TAG}-LOTE-${sufixo}`, produtoId])).rows[0].id;
  const loteA = await mkLote(prodA, "A");
  const loteB = await mkLote(prodB, "B");

  const mkEstoque = async (produtoId, loteId) => (await admin.query(
    `INSERT INTO public.estoque_produto (produto_id, lote_id, quantidade, quantidade_reservada, volume_total, status)
     VALUES ($1,$2,100,100,100000,'disponivel') RETURNING id`, [produtoId, loteId])).rows[0].id;

  /** Cria pedido B2B com N itens e um total_snapshot explícito (final_amount). */
  const mkOrder = async (itens, finalAmount) => {
    const tabela = itens.reduce((s, i) => s + i.subtotal, 0);
    const oid = (await admin.query(
      `INSERT INTO public.partner_orders (partner_id, cliente_id, status, observacoes, total,
                                          final_amount_with_interest)
       VALUES ($1,$2,'pendente',$3,$4,$5) RETURNING id`,
      [partnerId, clienteId, `${TAG} PEDIDO`, tabela, finalAmount])).rows[0].id;
    for (const i of itens) {
      await admin.query(
        `INSERT INTO public.partner_order_items (order_id, product_id, quantidade, preco_unitario,
                                                 preco_unitario_final_snapshot, subtotal, unidade_medida,
                                                 produto_nome_snapshot)
         VALUES ($1,$2,$3,$4,$4,$5,'litro',$6)`,
        [oid, i.produtoId, i.qtd, i.preco, i.subtotal, `${TAG} ITEM`]);
    }
    await admin.query(
      `INSERT INTO public.partner_order_payment_terms
         (partner_order_id, plan_name_snapshot, plan_code_snapshot, discount_percent_snapshot,
          monthly_interest_percent_snapshot, months_count_snapshot, installment_count, first_due_date,
          table_amount, net_amount_after_discount, final_amount, approval_status, created_by)
       VALUES ($1,'H6C2 AVISTA','H6C2_AVISTA',0,0,0,1,CURRENT_DATE,$2,$3,$3,'approved',$4)`,
      [oid, tabela, finalAmount, adminUid]);
    await admin.query(`UPDATE public.partner_orders SET status='aprovado' WHERE id=$1`, [oid]);
    return oid;
  };

  const mkEntrega = async (orderId, produtoId, loteId) => {
    const epId = await mkEstoque(produtoId, loteId);
    return (await admin.query(
      `INSERT INTO public.entregas (cliente_id, partner_order_id, status, data_saida,
                                    recebido_por_nome, confirmado_por, comprovante_entrega_obrigatorio,
                                    financial_status, estoque_produto_id, lote_id, produto_id,
                                    quantidade_entregue, volume_entregue_ml)
       VALUES ($1,$2,'entregue',CURRENT_DATE,$3,$4,false,'PENDING_BILLING',$5,$6,$7,1,1000) RETURNING id`,
      [clienteId, orderId, `${TAG} RECEBEDOR`, adminUid, epId, loteId, produtoId])).rows[0].id;
  };

  // ---- M) pedido multi-preço 1000 + 3000, snapshot final 3600 --------------
  const orderM = await mkOrder([
    { produtoId: prodA, qtd: 10, preco: 100, subtotal: 1000 },
    { produtoId: prodB, qtd: 10, preco: 300, subtotal: 3000 },
  ], 3600);
  const entregaM = await mkEntrega(orderM, prodA, loteA);

  const mkEmb = async (produtoId, loteId, vol) => (await admin.query(
    `INSERT INTO public.estoque_embalagens (codigo_embalagem, status, lote_id, produto_id, volume, quantidade, unidade)
     VALUES ($1,'separado',$2,$3,$4,1,'ml') RETURNING id`,
    [`${TAG}-${Math.random().toString(36).slice(2, 10)}`, loteId, produtoId, vol])).rows[0].id;

  const a1 = await mkEmb(prodA, loteA, 500), a2 = await mkEmb(prodA, loteA, 500);
  const b1 = await mkEmb(prodB, loteB, 500), b2 = await mkEmb(prodB, loteB, 500);
  await admin.query(
    `INSERT INTO public.entrega_conferencia_itens (entrega_id, embalagem_id, status, quantidade, motivo)
     VALUES ($1,$2,'aceito',1,NULL), ($1,$3,'aceito',1,NULL),
            ($1,$4,'aceito',1,NULL), ($1,$5,'recusado',1,'H6C2 recusa parcial do item caro')`,
    [entregaM, a1, a2, b1, b2]);
  const reconcM = (await admin.query(
    `INSERT INTO public.entrega_reconciliacoes
       (entrega_id, status, itens_total, itens_aceitos, itens_recusados,
        quantidade_aceita, quantidade_recusada, volume_aceito, volume_recusado,
        ratio_aceito, faturavel, idempotency_key, reconciliado_por)
     VALUES ($1,'reconciliada',4,3,1,3,1,1500,500,0.75,true,$2,$3)
     RETURNING id, valor_faturavel_max, valor_faturavel_origem, valor_faturavel_metodo`,
    [entregaM, `${TAG}-RECONC`, adminUid])).rows[0];

  // ---- G) pedido integral (sem conferência), snapshot 2000 ----------------
  const orderG = await mkOrder([{ produtoId: prodA, qtd: 10, preco: 200, subtotal: 2000 }], 2000);
  const entregaG = await mkEntrega(orderG, prodA, loteA);

  await admin.query("COMMIT");
  F = { adminUid, categoryId, clienteId, partnerId, prodA, prodB, loteA, loteB,
        orderM, entregaM, reconcM, orderG, entregaG };
}

const faturar = (entregaId, total) => (c) =>
  c.query("SELECT public.fn_generate_receivable_from_entrega($1,$2) AS id", [
    entregaId, JSON.stringify({ total_amount: total, installment_count: 1,
      category_id: F.categoryId, first_due_date: "2026-09-18" })]);

async function m_multipreco() {
  const canon = (await admin.query(
    "SELECT public.fn_entrega_valor_faturavel_v1($1) AS j", [F.entregaM])).rows[0].j;
  const valor = Number(canon.valor);
  const fator = Number(canon.metodo?.fator);
  rec("M1 valor canônico multi-preço = R$ 2.250,00 (fator 0,625 por participação econômica)",
    Math.abs(valor - 2250) <= 0.01 && Math.abs(fator - 0.625) < 1e-6
    && canon.origem === "B2B_PAYMENT_TERMS_SNAPSHOT"
    && canon.metodo?.tipo === "participacao_economica_aceita_x_snapshot",
    `valor=${valor} fator=${fator} origem=${canon.origem} tipo=${canon.metodo?.tipo}`);

  rec("M2 ratio global por quantidade (0,75 => R$ 2.700,00) NÃO é o valor adotado",
    Math.abs(valor - 2700) > 0.01, `delta_vs_errado=${(2700 - valor).toFixed(2)}`);

  const teto = Number(F.reconcM.valor_faturavel_max);
  rec("M3 valor_faturavel_max server-side gravado = R$ 2.250,00 (±R$0,01)",
    Math.abs(teto - 2250) <= 0.01 && !!F.reconcM.valor_faturavel_origem,
    `teto=${teto} origem=${F.reconcM.valor_faturavel_origem}`);

  const acima = await asUser(F.adminUid, faturar(F.entregaM, 2700));
  const abaixo = await asUser(F.adminUid, faturar(F.entregaM, 2000));
  rec("M4 payload acima (2700) e abaixo (2000) do canônico => rejeitados sem ajuste formal",
    !acima.ok && !abaixo.ok,
    `${acima.error?.message?.slice(0, 48)} | ${abaixo.error?.message?.slice(0, 48)}`);

  const ok = await asUser(F.adminUid, faturar(F.entregaM, 2250));
  const ars = await admin.query(
    "SELECT count(*)::int c, COALESCE(max(total_amount),0) t FROM public.accounts_receivable WHERE origin_id=$1",
    [F.entregaM]);
  rec("M5 AR única exatamente no valor derivado (R$ 2.250,00)",
    ok.ok && ars.rows[0].c === 1 && Math.abs(Number(ars.rows[0].t) - 2250) <= 0.01,
    `ars=${ars.rows[0].c} total=${ars.rows[0].t} err=${ok.error?.message ?? ""}`);
}

async function g_guard_integral() {
  const call = (total) => admin.query(
    "SELECT public.fn_entrega_guard_faturamento_v1($1,$2) AS j", [F.entregaG, total]);
  let g1 = null, e1 = null;
  try { g1 = (await call(2000)).rows[0].j; } catch (e) { e1 = e.message; }
  rec("G1 guard integral com valor canônico exato (2000) => PASS",
    !!g1 && Math.abs(Number(g1.valor_faturavel_max) - 2000) <= 0.01 && g1.modo === "integral_canonico",
    g1 ? `modo=${g1.modo} max=${g1.valor_faturavel_max}` : `erro=${e1}`);

  const falhou = async (total) => {
    try { await call(total); return { ok: true }; }
    catch (e) { return { ok: false, msg: e.message }; }
  };
  const acima = await falhou(2100);
  const abaixo = await falhou(1900);
  rec("G2 guard integral rejeita total ACIMA do canônico",
    !acima.ok && /valor_divergente_do_canonico/.test(acima.msg), acima.msg?.slice(0, 70) ?? "");
  rec("G3 guard integral rejeita total ABAIXO do canônico",
    !abaixo.ok && /valor_divergente_do_canonico/.test(abaixo.msg), abaixo.msg?.slice(0, 70) ?? "");

  const tolerado = await falhou(2000.01);
  rec("G4 tolerância monetária de R$ 0,01 preservada (entrega integral legítima não quebra)", tolerado.ok);
}

async function teardown() {
  const entregas = [F.entregaM, F.entregaG];
  const orders = [F.orderM, F.orderG];
  await admin.query("BEGIN");
  await admin.query("ALTER TABLE public.partner_order_financial_links DISABLE TRIGGER USER");
  await admin.query(
    `DELETE FROM public.partner_order_financial_links WHERE partner_order_id = ANY($1)
        OR receivable_id IN (SELECT id FROM public.accounts_receivable WHERE origin_id = ANY($2))`,
    [orders, entregas]);
  await admin.query("ALTER TABLE public.partner_order_financial_links ENABLE TRIGGER USER");
  await admin.query(
    `DELETE FROM public.receivable_payments WHERE installment_id IN
       (SELECT i.id FROM public.accounts_receivable_installments i
          JOIN public.accounts_receivable a ON a.id=i.receivable_id WHERE a.origin_id = ANY($1))`, [entregas]);
  await admin.query(
    `DELETE FROM public.accounts_receivable_installments WHERE receivable_id IN
       (SELECT id FROM public.accounts_receivable WHERE origin_id = ANY($1))`, [entregas]);
  await admin.query(`DELETE FROM public.financial_audit_log WHERE entity_id = ANY($1)`, [entregas]);
  await admin.query(`DELETE FROM public.accounts_receivable WHERE origin_id = ANY($1)`, [entregas]);
  await admin.query(`DELETE FROM public.entrega_conferencia_itens WHERE entrega_id = ANY($1)`, [entregas]);
  await admin.query("ALTER TABLE public.entrega_reconciliacoes DISABLE TRIGGER USER");
  await admin.query(`DELETE FROM public.entrega_reconciliacoes WHERE entrega_id = ANY($1)`, [entregas]);
  await admin.query("ALTER TABLE public.entrega_reconciliacoes ENABLE TRIGGER USER");
  await admin.query(`DELETE FROM public.entregas WHERE id = ANY($1)`, [entregas]);
  await admin.query(`DELETE FROM public.estoque_embalagens WHERE codigo_embalagem LIKE $1`, [`${TAG}%`]);
  await admin.query("ALTER TABLE public.estoque_produto DISABLE TRIGGER USER");
  await admin.query("ALTER TABLE public.estoque_movimentacoes DISABLE TRIGGER USER");
  await admin.query(
    `DELETE FROM public.estoque_movimentacoes WHERE estoque_produto_id IN
       (SELECT id FROM public.estoque_produto WHERE lote_id = ANY($1))`, [[F.loteA, F.loteB]]);
  await admin.query(`DELETE FROM public.estoque_produto WHERE lote_id = ANY($1)`, [[F.loteA, F.loteB]]);
  await admin.query("ALTER TABLE public.estoque_movimentacoes ENABLE TRIGGER USER");
  await admin.query("ALTER TABLE public.estoque_produto ENABLE TRIGGER USER");
  await admin.query(`DELETE FROM public.controle_qualidade WHERE lote_id = ANY($1)`, [[F.loteA, F.loteB]]);
  await admin.query(`DELETE FROM public.lotes WHERE codigo_lote LIKE $1`, [`${TAG}%`]);
  await admin.query(`UPDATE public.partner_orders SET payment_terms_id = NULL WHERE id = ANY($1)`, [orders]);
  await admin.query(`DELETE FROM public.partner_order_payment_terms WHERE partner_order_id = ANY($1)`, [orders]);
  await admin.query(`UPDATE public.partner_orders SET status='pendente' WHERE id = ANY($1)`, [orders]);
  await admin.query(`DELETE FROM public.partner_order_items WHERE order_id = ANY($1)`, [orders]);
  await admin.query(`DELETE FROM public.partner_orders WHERE id = ANY($1)`, [orders]);
  await admin.query(`DELETE FROM public.partner_accounts WHERE id=$1`, [F.partnerId]);
  await admin.query(`DELETE FROM public.clientes WHERE id=$1`, [F.clienteId]);
  await admin.query(`DELETE FROM public.financial_categories WHERE id=$1`, [F.categoryId]);
  await admin.query("COMMIT");

  const residuo = Number((await admin.query(
    `SELECT (SELECT count(*) FROM public.partner_orders WHERE observacoes LIKE $1)
          + (SELECT count(*) FROM public.clientes WHERE nome LIKE $1)
          + (SELECT count(*) FROM public.lotes WHERE codigo_lote LIKE $1)
          + (SELECT count(*) FROM public.estoque_embalagens WHERE codigo_embalagem LIKE $1)
          + (SELECT count(*) FROM public.financial_categories WHERE name LIKE $1) AS n`,
    [`${TAG}%`])).rows[0].n);
  rec("M6/G5 teardown sem resíduos H6C2", residuo === 0, `residuos=${residuo}`);
}

try {
  await guard();
  await setup();
  await m_multipreco();
  await g_guard_integral();
} catch (e) {
  rec("EXECUCAO", false, e.message);
} finally {
  try { if (F) await teardown(); } catch (e) { rec("M6/G5 teardown sem resíduos H6C2", false, e.message); }
  await admin.end();
}

const pass = results.filter((r) => r.status === "PASS").length;
console.log(`\nH6C2_MULTIPRECO_GUARD: ${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
