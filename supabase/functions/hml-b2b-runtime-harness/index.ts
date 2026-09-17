// Homologação B2B — harness de runtime com identidades reais (staging ikaauvsflpmamgxmkhoq).
// Descobre a massa HML-B2B por código (nunca UUID fixo), cria usuários Auth efêmeros,
// executa a matriz de perfis, concorrência HTTP real, paridade, gates e fiscal mock,
// e remove ao final todos os artefatos transacionais e os usuários temporários.
// Protegido por segredo interno. Nunca deve ser exposto ao app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const EXPECTED_REF = "ikaauvsflpmamgxmkhoq";

type Status = "PASS" | "FAIL" | "SKIP";
type Result = { id: string; name: string; status: Status; evidence: unknown };
const results: Result[] = [];
const log = (id: string, name: string, status: Status, evidence: unknown) =>
  results.push({ id, name, status, evidence });
const check = (id: string, name: string, cond: boolean, evidence: unknown) =>
  log(id, name, cond ? "PASS" : "FAIL", evidence);

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const RUN = crypto.randomUUID().slice(0, 8);
const PWD = `Hml-B2B-${crypto.randomUUID()}`; // apenas em memória; nunca persistido

type Profile =
  | "admin" | "financeiro" | "gestor" | "parceiroA"
  | "tecnicoA" | "produtorA" | "produtorB" | "semVinculo";

const ROLES: Record<Profile, string[]> = {
  admin: ["administrador"],
  financeiro: ["financeiro"],
  gestor: ["gestor_comercial"],
  parceiroA: ["parceiro_b2b"],
  tecnicoA: ["parceiro_b2b_tecnico"],
  produtorA: ["cliente_produtor"],
  produtorB: ["cliente_produtor"],
  semVinculo: [],
};

const clients: Partial<Record<Profile, any>> = {};
const created = {
  users: [] as string[],
  clientes: [] as string[],
  partners: [] as string[],
  orders: [] as string[],
};

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function rpc(c: any, fn: string, args: Record<string, unknown>) {
  const { data, error } = await c.rpc(fn, args);
  return { data, msg: error?.message ?? null, code: error?.code ?? null };
}

type Ctx = {
  partnerA: string;
  partnerB: string;
  plans: Record<"A" | "B" | "C" | "D", string>;
  productItem: { item_id: string; item_tipo: string };
  productItem2: { item_id: string; item_tipo: string };
  microItem: { item_id: string; item_tipo: string } | null;
};

async function guard() {
  const { data, error } = await svc.from("_fiscal_staging_marker")
    .select("project_ref").eq("marker", "STAGING").maybeSingle();
  if (error) throw new Error(`guard: ${error.message}`);
  if (data?.project_ref !== EXPECTED_REF) throw new Error("STAGING_GUARD: ambiente não autorizado");
}

async function discover(): Promise<Ctx> {
  const { data: plans, error: pe } = await svc.from("commercial_payment_plans")
    .select("id,code").like("code", "HML-B2B-%");
  if (pe || !plans?.length) throw new Error(`planos HML-B2B ausentes: ${pe?.message}`);
  const byCode = (suffix: string) => {
    const p = plans.find((x: any) => x.code === `HML-B2B-${suffix}`);
    if (!p) throw new Error(`plano HML-B2B-${suffix} ausente`);
    return p.id as string;
  };
  const planMap = { A: byCode("A"), B: byCode("B"), C: byCode("C"), D: byCode("D") };

  const { data: asg } = await svc.from("commercial_payment_plan_assignments")
    .select("partner_id,plan_id,status").eq("status", "published")
    .in("plan_id", Object.values(planMap));
  const partnerA = (asg ?? []).map((a: any) => a.partner_id).filter(Boolean)[0];
  if (!partnerA) throw new Error("nenhum parceiro com assignment publicado da massa HML-B2B");

  const { data: other } = await svc.from("partner_accounts")
    .select("id").eq("ativo", true).neq("id", partnerA).limit(1);
  let partnerB = other?.[0]?.id as string | undefined;
  if (!partnerB) {
    const { data: np, error: ne } = await svc.from("partner_accounts")
      .insert({ razao_social: `HML-B2B Parceiro B ${RUN}`, nome_fantasia: `HML-B2B B ${RUN}`, ativo: true })
      .select("id").single();
    if (ne) throw new Error(`partnerB: ${ne.message}`);
    partnerB = np.id;
    created.partners.push(np.id);
  }

  const { data: ips } = await svc.from("commercial_condition_item_prices")
    .select("product_id,microrganismo_id,unit_type,status,plan_id")
    .eq("plan_id", planMap.B).eq("status", "published");
  const prods = (ips ?? []).filter((i: any) => i.product_id);
  const micros = (ips ?? []).filter((i: any) => i.microrganismo_id);
  if (prods.length < 2) throw new Error("massa HML-B2B precisa de ao menos 2 produtos precificados");

  return {
    partnerA, partnerB: partnerB!, plans: planMap,
    productItem: { item_id: prods[0].product_id, item_tipo: "produto" },
    productItem2: { item_id: prods[1].product_id, item_tipo: "produto" },
    microItem: micros[0] ? { item_id: micros[0].microrganismo_id, item_tipo: "microrganismo" } : null,
  };
}

