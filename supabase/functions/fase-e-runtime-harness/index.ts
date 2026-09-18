// Fase E — harness de homologação runtime (staging).
// Cria usuários efêmeros reais, executa os fluxos autenticados e remove tudo ao final.
// Protegido por segredo interno; nunca deve ser exposto ao app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isCanonicalSupabaseUrl } from "../_shared/fiscal/canonicalProject.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

type Result = { id: string; name: string; status: "PASS" | "FAIL" | "SKIP"; evidence: unknown };
const results: Result[] = [];
const log = (id: string, name: string, status: Result["status"], evidence: unknown) => {
  results.push({ id, name, status, evidence });
};
const check = (id: string, name: string, cond: boolean, evidence: unknown) =>
  log(id, name, cond ? "PASS" : "FAIL", evidence);

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const RUN = crypto.randomUUID().slice(0, 8);
const PWD = `Fase-E-${crypto.randomUUID()}`;

type Profile =
  | "admin" | "financeiro" | "gestor" | "parceiro_gestor"
  | "tecnico" | "produtorA" | "produtorB" | "sem_vinculo";

const ROLES: Record<Profile, string[]> = {
  admin: ["administrador"],
  financeiro: ["financeiro"],
  gestor: ["gestor_comercial"],
  parceiro_gestor: ["parceiro_b2b"],
  tecnico: ["parceiro_b2b_tecnico"],
  produtorA: ["cliente_produtor"],
  produtorB: ["cliente_produtor"],
  sem_vinculo: [],
};

const userIds: Partial<Record<Profile, string>> = {};
const clients: Partial<Record<Profile, ReturnType<typeof createClient>>> = {};
const created = {
  plans: [] as string[],
  assignments: [] as string[],
  items: [] as string[],
  rules: [] as string[],
  partners: [] as string[],
  clientes: [] as string[],
  orders: [] as string[],
  users: [] as string[],
};

const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

async function rpcErr(c: any, fn: string, args: Record<string, unknown>) {
  const { data, error } = await c.rpc(fn, args);
  return { data, msg: error?.message ?? null, code: error?.code ?? null };
}

async function setup() {
  // parceiros e clientes precisam existir antes dos vínculos/roles
  for (const nome of [`FaseE P1 ${RUN}`, `FaseE P2 ${RUN}`]) {
    const { data, error } = await svc.from("partner_accounts")
      .insert({ razao_social: nome, nome_fantasia: nome, ativo: true }).select("id").single();
    if (error) throw new Error(`partner: ${error.message}`);
    created.partners.push(data.id);
  }
  const [P1, P2] = created.partners;
  for (let i = 1; i <= 2; i++) {
    const { data, error } = await svc.from("clientes")
      .insert({ nome: `FaseE Cliente ${i} ${RUN}`, codigo_cliente: `FE${RUN}${i}` })
      .select("id").single();
    if (error) throw new Error(`cliente: ${error.message}`);
    created.clientes.push(data.id);
  }

  for (const p of Object.keys(ROLES) as Profile[]) {

    const email = `fase-e-${p}-${RUN}@arbio-staging.test`;
    const { data, error } = await svc.auth.admin.createUser({
      email, password: PWD, email_confirm: true,
      user_metadata: { nome: `FaseE ${p} ${RUN}` },
    });
    if (error) throw new Error(`createUser ${p}: ${error.message}`);
    const uid = data.user!.id;
    userIds[p] = uid;
    created.users.push(uid);
    await svc.from("user_roles").delete().eq("user_id", uid);
    if (p === "produtorA") await svc.from("user_clientes").insert({ user_id: uid, cliente_id: created.clientes[0] });
    if (p === "produtorB") await svc.from("user_clientes").insert({ user_id: uid, cliente_id: created.clientes[1] });
    if (p === "parceiro_gestor" || p === "tecnico") {
      await svc.from("partner_users").insert({ partner_id: P1, user_id: uid });
    }
    for (const r of ROLES[p]) {
      const { error: re } = await svc.from("user_roles").insert({ user_id: uid, role: r });
      if (re) throw new Error(`role ${p}/${r}: ${re.message}`);
    }
    const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error: se } = await c.auth.signInWithPassword({ email, password: PWD });
    if (se) throw new Error(`signIn ${p}: ${se.message}`);
    clients[p] = c;
  }


  // produtos b2b com preço
  const { data: prods, error: pe } = await svc.from("produtos")
    .select("id,nome,valor_litro_brl,valor_dose_brl")
    .eq("ativo", true).eq("b2b_enabled", true).gt("valor_litro_brl", 0).limit(2);
  if (pe || !prods || prods.length < 2) throw new Error(`produtos b2b insuficientes: ${pe?.message ?? prods?.length}`);

  // planos
  const mkPlan = async (code: string, mode: string, discount: number) => {
    const { data, error } = await svc.from("commercial_payment_plans").insert({
      name: `FaseE ${code} ${RUN}`, code: `FE-${code}-${RUN}`, plan_type: "short_term",
      pricing_mode: mode, discount_percent: discount, monthly_interest_percent: 0,
      interest_type: "none", installment_count: 2, max_days: 30, months_count: 1,
      active: true, requires_credit_approval: false, requires_financial_approval: false,
      requires_guarantee: false,
    }).select("id").single();
    if (error) throw new Error(`plan ${code}: ${error.message}`);
    created.plans.push(data.id);
    return data.id as string;
  };
  const planFixed = await mkPlan("FIX", "fixed_item_price", 0);
  const planDisc = await mkPlan("DSC", "discount_from_base", 10);
  const planQuote = await mkPlan("QOT", "quote_only", 0);

  return { P1, P2, prods, planFixed, planDisc, planQuote };
}

