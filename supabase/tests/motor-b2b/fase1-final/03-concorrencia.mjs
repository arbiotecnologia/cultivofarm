#!/usr/bin/env node
/**
 * FASE 1 — PROVA REAL DE CONCORRENCIA (Motor Comercial B2B)
 * =========================================================
 * Harness externo executavel. NAO roda no ambiente do agente porque este
 * nao dispoe de credenciais de usuario `authenticated` (o projeto esta
 * classificado como `external_unmanaged`: nenhuma sessao e injetada) nem
 * de `psql`/`dblink` para abrir duas sessoes Postgres simultaneas.
 *
 * Ambiente permitido: staging ikaauvsflpmamgxmkhoq. Producao proibida.
 *
 * Execucao:
 *   SUPABASE_URL=https://ikaauvsflpmamgxmkhoq.supabase.co \
 *   SUPABASE_ANON_KEY=... \
 *   SERVICE_ROLE_KEY=...            # somente fixtures/limpeza
 *   USER_A_EMAIL=... USER_A_PASSWORD=... \
 *   USER_B_EMAIL=... USER_B_PASSWORD=... \
 *   PARTNER_ID=... PLAN_ID=... ITEM_ID=... ITEM_TIPO=produto \
 *   node supabase/tests/motor-b2b/fase1-final/03-concorrencia.mjs
 *
 * Identidades:
 *   - service_role: APENAS preparacao/limpeza de fixture;
 *   - USER_A / USER_B: identidades reais `authenticated` que executam as
 *     chamadas de negocio (gestor B2B do parceiro e admin/gestor comercial).
 */

const URL = must("SUPABASE_URL");
const ANON = must("SUPABASE_ANON_KEY");
const SERVICE = must("SERVICE_ROLE_KEY");
const PARTNER_ID = must("PARTNER_ID");
const PLAN_ID = must("PLAN_ID");
const ITEM_ID = must("ITEM_ID");
const ITEM_TIPO = process.env.ITEM_TIPO || "produto";