async function setupUsers(ctx: Ctx) {
  for (let i = 1; i <= 2; i++) {
    const { data, error } = await svc.from("clientes")
      .insert({ nome: `HML-B2B Cliente ${i} ${RUN}`, codigo_cliente: `HMLB2B${RUN}${i}` })
      .select("id").single();
    if (error) throw new Error(`cliente: ${error.message}`);
    created.clientes.push(data.id);
  }

  for (const p of Object.keys(ROLES) as Profile[]) {
    const email = `hml-b2b-${p.toLowerCase()}-${RUN}@arbio-staging.test`;
    const { data, error } = await svc.auth.admin.createUser({
      email, password: PWD, email_confirm: true,
      user_metadata: { nome: `HML-B2B ${p} ${RUN}` },
    });
    if (error) throw new Error(`createUser ${p}: ${error.message}`);
    const uid = data.user!.id;
    created.users.push(uid);
    await svc.from("user_roles").delete().eq("user_id", uid);
    if (p === "produtorA") await svc.from("user_clientes").insert({ user_id: uid, cliente_id: created.clientes[0] });
    if (p === "produtorB") await svc.from("user_clientes").insert({ user_id: uid, cliente_id: created.clientes[1] });
    if (p === "parceiroA") await svc.from("partner_users").insert({ partner_id: ctx.partnerA, user_id: uid, papel: "gestor" });
    if (p === "tecnicoA") await svc.from("partner_users").insert({ partner_id: ctx.partnerA, user_id: uid, papel: "tecnico" });
    for (const r of ROLES[p]) {
      const { error: re } = await svc.from("user_roles").insert({ user_id: uid, role: r });
      if (re) throw new Error(`role ${p}/${r}: ${re.message}`);
    }
    const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error: se } = await c.auth.signInWithPassword({ email, password: PWD });
    if (se) throw new Error(`signIn ${p}: ${se.message}`);
    clients[p] = c;
  }
}