async function cleanup() {
  const delErrors: Record<string, string> = {};
  const svcDel = async (t: string, col: string, vals: string[]) => {
    if (!vals.length) return;
    const { error } = await svc.from(t).delete().in(col, vals);
    if (error) delErrors[`${t}.${col}`] = error.message;
  };
  const adminC = clients.admin;
  await svcDel("partner_order_items", "order_id", created.orders);
  await svcDel("partner_order_payment_schedule", "partner_order_id", created.orders);
  // cancelar recebiveis e remover vinculos financeiros (rollback canonico, como administrador)
  const recIdsAll: string[] = [];
  for (const o of created.orders) {
    if (adminC) {
      const { error } = await adminC.rpc("cancel_b2b_receivable_secure", { p_partner_order_id: o, p_motivo: "fase-e cleanup" });
      if (error) delErrors[`cancel.${o}`] = error.message;
    }
    const { data: lks } = await svc.from("partner_order_financial_links")
      .select("id,receivable_id,financial_status").eq("partner_order_id", o);
    for (const l of lks ?? []) {
      if (l.receivable_id) recIdsAll.push(l.receivable_id);
      if (adminC) {
        const { error } = await adminC.from("partner_order_financial_links").delete().eq("id", l.id);
        if (error) delErrors[`pofl.${l.id}`] = error.message;
      }
    }
  }
  if (created.orders.length) {
    await svc.from("partner_orders").update({ payment_terms_id: null }).in("id", created.orders);
  }
  await svcDel("partner_order_payment_terms", "partner_order_id", created.orders);
  await svcDel("partner_order_idempotency", "partner_id", created.partners);
  for (const arId of recIdsAll) {
    await svc.from("accounts_receivable_installments").delete().eq("receivable_id", arId);
    const { error } = await svc.from("accounts_receivable").delete().eq("id", arId);
    if (error) delErrors[`ar.${arId}`] = error.message;
  }
  await svcDel("partner_orders", "id", created.orders);
  await svc.from("commercial_condition_audit_log").delete().in("plan_id", created.plans);
  await svcDel("commercial_condition_item_prices", "plan_id", created.plans);
  await svcDel("commercial_price_rules", "plan_id", created.plans);
  await svcDel("commercial_payment_plan_assignments", "plan_id", created.plans);
  await svcDel("commercial_payment_plans", "id", created.plans);
  await svcDel("partner_users", "partner_id", created.partners);
  await svcDel("partner_accounts", "id", created.partners);
  await svcDel("user_clientes", "cliente_id", created.clientes);
  await svcDel("clientes", "id", created.clientes);
  await svcDel("financial_audit_log", "performed_by", created.users);
  await svcDel("commercial_audit_log", "actor_id", created.users);
  for (const u of created.users) {
    await svc.from("user_clientes").delete().eq("user_id", u);
    await svc.from("partner_users").delete().eq("user_id", u);
    await svc.from("user_roles").delete().eq("user_id", u);
    await svc.from("profiles").delete().eq("user_id", u);
    const { error } = await svc.auth.admin.deleteUser(u);
    if (error) delErrors[`auth.${u}`] = error.message;
  }

  // resíduo
  const residue: Record<string, number> = {};
  const countIn = async (t: string, col: string, vals: string[]) => {
    if (!vals.length) return 0;
    const { count } = await svc.from(t).select("id", { count: "exact", head: true }).in(col, vals);
    return count ?? 0;
  };
  (residue as any).errorDetail = delErrors as any;
  residue.plans = await countIn("commercial_payment_plans", "id", created.plans);
  residue.rules = await countIn("commercial_price_rules", "plan_id", created.plans);
  residue.items = await countIn("commercial_condition_item_prices", "plan_id", created.plans);
  residue.assignments = await countIn("commercial_payment_plan_assignments", "plan_id", created.plans);
  residue.orders = await countIn("partner_orders", "id", created.orders);
  residue.partners = await countIn("partner_accounts", "id", created.partners);
  residue.clientes = await countIn("clientes", "id", created.clientes);
  let users = 0;
  for (const u of created.users) {
    const { data } = await svc.auth.admin.getUserById(u);
    if (data?.user) users++;
  }
  residue.auth_users = users;
  return residue;
}