function must(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[concorrencia] variavel obrigatoria ausente: ${name}`);
    process.exit(2);
  }
  return v;
}

if (!URL.includes("ikaauvsflpmamgxmkhoq")) {
  console.error("[concorrencia] GUARD: somente staging ikaauvsflpmamgxmkhoq e permitido.");
  process.exit(2);
}

async function signIn(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`login falhou para ${email}: ${j.error_description || j.msg}`);
  return j.access_token;
}

/** Cliente HTTP independente (conexao propria, sem estado compartilhado). */
function rpcClient(token) {
  return async (fn, args) => {
    const t0 = Date.now();
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: ANON,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
    });
    const body = await r.text();
    return { status: r.status, body, ms: Date.now() - t0, at: new Date().toISOString() };
  };
}

const admin = async (fn, args) => {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  return { status: r.status, body: await r.text() };
};

const adminSelect = async (path) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
  });
  return r.json();
};

/** Barreira: dispara as duas chamadas no mesmo tick, sem serializacao. */
async function simultaneous(fa, fb) {
  const barrier = new Promise((res) => setTimeout(res, 50));
  const a = barrier.then(fa);
  const b = barrier.then(fb);
  return Promise.all([a, b]);
}

const results = [];
function record(caso, verdict, detail) {
  results.push({ caso, verdict, detail, at: new Date().toISOString() });
  console.log(`[${verdict}] ${caso} :: ${JSON.stringify(detail)}`);
}

async function main() {
  const tokenA = await signIn(must("USER_A_EMAIL"), must("USER_A_PASSWORD"));
  const tokenB = await signIn(must("USER_B_EMAIL"), must("USER_B_PASSWORD"));
  const rpcA = rpcClient(tokenA);
  const rpcB = rpcClient(tokenB);

  const before = await adminSelect(
    `partner_orders?partner_id=eq.${PARTNER_ID}&select=id&limit=1000`,
  );

  // -------------------------------------------------------------------
  // CASO 1 — dois checkouts simultaneos que juntos excedem o credito
  // -------------------------------------------------------------------
  const sim = await rpcA("simulate_b2b_payment_plan_secure", {
    p_partner_id: PARTNER_ID,
    p_payment_plan_id: PLAN_ID,
    p_items: [{ item_id: ITEM_ID, item_tipo: ITEM_TIPO, quantidade: 1, unidade_medida: "litro" }],
    p_first_due_date: null,
  });
  const hash = JSON.parse(sim.body)?.cart_hash;
  const mk = (key) => ({
    p_partner_id: PARTNER_ID,
    p_observacoes: "harness-concorrencia",
    p_items: [{ item_id: ITEM_ID, item_tipo: ITEM_TIPO, quantidade: 1, unidade_medida: "litro" }],
    p_requested_delivery_date: null,
    p_payment_plan_id: PLAN_ID,
    p_first_due_date: null,
    p_installment_count: null,
    p_expected_cart_hash: hash,
    p_idempotency_key: key,
  });

  const [c1a, c1b] = await simultaneous(
    () => rpcA("create_partner_order_secure", mk(`harness-c1-a-${Date.now()}`)),
    () => rpcA("create_partner_order_secure", mk(`harness-c1-b-${Date.now()}`)),
  );
  record("C1 credito concorrente", "OBSERVADO", { a: c1a, b: c1b });

  // -------------------------------------------------------------------
  // CASO 2 — mesmo checkout reenviado (idempotencia)
  // -------------------------------------------------------------------
  const dupKey = `harness-c2-${Date.now()}`;
  const [c2a, c2b] = await simultaneous(
    () => rpcA("create_partner_order_secure", mk(dupKey)),
    () => rpcA("create_partner_order_secure", mk(dupKey)),
  );
  const ids = [c2a, c2b]
    .map((r) => {
      try { return JSON.parse(r.body)?.id; } catch { return null; }
    })
    .filter(Boolean);
  record(
    "C2 idempotencia de checkout",
    new Set(ids).size === 1 ? "PASS" : "FAIL",
    { ids, a: c2a.status, b: c2b.status },
  );

  // -------------------------------------------------------------------
  // CASO 3 — duas respostas simultaneas da mesma cotacao
  // -------------------------------------------------------------------
  const quoteOrderId = process.env.QUOTE_ORDER_ID;
  if (!quoteOrderId) {
    record("C3 cotacao concorrente", "SKIP", "defina QUOTE_ORDER_ID (pedido em aguardando_cotacao)");
  } else {
    const items = await adminSelect(
      `partner_order_items?order_id=eq.${quoteOrderId}&select=id`,
    );
    const lines = items.map((i) => ({ item_id: i.id, unit_price: 10 }));
    const [c3a, c3b] = await simultaneous(
      () => rpcB("respond_b2b_order_quote_secure", { p_order_id: quoteOrderId, p_lines: lines, p_first_due_date: null, p_installment_count: null, p_motivo: "harness" }),
      () => rpcB("respond_b2b_order_quote_secure", { p_order_id: quoteOrderId, p_lines: lines, p_first_due_date: null, p_installment_count: null, p_motivo: "harness" }),
    );
    const oks = [c3a, c3b].filter((r) => r.status === 200).length;
    const notInState = [c3a, c3b].filter((r) => r.body.includes("order_not_in_quote_state")).length;
    const terms = await adminSelect(
      `partner_order_payment_terms?order_id=eq.${quoteOrderId}&select=id`,
    );
    record(
      "C3 cotacao concorrente",
      oks === 1 && notInState === 1 && terms.length === 1 ? "PASS" : "FAIL",
      { oks, notInState, terms: terms.length, a: c3a, b: c3b },
    );
  }

  const after = await adminSelect(
    `partner_orders?partner_id=eq.${PARTNER_ID}&select=id&limit=1000`,
  );
  console.log(JSON.stringify({ pedidos_antes: before.length, pedidos_depois: after.length, results }, null, 2));

  // -------------------------------------------------------------------
  // LIMPEZA — remove somente os pedidos criados pelo harness
  // -------------------------------------------------------------------
  const created = await adminSelect(
    `partner_orders?partner_id=eq.${PARTNER_ID}&observacoes=eq.harness-concorrencia&select=id`,
  );
  for (const o of created) {
    await fetch(`${URL}/rest/v1/partner_orders?id=eq.${o.id}`, {
      method: "DELETE",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
    });
  }
  console.log(`[limpeza] pedidos do harness removidos: ${created.length}`);

  const failed = results.filter((r) => r.verdict === "FAIL");
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("[concorrencia] erro:", e.message);
  process.exit(1);
});