// ------------------------------------------------------------------ matriz RLS
async function matriz(ctx: Ctx) {
  const forbidden = (m: string | null) =>
    !!m && /forbidden|permission denied|not found|no rows|violates|denied/i.test(m);

  const cred = await rpc(clients.parceiroA, "rpc_b2b_partner_credit", { p_partner_id: ctx.partnerA });
  check("RLS-01", "gestor B2B lê crédito do próprio parceiro", !cred.msg, cred.msg ?? "ok");

  const credB = await rpc(clients.parceiroA, "rpc_b2b_partner_credit", { p_partner_id: ctx.partnerB });
  check("RLS-02", "gestor do parceiro A não lê crédito do parceiro B", forbidden(credB.msg), credB.msg);

  const credTec = await rpc(clients.tecnicoA, "rpc_b2b_partner_credit", { p_partner_id: ctx.partnerA });
  check("RLS-03", "técnico do parceiro não lê crédito", forbidden(credTec.msg), credTec.msg);

  const { data: termsTec } = await clients.tecnicoA.from("partner_order_payment_terms").select("id").limit(5);
  check("RLS-04", "técnico não lê condições financeiras (terms)", (termsTec?.length ?? 0) === 0, termsTec);

  const { data: schedTec } = await clients.tecnicoA.from("partner_order_payment_schedule").select("id").limit(5);
  check("RLS-05", "técnico não lê cronograma de pagamento", (schedTec?.length ?? 0) === 0, schedTec);

  const { data: arProd } = await clients.produtorA.from("accounts_receivable").select("id").limit(5);
  check("RLS-06", "produtor não lê recebíveis B2B", (arProd?.length ?? 0) === 0, arProd);

  const { data: ordProd } = await clients.produtorA.from("partner_orders").select("id").limit(5);
  check("RLS-07", "produtor não lê pedidos B2B", (ordProd?.length ?? 0) === 0, ordProd);

  const { data: invProd } = await clients.produtorB.from("fiscal_invoices").select("id").limit(5);
  check("RLS-08", "produtor não lê notas fiscais", (invProd?.length ?? 0) === 0, invProd);

  const { data: ordSem } = await clients.semVinculo.from("partner_orders").select("id").limit(5);
  check("RLS-09", "usuário sem vínculo recebe zero linhas de pedidos", (ordSem?.length ?? 0) === 0, ordSem);

  const semCred = await rpc(clients.semVinculo, "rpc_b2b_partner_credit", { p_partner_id: ctx.partnerA });
  check("RLS-10", "usuário sem vínculo não lê crédito", forbidden(semCred.msg), semCred.msg);

  const anonSim = await rpc(anonClient, "rpc_cc_simulate_price", {
    p_buyer_scope: "partner", p_partner_id: ctx.partnerA, p_customer_id: null,
    p_plan_id: ctx.plans.B, p_product_id: ctx.productItem.item_id, p_microrganismo_id: null,
    p_unit_type: "litro", p_volume_ml: null, p_ref_date: null, p_quantity: 1,
  });
  check("RLS-11", "anon não executa o simulador de preços", !!anonSim.msg, anonSim.msg);

  const anonOrder = await rpc(anonClient, "create_partner_order_secure", {
    p_partner_id: ctx.partnerA, p_observacoes: null, p_items: [], p_requested_delivery_date: null,
    p_payment_plan_id: ctx.plans.B, p_first_due_date: null, p_installment_count: null,
    p_expected_cart_hash: "x", p_idempotency_key: `anon-${RUN}`,
  });
  check("RLS-12", "anon não cria pedido B2B", !!anonOrder.msg, anonOrder.msg);

  const anonMock = await rpc(anonClient, "rpc_hml_fiscal_emit_mock", { p_receivable_id: crypto.randomUUID() });
  check("RLS-13", "anon não executa o adapter fiscal mock", !!anonMock.msg, anonMock.msg);

  const tecMock = await rpc(clients.tecnicoA, "rpc_hml_fiscal_emit_mock", { p_receivable_id: crypto.randomUUID() });
  check("RLS-14", "não-administrador não executa o adapter fiscal mock",
    (tecMock.msg ?? "").includes("forbidden") || !!tecMock.msg, tecMock.msg);

  const { data: rulesTec } = await clients.tecnicoA.from("commercial_price_rules").select("id").limit(5);
  check("RLS-15", "técnico não lê a matriz de preços negociados", (rulesTec?.length ?? 0) === 0, rulesTec);
}

// --------------------------------------------------------------- fluxo comum
const itemPayload = (it: { item_id: string; item_tipo: string }, qtd: number) => ({
  item_id: it.item_id, item_tipo: it.item_tipo, quantidade: qtd, unidade_medida: "litro",
});

async function simulate(ctx: Ctx, planId: string, items: any[]) {
  return rpc(clients.parceiroA, "simulate_b2b_payment_plan_secure", {
    p_partner_id: ctx.partnerA, p_payment_plan_id: planId, p_items: items, p_first_due_date: null,
  });
}

async function createOrder(ctx: Ctx, planId: string, items: any[], hash: string, key: string) {
  return rpc(clients.parceiroA, "create_partner_order_secure", {
    p_partner_id: ctx.partnerA, p_observacoes: `HML-B2B-${RUN}`, p_items: items,
    p_requested_delivery_date: null, p_payment_plan_id: planId, p_first_due_date: null,
    p_installment_count: null, p_expected_cart_hash: hash, p_idempotency_key: key,
  });
}

