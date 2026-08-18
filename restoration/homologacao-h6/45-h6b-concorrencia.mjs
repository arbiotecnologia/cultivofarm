#!/usr/bin/env node
/**
 * H6b — EVIDÊNCIA CONCORRENTE REAL (duas conexões pg.Client independentes).
 *
 * Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq. Produção navfzbwgwzruipouyfnk é RECUSADA.
 * Nunca imprime DSN, token ou qualquer segredo.
 *
 * T1  AR mesma chave / mesmo payload em paralelo  => 1 baixa, replay estável
 * T2  AR mesma chave / payload divergente         => conflito estável, 1 baixa
 * T3  AR duas chaves distintas, soma > saldo      => nunca ultrapassa o saldo
 * T4  AP equivalentes a T1/T2/T3
 * T5  Estorno concorrente da mesma baixa          => 1 reversão + replay estável
 * T6  Entrega B2B integral -> AR = snapshot; faturamento paralelo => 1 AR
 * T7  Entrega parcial reconciliada -> valor_faturavel_max server-side; AR = teto
 * T8  Payload com total divergente                => servidor rejeita
 * T9  Alterar parâmetros mestres após AR          => AR/parcelas imutáveis
 * T10 not_billable não gera AR
 * T11 anon não executa RPCs financeiras críticas
 * T12 papel sem alçada (producao) não baixa nem estorna
 * T13 teardown sem resíduos
 *
 * Uso: STAGING_DSN=... node restoration/homologacao-h6/45-h6b-concorrencia.mjs
 */
import pg from "pg";