async function run() {
  const fx = await setup();
  const { P1, P2, prods, planFixed, planDisc, planQuote } = fx;
  const gestor = clients.gestor!;
  const admin = clients.admin!;
  const parceiro = clients.parceiro_gestor!;
  const prodA = prods[0], prodB = prods[1];

  // ---------- ACL ----------
  const aclHelpers: Array<[string, Record<string, unknown>]> = [
    ["fn_resolve_commercial_price", { p_buyer_scope: "partner", p_partner_id: P1, p_customer_id: null, p_plan_id: planDisc, p_product_id: prodA.id, p_microrganismo_id: null, p_unit_type: "litro", p_volume_ml: null, p_ref_date: null, p_quantity: 1 }],
    ["fn_resolve_b2b_cart", { p_partner_id: P1, p_plan_id: planDisc, p_items: [] }],
    ["fn_b2b_order_billing_eligibility", { p_partner_order_id: crypto.randomUUID() }],
    ["generate_b2b_receivable_secure_impl", { p_partner_order_id: crypto.randomUUID() }],
    ["fn_fiscal_requirement_resolve", { p_sales_channel: "b2b", p_operation_type: "venda", p_uf: "MT" }],
    ["fn_b2b_cart_hash", { p_partner_id: P1, p_plan_id: planDisc, p_cart: {}, p_final: 1 }],
    ["fn_cc_audit", { p_entity: "x", p_entity_id: crypto.randomUUID(), p_action: "x", p_before: null, p_after: null, p_motivo: null }],
    ["fn_cc_can_publish", { p_uid: userIds.admin }],
  ];
  for (const [fn, args] of aclHelpers) {
    const r = await rpcErr(admin, fn, args);
    check(`ACL-${fn}`, `helper ${fn} não executável por authenticated`, r.msg !== null, r.msg ?? r.data);
  }
  {
    const r = await rpcErr(anonClient, "rpc_resolve_commercial_prices", { p_items: [], p_plan_id: planDisc });
    check("ACL-anon", "anon não resolve preços", r.msg !== null, r.msg);
  }

  // ---------- Matriz: assignments e itens ----------
  const upAssign = async (c: any, plan: string, partner: string, validUntil: string | null) =>
    await rpcErr(c, "rpc_cc_upsert_assignment", {
      p_id: null, p_plan_id: plan, p_buyer_scope: "partner", p_partner_id: partner,
      p_customer_id: null, p_valid_from: "2020-01-01", p_valid_until: validUntil, p_motivo: `fase-e ${RUN}`,
    });

  const aFixed = await upAssign(gestor, planFixed, P1, null);
  const aDisc = await upAssign(gestor, planDisc, P1, null);
  const aDraftOnly = await upAssign(gestor, planDisc, P2, null); // permanece draft
  check("SETUP-assign", "gestor cria atribuições via RPC", !!aFixed.data && !!aDisc.data, {
    aFixed: aFixed.data ?? aFixed.msg, aDisc: aDisc.data ?? aDisc.msg, aDraft: aDraftOnly.data ?? aDraftOnly.msg,
  });
  for (const a of [aFixed, aDisc, aDraftOnly]) if (a.data) created.assignments.push(a.data as string);

  const gestorPub = await rpcErr(gestor, "rpc_cc_publish_assignment", { p_id: aFixed.data, p_motivo: "fase-e" });
  check("ALC-gestor-publish", "gestor comercial não publica (alçada admin/financeiro)",
    (gestorPub.msg ?? "").includes("not_authorized_publish"), gestorPub.msg);
  const pubFixed = await rpcErr(admin, "rpc_cc_publish_assignment", { p_id: aFixed.data, p_motivo: "fase-e" });
  const pubDisc = await rpcErr(admin, "rpc_cc_publish_assignment", { p_id: aDisc.data, p_motivo: "fase-e" });
  check("SETUP-assign-pub", "atribuições publicadas", !pubFixed.msg && !pubDisc.msg, { pubFixed: pubFixed.msg, pubDisc: pubDisc.msg });

  const upItem = async (o: Record<string, unknown>) => await rpcErr(gestor, "rpc_cc_upsert_item_price", {
    p_id: null, p_assignment_id: null, p_plan_id: null, p_buyer_scope: "partner",
    p_partner_id: P1, p_customer_id: null, p_product_id: null, p_microrganismo_id: null,
    p_unit_type: "litro", p_volume_ml: null, p_min_quantity: 0, p_pricing_mode: "fixed_item_price",
    p_condition_price: null, p_discount_percent: null, p_valid_from: "2020-01-01",
    p_valid_until: null, p_is_exception: false, p_motivo: `fase-e ${RUN}`, ...o,
  });

  // coerência
  const bad1 = await upItem({ p_assignment_id: aDisc.data, p_plan_id: planDisc, p_product_id: prodA.id, p_pricing_mode: "fixed_item_price", p_condition_price: 10 });
  check("COER-1", "modo divergente do plano recusado", bad1.msg?.includes("pricing_mode_conflicts_plan") ?? false, bad1.msg);
  const bad2 = await upItem({ p_assignment_id: aFixed.data, p_plan_id: planFixed, p_product_id: prodA.id, p_pricing_mode: "fixed_item_price", p_condition_price: 0 });
  check("COER-2", "preço fixo sem valor recusado", bad2.msg?.includes("condition_price_required") ?? false, bad2.msg);
  const bad3 = await upItem({ p_assignment_id: aDisc.data, p_plan_id: planDisc, p_product_id: prodA.id, p_pricing_mode: "discount_from_base", p_discount_percent: 140 });
  check("COER-3", "desconto fora de faixa recusado", bad3.msg?.includes("discount_percent_out_of_range") ?? false, bad3.msg);

  // itens válidos
  const itFixed = await upItem({ p_assignment_id: aFixed.data, p_plan_id: planFixed, p_product_id: prodA.id, p_pricing_mode: "fixed_item_price", p_condition_price: 123.45, p_min_quantity: 5 });
  const itDisc = await upItem({ p_assignment_id: aDisc.data, p_plan_id: planDisc, p_product_id: prodA.id, p_pricing_mode: "discount_from_base", p_discount_percent: 33 });
  const itDraft = await upItem({ p_assignment_id: aFixed.data, p_plan_id: planFixed, p_product_id: prodB.id, p_pricing_mode: "fixed_item_price", p_condition_price: 999.99 });
  for (const i of [itFixed, itDisc, itDraft]) if (i.data) created.items.push(i.data as string);
  const pubItems = await rpcErr(admin, "rpc_cc_publish_item_prices", { p_ids: [itFixed.data, itDisc.data], p_motivo: `fase-e ${RUN}` });
  check("SETUP-items", "itens criados e publicados (1 fica draft)", !pubItems.msg, { pubItems: pubItems.data ?? pubItems.msg, draft: itDraft.data });

  // ---------- Precificação runtime (perfil parceiro real) ----------
  const resolveAs = async (c: any, plan: string, itemId: string, qty: number | null, unit = "litro", volume: number | null = null, buyer?: Record<string, unknown>) =>
    await rpcErr(c, "rpc_resolve_commercial_prices", {
      p_items: [{ item_ref: "x", product_id: itemId, unit_type: unit, volume_ml: volume, quantity: qty }],
      p_plan_id: plan, p_ref_date: null, p_buyer: buyer ?? null,
    });

  const rFixed = await resolveAs(parceiro, planFixed, prodA.id, 10);
  const l1: any = (rFixed.data as any)?.items?.[0];
  check("PRC-fixed", "fixed_item_price usa preço da condição", l1?.ok === true && Number(l1?.final_unit_price) === 123.45, l1);

  const rDisc = await resolveAs(parceiro, planDisc, prodA.id, 1);
  const l2: any = (rDisc.data as any)?.items?.[0];
  check("PRC-disc-precedence", "desconto do item (33%) precede o do plano (10%)",
    l2?.discount_source === "item_rule" && Number(l2?.plan_discount_percent) === 33, l2);

  const rQuote = await resolveAs(parceiro, planQuote, prodA.id, 1);
  const l3: any = (rQuote.data as any)?.items?.[0];
  check("PRC-quote", "quote_only sem efeito de preço", l3?.quote_required === true && l3?.final_unit_price === null, l3);

  const rMinLow = await resolveAs(parceiro, planFixed, prodA.id, 2);
  const l4: any = (rMinLow.data as any)?.items?.[0];
  check("PRC-minqty-block", "quantidade abaixo do mínimo recusada", l4?.reason_code === "MIN_QUANTITY_NOT_MET", l4);
  const rMinNull = await resolveAs(parceiro, planFixed, prodA.id, null);
  const l5: any = (rMinNull.data as any)?.items?.[0];
  check("PRC-minqty-null", "ausência de quantidade recusada quando há mínimo", l5?.reason_code === "QUANTITY_REQUIRED", l5);

  const rUnitNoVol = await resolveAs(parceiro, planDisc, prodA.id, 1, "unidade", null);
  const l6: any = (rUnitNoVol.data as any)?.items?.[0];
  check("PRC-volume", "unidade sem volume recusada", l6?.reason_code === "VOLUME_REQUIRED", l6);
  const rUnitVol = await resolveAs(parceiro, planDisc, prodA.id, 1, "unidade", 500);
  const l7: any = (rUnitVol.data as any)?.items?.[0];
  const expected = Math.round(((Number(prodA.valor_litro_brl) * 0.5) * (1 - 10 / 100)) * 100) / 100;
  check("PRC-round", "unidade/volume calculada e arredondada a 2 casas",
    l7?.ok === true && Number(l7.final_unit_price) === expected, { got: l7?.final_unit_price, expected });

  // item draft não é consumido
  const rDraft = await resolveAs(parceiro, planFixed, prodB.id, 100);
  const l8: any = (rDraft.data as any)?.items?.[0];
  check("MTX-draft-item", "item draft não é consumido pelo carrinho", l8?.reason_code === "PRICE_RULE_MISSING", l8);

  // assignment draft não permite publicar item
  const itOnDraft = await upItem({ p_assignment_id: aDraftOnly.data, p_plan_id: planDisc, p_partner_id: P2, p_product_id: prodA.id, p_pricing_mode: "discount_from_base", p_discount_percent: 5 });
  if (itOnDraft.data) created.items.push(itOnDraft.data as string);
  const pubOnDraft = await rpcErr(admin, "rpc_cc_publish_item_prices", { p_ids: [itOnDraft.data], p_motivo: "fase-e" });
  check("MTX-draft-assign", "item sob atribuição draft não publica",
    pubOnDraft.msg?.includes("assignment_not_published") ?? false, pubOnDraft.msg);

  // assignment vencido invalida a regra publicada
  await svc.from("commercial_payment_plan_assignments").update({ valid_until: "2020-06-30" }).eq("id", aFixed.data);
  const rExpired = await resolveAs(parceiro, planFixed, prodA.id, 10);
  const l9: any = (rExpired.data as any)?.items?.[0];
  check("MTX-expired-assign", "atribuição vencida não é consumida", l9?.reason_code === "PRICE_RULE_MISSING", l9);
  await svc.from("commercial_payment_plan_assignments").update({ valid_until: null }).eq("id", aFixed.data);

  // spoof de comprador
  const spoof = await resolveAs(parceiro, planDisc, prodA.id, 1, "litro", null, { buyer_scope: "partner", partner_id: P2 });
  const l10: any = (spoof.data as any)?.items?.[0];
  check("SEC-buyer-spoof", "parceiro não escolhe outro comprador",
    l10?.discount_source === "item_rule" && Number(l10?.plan_discount_percent) === 33, l10);

  // ---------- Perfis: RLS + autorização runtime ----------
  for (const p of ["tecnico", "produtorA", "produtorB", "sem_vinculo"] as Profile[]) {
    const r = await resolveAs(clients[p]!, planDisc, prodA.id, 1);
    check(`SEC-role-${p}`, `${p} não resolve preços comerciais`, r.msg !== null, r.msg);
  }
  const tables = ["commercial_price_rules", "commercial_condition_item_prices", "commercial_payment_plan_assignments"];
  for (const p of Object.keys(ROLES) as Profile[]) {
    const allowed = ["admin", "financeiro", "gestor"].includes(p);
    for (const t of tables) {
      const { count, error } = await clients[p]!.from(t).select("id", { count: "exact", head: true });
      const visible = !error && (count ?? 0) > 0;
      check(`RLS-${p}-${t}`, `${p} ${allowed ? "lê" : "não lê"} ${t}`,
        allowed ? visible : !visible, { count, error: error?.message ?? null });
    }
    const { error: we } = await clients[p]!.from("commercial_price_rules")
      .insert({ buyer_scope: "partner", partner_id: P1, plan_id: planDisc, product_id: prodA.id, unit_type: "litro", pricing_mode: "discount_from_base", valid_from: "2020-01-01" });
    check(`RLSW-${p}`, `${p} não escreve em commercial_price_rules`, !!we, we?.message ?? "SEM ERRO");
  }

  // ---------- Checkout / snapshot / idempotência ----------
  const simulate = async (plan: string, qty: number, item = prodA.id) =>
    await rpcErr(parceiro, "simulate_b2b_payment_plan_secure", {
      p_partner_id: P1, p_payment_plan_id: plan,
      p_items: [{ item_id: item, item_tipo: "produto", quantidade: qty, unidade_medida: "litro", volume_ml: null }],
      p_first_due_date: null,
    });

  const simLow = await simulate(planFixed, 2);
  check("CKO-minqty", "checkout recusa quantidade abaixo do mínimo",
    (simLow.msg ?? "").includes("MIN_QUANTITY_NOT_MET"), simLow.msg);

  const simQuote = await simulate(planQuote, 10);
  const quoteFlag = (simQuote.data as any)?.quote_required === true;
  check("CKO-quote", "plano quote_only não gera valor financeiro", quoteFlag || !!simQuote.msg,
    { quote: quoteFlag, msg: simQuote.msg });

  const sim = await simulate(planFixed, 10);
  const cartHash = (sim.data as any)?.cart_hash ?? null;
  check("CKO-sim", "simulação autoritativa devolve cart_hash", !!cartHash, { cart_hash: cartHash, msg: sim.msg });

  const orderArgs = (key: string, hash: string) => ({
    p_partner_id: P1, p_observacoes: `fase-e ${RUN}`,
    p_items: [{ item_id: prodA.id, item_tipo: "produto", quantidade: 10, unidade_medida: "litro", volume_ml: null }],
    p_requested_delivery_date: null, p_payment_plan_id: planFixed,
    p_first_due_date: null, p_installment_count: null,
    p_expected_cart_hash: hash, p_idempotency_key: key,
  });

  const badHash = await rpcErr(parceiro, "create_partner_order_secure", orderArgs(`fe-${RUN}-bad`, "0".repeat(64)));
  check("CKO-hash", "hash divergente recusado", (badHash.msg ?? "").includes("price_changed"), badHash.msg);

  const key = `fe-${RUN}-ok`;
  const [c1, c2] = await Promise.all([
    rpcErr(parceiro, "create_partner_order_secure", orderArgs(key, cartHash)),
    rpcErr(parceiro, "create_partner_order_secure", orderArgs(key, cartHash)),
  ]);
  const ids = [c1, c2].map((r) => (r.data as any)?.id).filter(Boolean);
  const orderId = ids[0];
  if (orderId) created.orders.push(orderId);
  const { count: orderCount } = await svc.from("partner_orders")
    .select("id", { count: "exact", head: true }).eq("partner_id", P1);
  check("CKO-idem", "mesma chave concorrente cria exatamente 1 pedido",
    orderCount === 1 && new Set(ids).size <= 1, { ids, orderCount, msgs: [c1.msg, c2.msg] });

  // snapshot imutável
  const { data: itemsBefore } = await svc.from("partner_order_items")
    .select("preco_unitario_final_snapshot,price_rule_id_snapshot").eq("order_id", orderId);
  await svc.from("commercial_price_rules").update({ condition_price: 999.99 })
    .eq("plan_id", planFixed).eq("active", true);
  const { data: itemsAfter } = await svc.from("partner_order_items")
    .select("preco_unitario_final_snapshot").eq("order_id", orderId);
  check("CKO-snapshot", "mudança de preço após snapshot não altera o pedido",
    JSON.stringify(itemsBefore?.map((i: any) => i.preco_unitario_final_snapshot)) ===
    JSON.stringify(itemsAfter?.map((i: any) => i.preco_unitario_final_snapshot)),
    { before: itemsBefore, after: itemsAfter });

  // ---------- Fiscal / financeiro ----------
  if (!orderId) {
    log("FIN-gate", "fluxo fiscal/financeiro", "SKIP", "pedido não criado — dependência anterior falhou");
  } else {
  const genBefore = await rpcErr(clients.financeiro!, "generate_b2b_receivable_secure", { p_partner_order_id: orderId });
  check("FIN-gate", "pedido não aprovado é bloqueado pelo gate",
    (genBefore.msg ?? "").includes("billing_not_eligible"), genBefore.msg);

  const appr = await rpcErr(admin, "approve_partner_order", {
    p_order_id: orderId, p_approval_notes: "fase-e", p_estimated_delivery_date: null,
  });
  const [g1, g2] = await Promise.all([
    rpcErr(clients.financeiro!, "generate_b2b_receivable_secure", { p_partner_order_id: orderId }),
    rpcErr(clients.financeiro!, "generate_b2b_receivable_secure", { p_partner_order_id: orderId }),
  ]);
  const { data: links } = await svc.from("partner_order_financial_links")
    .select("receivable_id,partner_id").eq("partner_order_id", orderId);
  const recIds = (links ?? []).map((l: any) => l.receivable_id).filter(Boolean);
  const { data: recs, error: recsErr } = await svc.from("accounts_receivable")
    .select("id,partner_id,customer_id,total_amount,fiscal_invoice_required,fiscal_invoice_status,fiscal_requirement_source,status")
    .in("id", recIds.length ? recIds : ["00000000-0000-0000-0000-000000000000"]);
  check("FIN-receivable", "aprovação + geração concorrente produz exatamente 1 recebível",
    (recs?.length ?? 0) === 1, { approve: appr.msg ?? "ok", g1: g1.msg, g2: g2.msg, links, recsErr: recsErr?.message, recs });
  const rec: any = recs?.[0];
  check("FIN-devedor", "recebível aponta o parceiro devedor correto", rec?.partner_id === P1, {
    partner_id: rec?.partner_id, esperado: P1, customer_id: rec?.customer_id,
  });
  check("FIN-fiscal-flag", "exigência fiscal vem do resolvedor (não hardcoded false)",
    rec?.fiscal_invoice_required === true && rec?.fiscal_invoice_status === "PENDING_PARAMETRIZATION",
    { required: rec?.fiscal_invoice_required, status: rec?.fiscal_invoice_status });
  const { data: insts } = await svc.from("accounts_receivable_installments")
    .select("id,installment_number,original_amount").eq("receivable_id", rec?.id ?? crypto.randomUUID());
  check("FIN-parcelas", "parcelas geradas conforme a condição", (insts?.length ?? 0) >= 1, insts);

  }
  const { data: invoices } = await svc.from("fiscal_invoices").select("id").eq("origin_id", orderId ?? crypto.randomUUID());
  log("FISC-emissao", "emissão fiscal real (NF-e/NFS-e) para pedido B2B", "SKIP", {
    motivo: "sem pipeline de emissão B2B e sem parametrização tributária real (regime/UF/CFOP/NCM/CST/CSOSN)",
    fiscal_invoices_do_pedido: invoices?.length ?? 0,
  });

  const residue = await cleanup();
  check("CLEAN", "cleanup completo sem resíduos",
    Object.entries(residue).every(([k, v]) => k === "errorDetail" || v === 0), residue);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  // TRAVA CANÔNICA (fail-closed, antes de autenticar/ler corpo/consultar):
  // este harness é MUTANTE (cria usuários e fixtures reais). Ele nunca existiu
  // implantado no projeto canônico e não pode executar nele. Sem allowlist
  // alternativa e sem fallback para projetos antigos.
  if (isCanonicalSupabaseUrl(SUPABASE_URL)) {
    return new Response(JSON.stringify({
      error: "harness_disabled_on_canonical_project",
      code: "FASE_E_HARNESS_DISABLED_CANONICAL_TARGET",
    }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
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