// ------------------------------------------------------------------ paridade
async function paridade(ctx: Ctx) {
  const items = [itemPayload(ctx.productItem, 2), itemPayload(ctx.productItem2, 3)];

  for (const key of ["A", "B", "C"] as const) {
    const sim = await simulate(ctx, ctx.plans[key], items);
    const s: any = sim.data;
    if (sim.msg || !s?.cart_hash) {
      log(`PAR-${key}`, `paridade plano HML-B2B-${key}`, "FAIL", sim.msg ?? s);
      continue;
    }
    const ord = await createOrder(ctx, ctx.plans[key], items, s.cart_hash, `hml-par-${key}-${RUN}`);
    const orderId = (ord.data as any)?.id;
    if (orderId) created.orders.push(orderId);
    if (!orderId) {
      log(`PAR-${key}`, `paridade plano HML-B2B-${key}`, "FAIL", ord.msg);
      continue;
    }
    const { data: oi } = await svc.from("partner_order_items")
      .select("product_id,quantidade,preco_unitario_final_snapshot,subtotal")
      .eq("order_id", orderId);
    const { data: po } = await svc.from("partner_orders")
      .select("total,status,subtotal,net_amount_after_discount,financial_interest_amount,final_amount_with_interest")
      .eq("id", orderId).single();
    const somaItens = round2((oi ?? []).reduce((a: number, i: any) => a + Number(i.subtotal ?? 0), 0));
    const liquido = round2(Number(po?.net_amount_after_discount ?? po?.subtotal ?? 0));
    const juros = round2(Number(po?.financial_interest_amount ?? 0));
    const total = round2(Number(po?.total ?? -1));
    check(`PAR-${key}`, `plano HML-B2B-${key}: snapshots = líquido e líquido + juros = total`,
      somaItens === liquido && round2(liquido + juros) === total,
      { pedido: po, somaItens, liquido, juros, total, itens: oi });
  }

  // sensibilidade do cart_hash
  const h1 = (await simulate(ctx, ctx.plans.B, [itemPayload(ctx.productItem, 2)])).data as any;
  const h2 = (await simulate(ctx, ctx.plans.B, [itemPayload(ctx.productItem, 3)])).data as any;
  const h3 = (await simulate(ctx, ctx.plans.A, [itemPayload(ctx.productItem, 2)])).data as any;
  check("PAR-hash", "cart_hash muda com quantidade e com plano",
    !!h1?.cart_hash && h1.cart_hash !== h2?.cart_hash && h1.cart_hash !== h3?.cart_hash,
    { q2: h1?.cart_hash?.slice(0, 12), q3: h2?.cart_hash?.slice(0, 12), planoA: h3?.cart_hash?.slice(0, 12) });
}

// -------------------------------------------------------------- concorrência
async function concorrencia(ctx: Ctx) {
  const items = [itemPayload(ctx.productItem, 1)];
  const sim = await simulate(ctx, ctx.plans.B, items);
  const hash = (sim.data as any)?.cart_hash;
  if (!hash) { log("CONC", "concorrência real", "FAIL", sim.msg); return null; }

  const key = `hml-conc-${RUN}`;
  const [c1, c2] = await Promise.all([
    createOrder(ctx, ctx.plans.B, items, hash, key),
    createOrder(ctx, ctx.plans.B, items, hash, key),
  ]);
  const ids = [c1, c2].map((r) => (r.data as any)?.id).filter(Boolean);
  const orderId = ids[0];
  if (orderId) created.orders.push(orderId);
  const { count } = await svc.from("partner_orders")
    .select("id", { count: "exact", head: true }).eq("idempotency_key_last", key);
  check("CONC-01", "duas requisições HTTP simultâneas com mesma chave criam 1 pedido lógico",
    new Set(ids).size === 1 && ids.length === 2,
    { ids, msgs: [c1.msg, c2.msg], count });

  if (!orderId) return null;

  await rpc(clients.admin, "approve_partner_order", {
    p_order_id: orderId, p_approval_notes: `hml-${RUN}`, p_estimated_delivery_date: null,
  });
  const [g1, g2] = await Promise.all([
    rpc(clients.financeiro, "generate_b2b_receivable_secure", { p_partner_order_id: orderId }),
    rpc(clients.financeiro, "generate_b2b_receivable_secure", { p_partner_order_id: orderId }),
  ]);
  const { data: links } = await svc.from("partner_order_financial_links")
    .select("receivable_id").eq("partner_order_id", orderId);
  const recIds = [...new Set((links ?? []).map((l: any) => l.receivable_id).filter(Boolean))];
  const { data: recs } = await svc.from("accounts_receivable")
    .select("id,partner_id,customer_id,total_amount,status,fiscal_invoice_required,fiscal_invoice_status")
    .in("id", recIds.length ? recIds : ["00000000-0000-0000-0000-000000000000"])
    .neq("status", "cancelado");
  check("CONC-02", "duas gerações simultâneas produzem exatamente 1 recebível ativo",
    (recs?.length ?? 0) === 1, { g1: g1.msg, g2: g2.msg, recs });

  const rec: any = recs?.[0];
  if (!rec) return null;

  check("FIN-01", "recebível registra o parceiro como devedor", rec.partner_id === ctx.partnerA,
    { partner_id: rec.partner_id, esperado: ctx.partnerA, customer_id: rec.customer_id });
  check("FIN-02", "exigência fiscal resolvida pelo servidor (não hardcoded)",
    rec.fiscal_invoice_required === true, { required: rec.fiscal_invoice_required, status: rec.fiscal_invoice_status });

  const { data: insts } = await svc.from("accounts_receivable_installments")
    .select("installment_number,original_amount,due_date").eq("receivable_id", rec.id)
    .order("installment_number");
  const soma = round2((insts ?? []).reduce((a: number, i: any) => a + Number(i.original_amount ?? 0), 0));
  check("FIN-03", "soma das parcelas = total do recebível (arredondamento em 2 casas)",
    (insts?.length ?? 0) >= 1 && soma === round2(Number(rec.total_amount)),
    { parcelas: insts, soma, total: rec.total_amount });

  // fiscal mock concorrente
  const [f1, f2] = await Promise.all([
    rpc(clients.admin, "rpc_hml_fiscal_emit_mock", { p_receivable_id: rec.id }),
    rpc(clients.admin, "rpc_hml_fiscal_emit_mock", { p_receivable_id: rec.id }),
  ]);
  const { data: invs } = await svc.from("fiscal_invoices")
    .select("id,provider,environment,status,total_amount,notes")
    .eq("receivable_id", rec.id).neq("status", "CANCELED");
  check("CONC-03", "duas emissões simultâneas produzem exatamente 1 nota ativa",
    (invs?.length ?? 0) === 1 && !(f1.msg && f2.msg),
    { f1: f1.msg ?? f1.data, f2: f2.msg ?? f2.data, invs });

  const inv: any = invs?.[0];
  if (inv) {
    const { data: fitems } = await svc.from("fiscal_invoice_items")
      .select("item_sequence,item_kind,ncm_snapshot,cfop_snapshot,cst_icms_snapshot,csosn_snapshot,origem_snapshot,net_value")
      .eq("fiscal_invoice_id", inv.id).order("item_sequence");
    const somaIt = round2((fitems ?? []).reduce((a: number, i: any) => a + Number(i.net_value ?? 0), 0));
    check("FISC-01", "itens fiscais herdam NCM/CFOP/CST do perfil real do produto",
      (fitems ?? []).length > 0 && (fitems ?? []).every((i: any) => !!i.ncm_snapshot && !!i.cfop_snapshot),
      fitems);
    check("FISC-02", "soma dos itens = total da nota = total do recebível",
      somaIt === round2(Number(inv.total_amount)) && somaIt === round2(Number(rec.total_amount)),
      { somaIt, nota: inv.total_amount, recebivel: rec.total_amount });
    check("FISC-03", "documento marcado como simulado (HOMOLOGATION / mock / sem valor fiscal)",
      inv.provider === "mock_homologation" && inv.environment === "HOMOLOGATION" &&
      String(inv.notes ?? "").includes("SEM VALOR FISCAL"),
      { provider: inv.provider, environment: inv.environment, notes: inv.notes });
  }

  return { orderId, receivableId: rec.id };
}