const PROD_REF = "navfzbwgwzruipouyfnk";
const STAGING_REF = "ikaauvsflpmamgxmkhoq";
const DSN = process.env.STAGING_DSN;
const TAG = `H6B-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;

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

/** Executa `fn` em transação autenticada como `uid`, sincronizada em `startAt`. */
async function concurrentTx(uid, startAt, fn, role = "authenticated") {
  const c = await connect();
  try {
    await c.query("BEGIN");
    await c.query(`SET LOCAL ROLE ${role}`);
    await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role }),
    ]);
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
const barrier = (ms = 1200) => new Date(Date.now() + ms).toISOString();
let F = null;

async function guard() {
  const r = await admin.query(
    "SELECT project_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1",
  );
  const ref = r.rows[0]?.project_ref;
  if (ref !== STAGING_REF) throw new Error(`STAGING_GUARD: ambiente não autorizado (${ref ?? "null"})`);
}

async function setup() {
  const adminUid = (await admin.query(
    "SELECT user_id FROM public.user_roles WHERE role::text='administrador' ORDER BY user_id LIMIT 1")).rows[0]?.user_id;
  if (!adminUid) throw new Error("H6B_SEM_USUARIO_ADMIN");
  const prodUid = (await admin.query(
    `SELECT ur.user_id FROM public.user_roles ur
      WHERE ur.role::text='producao'
        AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                         WHERE x.user_id=ur.user_id
                           AND x.role::text IN ('administrador','gestor','financeiro'))
      ORDER BY ur.user_id LIMIT 1`)).rows[0]?.user_id ?? null;

  await admin.query("BEGIN");

  const categoryId = (await admin.query(
    `INSERT INTO public.financial_categories (name, type, active) VALUES ($1,'RECEITA',true) RETURNING id`,
    [`${TAG} CATEGORIA`])).rows[0].id;
  const pmId = (await admin.query(
    `INSERT INTO public.payment_methods (name, active) VALUES ($1,true) RETURNING id`,
    [`${TAG} PIX`])).rows[0].id;
  const bankId = (await admin.query(
    `INSERT INTO public.bank_accounts (name, active) VALUES ($1,true) RETURNING id`,
    [`${TAG} BANCO`])).rows[0].id;

  const clienteId = (await admin.query(
    `INSERT INTO public.clientes (nome) VALUES ($1) RETURNING id`, [`${TAG} CLIENTE`])).rows[0].id;

  // ---- AR/AP manuais para os testes de baixa ------------------------------
  const mkAr = async (valor) => {
    const id = (await admin.query(
      `INSERT INTO public.accounts_receivable
         (origin_type, description, category_id, customer_id, total_amount, first_due_date,
          installment_count, created_by)
       VALUES ('MANUAL', $1, $2, $3, $4, CURRENT_DATE, 1, $5) RETURNING id`,
      [`${TAG} AR`, categoryId, clienteId, valor, adminUid])).rows[0].id;
    const inst = (await admin.query(
      `SELECT id FROM public.accounts_receivable_installments WHERE receivable_id=$1 ORDER BY installment_number LIMIT 1`,
      [id])).rows[0]?.id;
    return { id, inst };
  };
  const mkAp = async (valor) => {
    const id = (await admin.query(
      `INSERT INTO public.accounts_payable
         (origin_type, description, category_id, total_amount, first_due_date, installment_count, created_by)
       VALUES ('MANUAL', $1, $2, $3, CURRENT_DATE, 1, $4) RETURNING id`,
      [`${TAG} AP`, categoryId, valor, adminUid])).rows[0].id;
    const inst = (await admin.query(
      `SELECT id FROM public.accounts_payable_installments WHERE payable_id=$1 ORDER BY installment_number LIMIT 1`,
      [id])).rows[0]?.id;
    return { id, inst };
  };

  const arT1 = await mkAr(1000), arT2 = await mkAr(1000), arT3 = await mkAr(1000), arT5 = await mkAr(1000);
  const apT1 = await mkAp(1000), apT2 = await mkAp(1000), apT3 = await mkAp(1000);

  // ---- Entregas B2B --------------------------------------------------------
  const produtoId = (await admin.query(
    "SELECT id FROM public.produtos WHERE ativo IS NOT false ORDER BY created_at LIMIT 1")).rows[0].id;
  const partnerId = (await admin.query(
    `INSERT INTO public.partner_accounts (nome_fantasia, razao_social, cnpj, ativo)
     VALUES ($1,$1, lpad((floor(random()*1e14))::bigint::text,14,'0'), true) RETURNING id`,
    [`${TAG} PARCEIRO`])).rows[0].id;

  const loteId = (await admin.query(
    `INSERT INTO public.lotes (codigo_lote, produto_id, volume_produzido, status)
     VALUES ($1,$2,10000,'aprovado') RETURNING id`, [`${TAG}-LOTE`, produtoId])).rows[0].id;
  const mkEstoque = async () => (await admin.query(
    `INSERT INTO public.estoque_produto (produto_id, lote_id, quantidade, quantidade_reservada,
                                         volume_total, status)
     VALUES ($1,$2,100,100,100000,'disponivel') RETURNING id`, [produtoId, loteId])).rows[0].id;

  const mkOrder = async (total) => {
    const oid = (await admin.query(
      `INSERT INTO public.partner_orders (partner_id, cliente_id, status, observacoes, total,
                                          final_amount_with_interest)
       VALUES ($1,$2,'pendente',$3,$4,$4) RETURNING id`,
      [partnerId, clienteId, `${TAG} PEDIDO`, total])).rows[0].id;
    await admin.query(
      `INSERT INTO public.partner_order_items (order_id, product_id, quantidade, preco_unitario,
                                               preco_unitario_final_snapshot, subtotal, unidade_medida,
                                               produto_nome_snapshot)
       VALUES ($1,$2,10,$3,$3,$4,'litro',$5)`,
      [oid, produtoId, total / 10, total, `${TAG} ITEM`]);
    await admin.query(
      `INSERT INTO public.partner_order_payment_terms
         (partner_order_id, plan_name_snapshot, plan_code_snapshot, discount_percent_snapshot,
          monthly_interest_percent_snapshot, months_count_snapshot, installment_count, first_due_date,
          table_amount, net_amount_after_discount, final_amount, approval_status, created_by)
       VALUES ($1, 'H6B AVISTA', 'H6B_AVISTA', 0, 0, 0, 1, CURRENT_DATE, $2, $2, $2, 'approved', $3)`,
      [oid, total, adminUid]);
    // H6d: aprova apos os itens/termos (itens sao imutaveis apos aprovacao) para
    // satisfazer o fail-closed H6c de pedido faturavel.
    await admin.query(`UPDATE public.partner_orders SET status='aprovado' WHERE id=$1`, [oid]);
    return oid;
  };

  const mkEntrega = async (orderId) => {
    const epId = await mkEstoque();
    return (await admin.query(
      `INSERT INTO public.entregas (cliente_id, partner_order_id, status, data_saida,
                                    recebido_por_nome, confirmado_por, comprovante_entrega_obrigatorio,
                                    financial_status, estoque_produto_id, lote_id, produto_id,
                                    quantidade_entregue, volume_entregue_ml)
       VALUES ($1,$2,'entregue',CURRENT_DATE,$3,$4,false,'PENDING_BILLING',$5,$6,$7,1,1000) RETURNING id`,
      [clienteId, orderId, `${TAG} RECEBEDOR`, adminUid, epId, loteId, produtoId])).rows[0].id;
  };

  const orderT6 = await mkOrder(2000);
  const entregaT6 = await mkEntrega(orderT6);
  const orderT7 = await mkOrder(2000);
  const entregaT7 = await mkEntrega(orderT7);
  const orderT8 = await mkOrder(2000);
  const entregaT8 = await mkEntrega(orderT8);
  const orderT10 = await mkOrder(2000);
  const entregaT10 = await mkEntrega(orderT10);
  await admin.query(
    `UPDATE public.entregas SET financial_status='NOT_BILLABLE', not_billable_reason=$2 WHERE id=$1`,
    [entregaT10, `${TAG} TESTE NAO FATURAVEL`]);

  // T7: conferência parcial (metade do volume aceito) + reconciliação
  const mkEmb = async (vol) => (await admin.query(
    `INSERT INTO public.estoque_embalagens (codigo_embalagem, status, lote_id, produto_id, volume, quantidade, unidade)
     VALUES ($1,'separado',$2,$3,$4,1,'ml') RETURNING id`,
    [`${TAG}-${Math.random().toString(36).slice(2, 10)}`, loteId, produtoId, vol])).rows[0].id;
  const embOk = await mkEmb(500), embNo = await mkEmb(500);
  await admin.query(
    `INSERT INTO public.entrega_conferencia_itens (entrega_id, embalagem_id, status, quantidade, motivo)
     VALUES ($1,$2,'aceito',1,NULL), ($1,$3,'recusado',1,'H6B teste de recusa parcial')`,
    [entregaT7, embOk, embNo]);
  const reconcT7 = (await admin.query(
    `INSERT INTO public.entrega_reconciliacoes
       (entrega_id, status, itens_total, itens_aceitos, itens_recusados,
        quantidade_aceita, quantidade_recusada, volume_aceito, volume_recusado,
        ratio_aceito, faturavel, idempotency_key, reconciliado_por)
     VALUES ($1,'reconciliada',2,1,1,1,1,500,500,0.5,true,$2,$3)
     RETURNING id, valor_faturavel_max, valor_faturavel_origem`,
    [entregaT7, `${TAG}-RECONC`, adminUid])).rows[0];

  await admin.query("COMMIT");

  F = { adminUid, prodUid, categoryId, pmId, bankId, clienteId, partnerId, produtoId, loteId,
        arT1, arT2, arT3, arT5, apT1, apT2, apT3,
        orderT6, entregaT6, orderT7, entregaT7, reconcT7, orderT8, entregaT8, orderT10, entregaT10 };
}

const payAr = (inst, key, amount, extra = {}) => (c) =>
  c.query("SELECT public.rpc_register_receivable_payment($1,$2) AS id", [
    inst, JSON.stringify({ amount_received: amount, payment_method_id: F.pmId,
      bank_account_id: F.bankId, payment_date: "2026-08-18", idempotency_key: key, ...extra }),
  ]);
const payAp = (inst, key, amount, extra = {}) => (c) =>
  c.query("SELECT public.rpc_register_payable_payment($1,$2) AS id", [
    inst, JSON.stringify({ amount_paid: amount, payment_method_id: F.pmId,
      bank_account_id: F.bankId, payment_date: "2026-08-18", idempotency_key: key, ...extra }),
  ]);

const countPayments = async (table, inst) => Number((await admin.query(
  `SELECT count(*) c FROM public.${table} WHERE installment_id=$1 AND is_reversal IS NOT TRUE`, [inst])).rows[0].c);
const sumPayments = async (table, col, inst) => Number((await admin.query(
  `SELECT COALESCE(sum(${col}),0) s FROM public.${table} WHERE installment_id=$1`, [inst])).rows[0].s);

async function t1_t2_t3_ar() {
  // T1
  let at = barrier();
  let r = await Promise.all([
    concurrentTx(F.adminUid, at, payAr(F.arT1.inst, `${TAG}-AR-T1-KEY`, 200)),
    concurrentTx(F.adminUid, at, payAr(F.arT1.inst, `${TAG}-AR-T1-KEY`, 200)),
  ]);
  const ids = r.filter((x) => x.ok).map((x) => x.out.rows[0].id);
  const n1 = await countPayments("receivable_payments", F.arT1.inst);
  rec("T1 AR mesma chave/payload => 1 baixa + replay estável",
    n1 === 1 && ids.length === 2 && ids[0] === ids[1], `baixas=${n1} ids_iguais=${ids[0] === ids[1]}`);

  // T2
  at = barrier();
  r = await Promise.all([
    concurrentTx(F.adminUid, at, payAr(F.arT2.inst, `${TAG}-AR-T2-KEY`, 200)),
    concurrentTx(F.adminUid, at, payAr(F.arT2.inst, `${TAG}-AR-T2-KEY`, 350)),
  ]);
  const n2 = await countPayments("receivable_payments", F.arT2.inst);
  const conflito = r.some((x) => !x.ok && /FIN_IDEMPOTENCY_CONFLICT/.test(x.error.message));
  rec("T2 AR mesma chave/payload divergente => conflito estável",
    n2 === 1 && conflito, `baixas=${n2} conflito=${conflito}`);

  // T3
  at = barrier();
  r = await Promise.all([
    concurrentTx(F.adminUid, at, payAr(F.arT3.inst, `${TAG}-AR-T3-A`, 800)),
    concurrentTx(F.adminUid, at, payAr(F.arT3.inst, `${TAG}-AR-T3-B`, 800)),
  ]);
  const soma = await sumPayments("receivable_payments", "amount_received", F.arT3.inst);
  rec("T3 AR duas chaves, soma > saldo => não ultrapassa saldo",
    soma <= 1000.005, `recebido=${soma} saldo=1000`);
}

async function t4_ap() {
  let at = barrier();
  let r = await Promise.all([
    concurrentTx(F.adminUid, at, payAp(F.apT1.inst, `${TAG}-AP-T1-KEY`, 200)),
    concurrentTx(F.adminUid, at, payAp(F.apT1.inst, `${TAG}-AP-T1-KEY`, 200)),
  ]);
  const ids = r.filter((x) => x.ok).map((x) => x.out.rows[0].id);
  const n1 = await countPayments("payable_payments", F.apT1.inst);
  rec("T4a AP mesma chave/payload => 1 baixa + replay estável",
    n1 === 1 && ids.length === 2 && ids[0] === ids[1], `baixas=${n1}`);

  at = barrier();
  r = await Promise.all([
    concurrentTx(F.adminUid, at, payAp(F.apT2.inst, `${TAG}-AP-T2-KEY`, 200)),
    concurrentTx(F.adminUid, at, payAp(F.apT2.inst, `${TAG}-AP-T2-KEY`, 400)),
  ]);
  const n2 = await countPayments("payable_payments", F.apT2.inst);
  const conflito = r.some((x) => !x.ok && /FIN_IDEMPOTENCY_CONFLICT/.test(x.error.message));
  rec("T4b AP mesma chave/payload divergente => conflito estável", n2 === 1 && conflito, `baixas=${n2}`);

  at = barrier();
  await Promise.all([
    concurrentTx(F.adminUid, at, payAp(F.apT3.inst, `${TAG}-AP-T3-A`, 800)),
    concurrentTx(F.adminUid, at, payAp(F.apT3.inst, `${TAG}-AP-T3-B`, 800)),
  ]);
  const soma = await sumPayments("payable_payments", "amount_paid", F.apT3.inst);
  rec("T4c AP duas chaves, soma > saldo => não ultrapassa saldo", soma <= 1000.005, `pago=${soma}`);

  // chave ausente / curta => fail-closed
  const semChave = await concurrentTx(F.adminUid, barrier(200), (c) =>
    c.query("SELECT public.rpc_register_payable_payment($1,$2)", [
      F.apT3.inst, JSON.stringify({ amount_paid: 10, payment_method_id: F.pmId })]));
  const curta = await concurrentTx(F.adminUid, barrier(200), payAp(F.apT3.inst, "abc", 10));
  rec("T4d idempotency_key ausente/curta => fail-closed",
    !semChave.ok && /FIN_IDEMPOTENCY_REQUIRED/.test(semChave.error.message)
    && !curta.ok && /FIN_IDEMPOTENCY_REQUIRED/.test(curta.error.message));
}

async function t5_estorno() {
  const p = await concurrentTx(F.adminUid, barrier(200), payAr(F.arT5.inst, `${TAG}-AR-T5-KEY`, 300));
  const pid = p.ok ? p.out.rows[0].id : null;
  const at = barrier();
  const r = await Promise.all([
    concurrentTx(F.adminUid, at, (c) =>
      c.query("SELECT public.fn_reverse_payment($1,'receivable',$2) AS id", [pid, "estorno teste h6b"])),
    concurrentTx(F.adminUid, at, (c) =>
      c.query("SELECT public.fn_reverse_payment($1,'receivable',$2) AS id", [pid, "estorno teste h6b"])),
  ]);
  const n = Number((await admin.query(
    "SELECT count(*) c FROM public.receivable_payments WHERE reversed_payment_id=$1", [pid])).rows[0].c);
  const ids = r.filter((x) => x.ok).map((x) => x.out.rows[0].id);
  const okReplay = ids.length === 2 ? ids[0] === ids[1] : ids.length === 1;
  rec("T5 estorno concorrente => 1 reversão + replay estável", n === 1 && okReplay, `reversoes=${n}`);

  const div = await concurrentTx(F.adminUid, barrier(200), (c) =>
    c.query("SELECT public.fn_reverse_payment($1,'receivable',$2)", [pid, "motivo completamente diferente"]));
  rec("T5b estorno com intenção divergente => conflito estável",
    !div.ok && /FIN_IDEMPOTENCY_CONFLICT/.test(div.error.message), div.error?.message?.slice(0, 60) ?? "");
}

const faturar = (entregaId, total, extra = {}) => (c) =>
  c.query("SELECT public.fn_generate_receivable_from_entrega($1,$2) AS id", [
    entregaId, JSON.stringify({ total_amount: total, installment_count: 1,
      category_id: F.categoryId, first_due_date: "2026-09-18", ...extra })]);

async function t6_t7_t8_t10() {
  // T6 integral
  const at = barrier();
  const r = await Promise.all([
    concurrentTx(F.adminUid, at, faturar(F.entregaT6, 2000)),
    concurrentTx(F.adminUid, at, faturar(F.entregaT6, 2000)),
  ]);
  const ars = Number((await admin.query(
    "SELECT count(*) c FROM public.accounts_receivable WHERE origin_type='DELIVERY' AND origin_id=$1", [F.entregaT6])).rows[0].c);
  const total = Number((await admin.query(
    "SELECT COALESCE(max(total_amount),0) t FROM public.accounts_receivable WHERE origin_id=$1", [F.entregaT6])).rows[0].t);
  const ids = r.filter((x) => x.ok).map((x) => x.out.rows[0].id);
  rec("T6 entrega B2B integral => AR único = snapshot canônico (2000)",
    ars === 1 && Math.abs(total - 2000) < 0.011 && (ids.length < 2 || ids[0] === ids[1]),
    `ars=${ars} total=${total} err=${r.map((x)=>x.ok?"ok":x.error.message).join(" | ")}`);

  // T7 parcial
  const teto = Number(F.reconcT7.valor_faturavel_max);
  const okTeto = Math.abs(teto - 1000) < 0.011;
  const f7 = await concurrentTx(F.adminUid, barrier(200), faturar(F.entregaT7, teto));
  const total7 = Number((await admin.query(
    "SELECT COALESCE(max(total_amount),0) t FROM public.accounts_receivable WHERE origin_id=$1", [F.entregaT7])).rows[0].t);
  rec("T7 entrega parcial => valor_faturavel_max server-side e AR = teto",
    okTeto && f7.ok && Math.abs(total7 - teto) < 0.011,
    `teto=${teto} origem=${F.reconcT7.valor_faturavel_origem} ar=${total7}`);

  // T8 payload divergente (acima e abaixo)
  const acima = await concurrentTx(F.adminUid, barrier(200), faturar(F.entregaT8, 9999));
  const abaixo = await concurrentTx(F.adminUid, barrier(200), faturar(F.entregaT8, 1));
  const ars8 = Number((await admin.query(
    "SELECT count(*) c FROM public.accounts_receivable WHERE origin_id=$1", [F.entregaT8])).rows[0].c);
  rec("T8 payload com total divergente (acima e abaixo) => rejeitado",
    !acima.ok && !abaixo.ok && ars8 === 0
    && /valor_divergente_do_canonico/.test(acima.error.message)
    && /valor_divergente_do_canonico/.test(abaixo.error.message));

  // T10 not_billable
  const nb = await concurrentTx(F.adminUid, barrier(200), faturar(F.entregaT10, 2000));
  const ars10 = Number((await admin.query(
    "SELECT count(*) c FROM public.accounts_receivable WHERE origin_id=$1", [F.entregaT10])).rows[0].c);
  rec("T10 entrega NOT_BILLABLE não gera AR", !nb.ok && ars10 === 0, nb.error?.message?.slice(0, 60) ?? "");
}

async function t9_imutabilidade() {
  const before = (await admin.query(
    `SELECT ar.total_amount, (SELECT COALESCE(sum(original_amount),0) FROM public.accounts_receivable_installments i
                               WHERE i.receivable_id = ar.id) soma
       FROM public.accounts_receivable ar WHERE ar.origin_id=$1`, [F.entregaT6])).rows[0];
  await admin.query("BEGIN");
  await admin.query(
    `UPDATE public.produtos SET valor_litro_brl = COALESCE(valor_litro_brl,0) + 999 WHERE id=$1`, [F.produtoId]);
  const after = (await admin.query(
    `SELECT ar.total_amount, (SELECT COALESCE(sum(original_amount),0) FROM public.accounts_receivable_installments i
                               WHERE i.receivable_id = ar.id) soma
       FROM public.accounts_receivable ar WHERE ar.origin_id=$1`, [F.entregaT6])).rows[0];
  await admin.query("ROLLBACK");
  rec("T9 alteração de parâmetros mestres não altera AR/parcelas",
    Number(before.total_amount) === Number(after.total_amount) && Number(before.soma) === Number(after.soma),
    `antes=${before.total_amount} depois=${after.total_amount}`);
}

async function t11_anon() {
  const fns = [
    ["rpc_register_receivable_payment(uuid,jsonb)"],
    ["rpc_register_payable_payment(uuid,jsonb)"],
    ["fn_reverse_payment(uuid,text,text)"],
    ["fn_generate_receivable_from_entrega(uuid,jsonb)"],
    ["fn_entrega_valor_faturavel_v1(uuid)"],
  ];
  const rows = await admin.query(
    `SELECT p.oid::regprocedure::text sig, has_function_privilege('anon', p.oid, 'EXECUTE') can
       FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
        AND p.oid::regprocedure::text = ANY($1)`,
    [fns.map((f) => `public.${f[0]}`)]);
  const bad = rows.rows.filter((r) => r.can).map((r) => r.sig);
  rec("T11 anon sem EXECUTE nas RPCs financeiras críticas", bad.length === 0, bad.join(", "));
}

async function t12_sem_alcada() {
  if (!F.prodUid) { rec("T12 papel sem alçada não baixa/estorna (SKIP: sem usuário 'producao')", true); return; }
  const b = await concurrentTx(F.prodUid, barrier(200), payAr(F.arT1.inst, `${TAG}-T12-KEY`, 10));
  const alvo = (await admin.query(
    "SELECT id FROM public.receivable_payments WHERE installment_id=$1 LIMIT 1", [F.arT1.inst])).rows[0];
  const e = alvo
    ? await concurrentTx(F.prodUid, barrier(200), (c) =>
        c.query("SELECT public.fn_reverse_payment($1,'receivable','tentativa indevida')", [alvo.id]))
    : { ok: false, error: { code: "SEM_BAIXA" } };
  rec("T12 papel sem alçada não registra baixa nem estorna", !b.ok && !e.ok,
    `${b.error?.code ?? ""}/${e.error?.code ?? ""}`);
}


async function teardown() {
  await admin.query("BEGIN");
  // H6d: o trigger trg_h6c_entrega_ar_b2b_link cria vinculos financeiros
  // apontando para os recebiveis; removidos primeiro para liberar o FK.
  await admin.query("ALTER TABLE public.partner_order_financial_links DISABLE TRIGGER USER");
  await admin.query(
    `DELETE FROM public.partner_order_financial_links WHERE partner_order_id = ANY($1)
        OR receivable_id IN (SELECT id FROM public.accounts_receivable
                              WHERE description LIKE $2 OR origin_id = ANY($1))`,
    [[F.orderT6, F.orderT7, F.orderT8, F.orderT10, F.entregaT6, F.entregaT7, F.entregaT8, F.entregaT10],
     `${TAG}%`]);
  await admin.query("ALTER TABLE public.partner_order_financial_links ENABLE TRIGGER USER");
  await admin.query(
    `DELETE FROM public.receivable_payments WHERE installment_id IN
       (SELECT i.id FROM public.accounts_receivable_installments i
          JOIN public.accounts_receivable a ON a.id=i.receivable_id
         WHERE a.description LIKE $1 OR a.origin_id IN ($2,$3,$4,$5))`,
    [`${TAG}%`, F.entregaT6, F.entregaT7, F.entregaT8, F.entregaT10]);
  await admin.query(
    `DELETE FROM public.payable_payments WHERE installment_id IN
       (SELECT i.id FROM public.accounts_payable_installments i
          JOIN public.accounts_payable a ON a.id=i.payable_id WHERE a.description LIKE $1)`, [`${TAG}%`]);
  await admin.query(`DELETE FROM public.entrega_conferencia_itens WHERE entrega_id = ANY($1)`,
    [[F.entregaT6, F.entregaT7, F.entregaT8, F.entregaT10]]);
  // A reconciliação é imutável por trigger (proteção H5). Para remover apenas as
  // fixtures descartáveis do harness, o gatilho é suspenso na própria transação.
  await admin.query("ALTER TABLE public.entrega_reconciliacoes DISABLE TRIGGER USER");
  await admin.query(`DELETE FROM public.entrega_reconciliacoes WHERE entrega_id = ANY($1)`,
    [[F.entregaT6, F.entregaT7, F.entregaT8, F.entregaT10]]);
  await admin.query("ALTER TABLE public.entrega_reconciliacoes ENABLE TRIGGER USER");
  await admin.query(`DELETE FROM public.entregas WHERE id = ANY($1)`,
    [[F.entregaT6, F.entregaT7, F.entregaT8, F.entregaT10]]);
  await admin.query(
    `DELETE FROM public.accounts_receivable_installments WHERE receivable_id IN
       (SELECT id FROM public.accounts_receivable WHERE description LIKE $1 OR origin_id = ANY($2))`,
    [`${TAG}%`, [F.entregaT6, F.entregaT7, F.entregaT8, F.entregaT10]]);
  await admin.query(
    `DELETE FROM public.accounts_payable_installments WHERE payable_id IN
       (SELECT id FROM public.accounts_payable WHERE description LIKE $1)`, [`${TAG}%`]);
  await admin.query(`DELETE FROM public.financial_audit_log WHERE entity_id = ANY($1)`,
    [[F.entregaT6, F.entregaT7, F.entregaT8, F.entregaT10]]);
  await admin.query(`DELETE FROM public.accounts_receivable WHERE description LIKE $1 OR origin_id = ANY($2)`,
    [`${TAG}%`, [F.entregaT6, F.entregaT7, F.entregaT8, F.entregaT10]]);
  await admin.query(`DELETE FROM public.accounts_payable WHERE description LIKE $1`, [`${TAG}%`]);
  await admin.query(`DELETE FROM public.entrega_conferencia_itens WHERE entrega_id = ANY($1)`,
    [[F.entregaT6, F.entregaT7, F.entregaT8, F.entregaT10]]);
  await admin.query(`DELETE FROM public.entregas WHERE id = ANY($1)`,
    [[F.entregaT6, F.entregaT7, F.entregaT8, F.entregaT10]]);
  await admin.query(`DELETE FROM public.estoque_embalagens WHERE codigo_embalagem LIKE $1`, [`${TAG}%`]);
  await admin.query(`DELETE FROM public.controle_qualidade WHERE lote_id=$1`, [F.loteId]);
  // Estoque é protegido pelo motor canônico (H5); o gatilho é suspenso apenas
  // para remover as fixtures descartáveis criadas por este harness.
  await admin.query("ALTER TABLE public.estoque_produto DISABLE TRIGGER USER");
  await admin.query("ALTER TABLE public.estoque_movimentacoes DISABLE TRIGGER USER");
  await admin.query(
    `DELETE FROM public.estoque_movimentacoes WHERE estoque_produto_id IN
       (SELECT id FROM public.estoque_produto WHERE lote_id=$1)`, [F.loteId]);
  await admin.query(`DELETE FROM public.estoque_produto WHERE lote_id=$1`, [F.loteId]);
  await admin.query("ALTER TABLE public.estoque_movimentacoes ENABLE TRIGGER USER");
  await admin.query("ALTER TABLE public.estoque_produto ENABLE TRIGGER USER");
  await admin.query(`DELETE FROM public.lotes WHERE codigo_lote LIKE $1`, [`${TAG}%`]);
  // H6d: desfaz o vinculo canonico (partner_orders.payment_terms_id) antes de
  // remover os termos, senao o FK partner_orders_payment_terms_id_fkey barra.
  await admin.query(`UPDATE public.partner_orders SET payment_terms_id = NULL WHERE id = ANY($1)`,
    [[F.orderT6, F.orderT7, F.orderT8, F.orderT10]]);
  await admin.query(`DELETE FROM public.partner_order_payment_terms WHERE partner_order_id = ANY($1)`,
    [[F.orderT6, F.orderT7, F.orderT8, F.orderT10]]);
  // H6d: itens sao imutaveis em pedido aprovado; volta ao rascunho antes de limpar.
  await admin.query(`UPDATE public.partner_orders SET status='pendente' WHERE id = ANY($1)`,
    [[F.orderT6, F.orderT7, F.orderT8, F.orderT10]]);
  await admin.query(`DELETE FROM public.partner_order_items WHERE order_id = ANY($1)`,
    [[F.orderT6, F.orderT7, F.orderT8, F.orderT10]]);
  await admin.query(`DELETE FROM public.partner_orders WHERE id = ANY($1)`,
    [[F.orderT6, F.orderT7, F.orderT8, F.orderT10]]);
  await admin.query(`DELETE FROM public.partner_accounts WHERE id=$1`, [F.partnerId]);
  await admin.query(`DELETE FROM public.clientes WHERE id=$1`, [F.clienteId]);
  await admin.query(`DELETE FROM public.bank_accounts WHERE id=$1`, [F.bankId]);
  await admin.query(`DELETE FROM public.payment_methods WHERE id=$1`, [F.pmId]);
  await admin.query(`DELETE FROM public.financial_categories WHERE id=$1`, [F.categoryId]);
  await admin.query("COMMIT");

  const residuo = Number((await admin.query(
    `SELECT (SELECT count(*) FROM public.accounts_receivable WHERE description LIKE $1)
          + (SELECT count(*) FROM public.accounts_payable WHERE description LIKE $1)
          + (SELECT count(*) FROM public.partner_orders WHERE observacoes LIKE $1)
          + (SELECT count(*) FROM public.clientes WHERE nome LIKE $1) AS n`, [`${TAG}%`])).rows[0].n);
  rec("T13 teardown sem resíduos", residuo === 0, `residuos=${residuo}`);
}

try {
  await guard();
  await setup();
  await t1_t2_t3_ar();
  await t4_ap();
  await t5_estorno();
  await t6_t7_t8_t10();
  await t9_imutabilidade();
  await t11_anon();
  await t12_sem_alcada();
} catch (e) {
  rec("EXECUCAO", false, e.message);
} finally {
  try { if (F) await teardown(); } catch (e) { rec("T13 teardown sem resíduos", false, e.message); }
  await admin.end();
}

const pass = results.filter((r) => r.status === "PASS").length;
console.log(`\nH6B_CONCORRENCIA: ${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