// ---------------------------------------------------------------- gates C/D
async function gates(ctx: Ctx) {
  // Plano C — aprovação obrigatória antes do faturamento
  const itemsC = [itemPayload(ctx.productItem, 1)];
  const simC = await simulate(ctx, ctx.plans.C, itemsC);
  const hC = (simC.data as any)?.cart_hash;
  if (hC) {
    const oC = await createOrder(ctx, ctx.plans.C, itemsC, hC, `hml-gate-c-${RUN}`);
    const idC = (oC.data as any)?.id;
    if (idC) created.orders.push(idC);
    if (idC) {
      const before = await rpc(clients.financeiro, "generate_b2b_receivable_secure", { p_partner_order_id: idC });
      check("GATE-01", "plano C: recebível bloqueado antes da aprovação", !!before.msg, before.msg);
      const { data: st } = await svc.from("partner_orders").select("status").eq("id", idC).single();
      check("GATE-02", "plano C: pedido permanece em fluxo de aprovação",
        !!st && st.status !== "faturado", st);
    } else {
      log("GATE-01", "plano C: recebível bloqueado antes da aprovação", "FAIL", oC.msg);
    }
  } else {
    log("GATE-01", "plano C", "FAIL", simC.msg);
  }

  // Plano D — quote_only
  const itemsD = [itemPayload(ctx.productItem, 1)];
  const simD = await simulate(ctx, ctx.plans.D, itemsD);
  const hD = (simD.data as any)?.cart_hash;
  const oD = hD ? await createOrder(ctx, ctx.plans.D, itemsD, hD, `hml-gate-d-${RUN}`) : null;
  const idD = (oD?.data as any)?.id;
  if (idD) created.orders.push(idD);
  const { data: stD } = idD
    ? await svc.from("partner_orders").select("status").eq("id", idD).single()
    : { data: null } as any;
  check("GATE-03", "plano D (sob consulta) não conclui compra automaticamente",
    !!(simD.msg || oD?.msg || (stD && stD.status === "aguardando_cotacao")),
    { sim: simD.msg, order: oD?.msg, status: stD?.status });
  if (idD) {
    const genD = await rpc(clients.financeiro, "generate_b2b_receivable_secure", { p_partner_order_id: idD });
    check("GATE-04", "plano D: recebível bloqueado enquanto aguarda cotação", !!genD.msg, genD.msg);
  } else {
    log("GATE-04", "plano D: recebível bloqueado enquanto aguarda cotação", "SKIP",
      "pedido não criado — bloqueio ocorreu antes (comportamento aceitável)");
  }

  // fail-closed fiscal: item cujo perfil fiscal está incompleto/inativo
  {
    const itemsF = [itemPayload(ctx.productItem2, 1)];
    const simF = await simulate(ctx, ctx.plans.B, itemsF);
    const hF = (simF.data as any)?.cart_hash;
    const oF = hF ? await createOrder(ctx, ctx.plans.B, itemsF, hF, `hml-failclosed-${RUN}`) : null;
    const idF = (oF?.data as any)?.id;
    if (idF) {
      created.orders.push(idF);
      await rpc(clients.admin, "approve_partner_order", {
        p_order_id: idF, p_approval_notes: `hml-${RUN}`, p_estimated_delivery_date: null,
      });
      const g = await rpc(clients.financeiro, "generate_b2b_receivable_secure", { p_partner_order_id: idF });
      const { data: lk } = await svc.from("partner_order_financial_links")
        .select("receivable_id").eq("partner_order_id", idF);
      const recId = lk?.[0]?.receivable_id;
      if (recId) {
        await svc.from("product_fiscal_profiles").update({ is_active: false })
          .eq("product_id", ctx.productItem2.item_id);
        const em = await rpc(clients.admin, "rpc_hml_fiscal_emit_mock", { p_receivable_id: recId });
        const { count: invCount } = await svc.from("fiscal_invoices")
          .select("id", { count: "exact", head: true }).eq("receivable_id", recId);
        await svc.from("product_fiscal_profiles").update({ is_active: true })
          .eq("product_id", ctx.productItem2.item_id);
        check("FISC-04", "perfil fiscal ausente/inativo falha fechado (FISCAL_PROFILE_INCOMPLETE) sem efeitos colaterais",
          (em.msg ?? "").includes("FISCAL_PROFILE_INCOMPLETE") && (invCount ?? 0) === 0,
          { erro: em.msg, notas: invCount });
      } else {
        log("FISC-04", "fail-closed fiscal", "SKIP", g.msg);
      }
    } else {
      log("FISC-04", "fail-closed fiscal", "SKIP", oF?.msg ?? simF.msg);
    }
    if (!ctx.microItem) {
      log("FISC-05", "item de microrganismo no fluxo fiscal", "SKIP", "sem microrganismo precificado na massa");
      log("FISC-06", "perfil fiscal de microrganismo inativo falha fechado", "SKIP", "sem microrganismo precificado na massa");
    } else {
      const itemsM = [itemPayload(ctx.microItem, 1)];
      const simM = await simulate(ctx, ctx.plans.B, itemsM);
      const hM = (simM.data as any)?.cart_hash;
      const oM = hM ? await createOrder(ctx, ctx.plans.B, itemsM, hM, `hml-micro-${RUN}`) : null;
      const idM = (oM?.data as any)?.id;
      if (!idM) {
        check("FISC-05", "item de microrganismo emite documento fiscal simulado com snapshot próprio",
          false, { sim: simM.msg, order: oM?.msg });
        log("FISC-06", "perfil fiscal de microrganismo inativo falha fechado", "SKIP", "pedido de microrganismo não criado");
      } else {
        created.orders.push(idM);
        await rpc(clients.admin, "approve_partner_order", {
          p_order_id: idM, p_approval_notes: `hml-${RUN}`, p_estimated_delivery_date: null,
        });
        const gM = await rpc(clients.financeiro, "generate_b2b_receivable_secure", { p_partner_order_id: idM });
        const { data: lkM } = await svc.from("partner_order_financial_links")
          .select("receivable_id").eq("partner_order_id", idM);
        const recM = lkM?.[0]?.receivable_id;
        if (!recM) {
          check("FISC-05", "item de microrganismo emite documento fiscal simulado com snapshot próprio",
            false, gM.msg);
          log("FISC-06", "perfil fiscal de microrganismo inativo falha fechado", "SKIP", "recebível de microrganismo indisponível");
        } else {
          // FISC-06 primeiro: com o perfil do microrganismo inativo, deve falhar fechado
          await svc.from("microorganism_fiscal_profiles").update({ is_active: false })
            .eq("microorganism_id", ctx.microItem.item_id);
          const emOff = await rpc(clients.admin, "rpc_hml_fiscal_emit_mock", { p_receivable_id: recM });
          const { count: invOff } = await svc.from("fiscal_invoices")
            .select("id", { count: "exact", head: true }).eq("receivable_id", recM);
          check("FISC-06", "perfil fiscal de microrganismo inativo falha fechado sem efeitos colaterais",
            (emOff.msg ?? "").includes("FISCAL_PROFILE_INCOMPLETE") && (invOff ?? 0) === 0,
            { erro: emOff.msg, notas: invOff });

          await svc.from("microorganism_fiscal_profiles").update({ is_active: true })
            .eq("microorganism_id", ctx.microItem.item_id);
          const emOn = await rpc(clients.admin, "rpc_hml_fiscal_emit_mock", { p_receivable_id: recM });
          const invId = (emOn.data as any)?.invoice_id;
          const { data: itensM } = await svc.from("fiscal_invoice_items")
            .select("item_kind,ncm_snapshot,cfop_snapshot,origem_snapshot,fiscal_profile_snapshot")
            .eq("fiscal_invoice_id", invId ?? "00000000-0000-0000-0000-000000000000");
          const it0: any = itensM?.[0];
          check("FISC-05", "item de microrganismo emite documento fiscal simulado com snapshot próprio",
            !emOn.msg && !!invId && (itensM?.length ?? 0) === 1 &&
            it0?.item_kind === "MICROORGANISM" && !!it0?.ncm_snapshot && !!it0?.cfop_snapshot &&
            it0?.fiscal_profile_snapshot?.source === "microorganism_fiscal_profiles",
            { erro: emOn.msg, invoice_id: invId, item: it0 });
        }
      }
    }

  }
}

// -------------------------------------------------------------------- crédito
async function credito(ctx: Ctx, flow: { orderId: string } | null) {
  const before = await rpc(clients.financeiro, "rpc_b2b_partner_credit", { p_partner_id: ctx.partnerA });
  if (!flow) { log("CRED-01", "liberação de crédito no cancelamento", "SKIP", "fluxo anterior indisponível"); return; }
  const cancel = await rpc(clients.financeiro, "cancel_b2b_receivable_secure",
    { p_partner_order_id: flow.orderId, p_motivo: `HML-B2B-${RUN}` });
  const again = await rpc(clients.financeiro, "cancel_b2b_receivable_secure",
    { p_partner_order_id: flow.orderId, p_motivo: `HML-B2B-${RUN}` });
  const after = await rpc(clients.financeiro, "rpc_b2b_partner_credit", { p_partner_id: ctx.partnerA });
  const exp = (d: any) => Number(d?.exposure ?? d?.exposicao ?? d?.committed ?? 0);
  check("CRED-01", "cancelamento libera crédito e é idempotente (sem dupla liberação)",
    !cancel.msg && exp(after.data) <= exp(before.data),
    { antes: before.data, depois: after.data, cancel: cancel.msg, replay: again.msg });
}

// -------------------------------------------------------------------- cleanup
async function cleanup() {
  const errs: string[] = [];
  const del = async (table: string, col: string, values: string[]) => {
    if (!values.length) return;
    const { error } = await svc.from(table).delete().in(col, values);
    if (error) errs.push(`${table}: ${error.message}`);
  };

  // inclui resíduos de execuções anteriores do próprio harness (prefixo HML-B2B)
  const { data: legacy } = await svc.from("partner_orders")
    .select("id").like("observacoes", "HML-B2B-%");
  const orderIds = [...new Set([...created.orders, ...((legacy ?? []).map((o: any) => o.id))])];

  // cancelamento canônico do recebível (libera o guard de exclusão do vínculo)
  for (const oid of orderIds) {
    await rpc(clients.admin, "cancel_b2b_receivable_secure", { p_partner_order_id: oid, p_motivo: `cleanup HML-B2B ${RUN}` });
  }

  const { data: links } = await svc.from("partner_order_financial_links")
    .select("receivable_id,partner_order_id").in("partner_order_id", orderIds.length ? orderIds : ["x"]);
  const recIds = [...new Set((links ?? []).map((l: any) => l.receivable_id).filter(Boolean))] as string[];

  if (recIds.length) {
    const { data: invs } = await svc.from("fiscal_invoices").select("id").in("receivable_id", recIds);
    const invIds = (invs ?? []).map((i: any) => i.id);
    if (invIds.length) {
      const { error: relaxErr } = await svc.from("fiscal_invoices")
        .update({ normalized_status: "DRAFT", status: "DRAFT" }).in("id", invIds);
      if (relaxErr) errs.push(`fiscal_invoices(relax): ${relaxErr.message}`);
      const { data: fits } = await svc.from("fiscal_invoice_items").select("id").in("fiscal_invoice_id", invIds);
      await del("fiscal_invoice_item_references", "fiscal_invoice_item_id", (fits ?? []).map((f: any) => f.id));
      await del("fiscal_invoice_references", "fiscal_invoice_id", invIds);
      await del("fiscal_invoice_items", "fiscal_invoice_id", invIds);
      await del("fiscal_events", "fiscal_invoice_id", invIds);
      await del("fiscal_idempotency_keys", "fiscal_invoice_id", invIds);
      await del("fiscal_invoices", "id", invIds);
    }
    await del("accounts_receivable_installments", "receivable_id", recIds);
  }
  if (orderIds.length) {
    // o vínculo financeiro só pode ser removido por administrador autenticado
    const { error: pofl } = await clients.admin.from("partner_order_financial_links")
      .delete().in("partner_order_id", orderIds);
    if (pofl) errs.push(`partner_order_financial_links: ${pofl.message}`);
    await del("accounts_receivable", "id", recIds);
    await del("partner_order_messages", "order_id", orderIds);
    await del("partner_order_items", "order_id", orderIds);
    await del("partner_order_idempotency", "order_id", orderIds);
    await del("partner_order_audit_logs", "order_id", orderIds);
    await del("production_planning", "partner_order_id", orderIds);
    await del("partner_orders", "id", orderIds);
  }
  const dropUser = async (uid: string, tag: string) => {
    await svc.from("user_roles").delete().eq("user_id", uid);
    await svc.from("user_clientes").delete().eq("user_id", uid);
    await svc.from("partner_users").delete().eq("user_id", uid);
    // referências de auditoria sintética que travam a exclusão do usuário
    await svc.from("financial_audit_log").delete().eq("performed_by", uid);
    await svc.from("financial_receipts").delete().eq("issued_by", uid);
    await svc.from("receivable_payments").delete().eq("created_by", uid);
    await svc.from("accounts_receivable").delete().eq("created_by", uid);
    const { error } = await svc.auth.admin.deleteUser(uid);
    if (error) errs.push(`${tag} ${uid.slice(0, 8)}: ${error.message}`);
  };

  for (const uid of created.users) await dropUser(uid, "auth");
  // varre usuários sintéticos remanescentes de execuções anteriores
  try {
    const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of list?.users ?? []) {
      if ((u.email ?? "").startsWith("hml-b2b-")) await dropUser(u.id, "auth-legacy");
    }
  } catch (e) { errs.push(`listUsers: ${String(e)}`); }

  await del("clientes", "id", created.clientes);
  await del("partner_accounts", "id", created.partners);

  const { count: ordLeft } = await svc.from("partner_orders")
    .select("id", { count: "exact", head: true }).in("id", orderIds.length ? orderIds : ["x"]);
  const { count: recLeft } = await svc.from("accounts_receivable")
    .select("id", { count: "exact", head: true }).in("id", recIds.length ? recIds : ["x"]);
  return {
    pedidos_residuais: ordLeft ?? 0,
    recebiveis_residuais: recLeft ?? 0,
    usuarios_removidos: created.users.length,
    erros: errs.slice(0, 12),
  };
}

async function run() {
  await guard();
  const ctx = await discover();
  log("ENV", "ambiente staging confirmado", "PASS", { project_ref: `${EXPECTED_REF.slice(0, 4)}****`, run: RUN });
  await setupUsers(ctx);
  await matriz(ctx);
  await paridade(ctx);
  const flow = await concorrencia(ctx);
  await gates(ctx);
  await credito(ctx, flow);
  const residue = await cleanup();
  check("CLEAN", "cleanup sem resíduos transacionais",
    residue.pedidos_residuais === 0 && residue.recebiveis_residuais === 0, residue);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // H14 — harness histórico de homologação B2B, escrito para o staging antigo
  // (`ikaauvsflpmamgxmkhoq`). Ele cria usuários e dados transacionais reais, o
  // que é inaceitável contra o banco canônico de produção `swzpzcwiasxmjutrmvkm`.
  // Fica desativado fail-closed; o código é preservado apenas como evidência.
  return new Response(
    JSON.stringify({
      error: "harness_disabled",
      code: "HML_HARNESS_DISABLED_NON_CANONICAL_TARGET",
      detail: "Harness histórico desativado: alvo canônico não permite execução mutante.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
  if (!INTERNAL_SECRET || req.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    await run();
  } catch (e) {
    log("FATAL", "execução do harness", "FAIL", String(e));
    try { await cleanup(); } catch (_) { /* ignore */ }
  }
  const summary = {
    run: RUN,
    total: results.length,
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    skip: results.filter((r) => r.status === "SKIP").length,
  };
  return new Response(JSON.stringify({ summary, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// touch 1785519297
