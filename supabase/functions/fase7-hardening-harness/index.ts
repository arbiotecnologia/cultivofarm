// Harness temporário de certificação (staging). Removido ao final da auditoria.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SECRET = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

type R = { id: string; ok: boolean; detail: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: cl } = await admin.auth.getClaims(token);
  const uid = cl?.claims?.sub as string | undefined;
  const { data: isAdm } = uid
    ? await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "administrador").maybeSingle()
    : { data: null };
  if (!isAdm) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: R[] = [];
  const rec = (id: string, ok: boolean, detail: unknown) =>
    results.push({ id, ok, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
  const created = { users: [] as string[], partners: [] as string[], produtos: [] as string[] };
  const tag = `h8-${crypto.randomUUID().slice(0, 8)}`;
  const errMsg = (e: any) => String(e?.message ?? e ?? "").slice(0, 180);

  const mkUser = async (alias: string, roles: string[], partnerId?: string, partnerRole?: string) => {
    const email = `${tag}.${alias}@harness.invalid`;
    const password = `Hx#${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nome: `${tag} ${alias}` },
    });
    if (error) throw new Error(`createUser ${alias}: ${error.message}`);
    const id = data.user!.id;
    created.users.push(id);
    await admin.from("user_roles").delete().eq("user_id", id);
    for (const r of roles) await admin.from("user_roles").insert({ user_id: id, role: r });
    if (partnerId) await admin.from("partner_users").insert({ partner_id: partnerId, user_id: id, role: partnerRole ?? "gestor" });
    return { id, email, password, alias };
  };
  const session = async (email: string, password: string) => {
    const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`login: ${error.message}`);
    return c;
  };

  try {
    // ---------- fixtures ----------
    const mkPartner = async (suffix: string) => {
      const { data, error } = await admin.from("partner_accounts").insert({
        razao_social: `${tag}-${suffix}`, nome_fantasia: `${tag}-${suffix}`,
        cnpj: String(Date.now()).slice(-14).padStart(14, "9"), ativo: true,
        partner_type: "revenda", email: `${tag}.${suffix}@harness.invalid`,
      }).select("id").single();
      if (error) throw new Error(`partner ${suffix}: ${error.message}`);
      created.partners.push(data.id);
      return data.id as string;
    };
    const pA = await mkPartner("pa");
    const pB = await mkPartner("pb");

    const uAdm = await mkUser("adm", ["administrador"]);
    const uFin = await mkUser("fin", ["financeiro"]);
    const uCom = await mkUser("com", ["gestor_comercial"]);
    const uPA = await mkUser("pgA", ["parceiro_b2b"], pA, "gestor");
    const uPB = await mkUser("pgB", ["parceiro_b2b"], pB, "gestor");
    const uTec = await mkUser("tecB2B", ["parceiro_b2b_tecnico"], pA, "tecnico");
    const uProd = await mkUser("produtor", ["cliente_produtor"]);
    const uNone = await mkUser("semvinculo", []);
    rec("F.fixtures", true, `2 parceiros + 8 usuários efêmeros (${tag})`);

    const sAdm = await session(uAdm.email, uAdm.password);
    const sAdm2 = await session(uAdm.email, uAdm.password);
    const sFin = await session(uFin.email, uFin.password);
    const sCom = await session(uCom.email, uCom.password);
    const sPA = await session(uPA.email, uPA.password);
    const sPA2 = await session(uPA.email, uPA.password);
    const sPB = await session(uPB.email, uPB.password);
    const sTec = await session(uTec.email, uTec.password);
    const sProd = await session(uProd.email, uProd.password);
    const sNone = await session(uNone.email, uNone.password);
    rec("F.sessions", true, "10 sessões autenticadas (8 aliases distintos)");

    // ---------- catálogo: composição e origem ----------
    const { data: cat, error: catErr } = await sPA.rpc("get_partner_catalog_secure", { p_partner_id: pA });
    const items: any[] = (cat as any[]) ?? [];
    const prods = items.filter((i) => (i.item_tipo ?? i.tipo) === "produto");
    const micros = items.filter((i) => (i.item_tipo ?? i.tipo) === "microrganismo");
    const isQuote = (i: any) => i.quote_only === true || i.preco_parceiro == null || Number(i.preco_parceiro) === 0;
    const quoteOnly = items.filter(isQuote);
    rec("C.catalogo_composicao", !catErr && items.length > 0,
      `total=${items.length} (produtos=${prods.length}, microrganismos=${micros.length}), quote_only=${quoteOnly.length}; ` +
      `codigos_produto=[${prods.map((i) => i.codigo).join(",")}]; codigos_micro=[${micros.map((i) => i.codigo).join(",")}]`);

    // quote_only via fixture temporária (rollback-only) se não houver item real incompleto
    let quoteProofDetail = `itens quote_only reais=${quoteOnly.length}`;
    let quoteProofOk = quoteOnly.length > 0;
    if (!quoteProofOk) {
      const { data: pf, error: pfErr } = await admin.from("produtos").insert({
        nome: `${tag}-sem-preco`, codigo: `${tag.toUpperCase()}-QO`, tipo: "inoculante",
        unidade_medida: "L", ativo: true, preco_litro: null,
      }).select("id").single();
      if (pfErr) {
        quoteProofDetail = `fixture quote_only não criada: ${pfErr.message}`;
      } else {
        created.produtos.push(pf.id);
        const { data: cat2 } = await sPA.rpc("get_partner_catalog_secure", { p_partner_id: pA });
        const f = ((cat2 as any[]) ?? []).find((i) => i.item_id === pf.id);
        quoteProofOk = !!f && isQuote(f);
        quoteProofDetail = `fixture temporária sem preço: presente=${!!f}, quote_only=${f ? isQuote(f) : "n/a"}`;
      }
    }
    rec("C.quote_only", quoteProofOk, quoteProofDetail);

    // ---------- plano + simulação ----------
    const { data: plans } = await sAdm.rpc("rpc_b2b_list_selectable_payment_plans");
    const plan = ((plans as any[]) ?? [])[0];
    if (!plan) throw new Error("nenhum plano selecionável");
    const priced = items.filter((i) => !isQuote(i)).slice(0, 2);
    if (priced.length < 2) throw new Error("catálogo com menos de 2 itens precificados");
    const cartItems = priced.map((i) => ({ item_tipo: i.item_tipo ?? i.tipo, item_id: i.item_id, quantidade: 2 }));

    const sim = async (s: any) => await s.rpc("simulate_b2b_payment_plan_secure",
      { p_partner_id: pA, p_payment_plan_id: plan.id, p_items: cartItems });
    const { data: simA, error: simErr } = await sim(sPA);
    rec("C.simulacao", !simErr && !!simA?.cart_hash, `final=${simA?.final_amount}, itens=${(simA?.lines ?? []).length}`);
    const parity = (simA?.lines ?? []).every((l: any) => {
      const c = items.find((i) => i.item_id === l.item_id);
      return c && Number(c.preco_parceiro) === Number(l.base_price);
    });
    rec("C.paridade_catalogo_simulacao", parity, `linhas=${(simA?.lines ?? []).length} conferidas contra catálogo`);

    const mkOrder = async (s: any, key: string, obs: string) =>
      await s.rpc("create_partner_order_secure", {
        p_partner_id: pA, p_observacoes: obs, p_items: cartItems,
        p_payment_plan_id: plan.id, p_expected_cart_hash: simA.cart_hash, p_idempotency_key: key,
      });

    // ---------- idempotência / fingerprint v2 ----------
    const k1 = `${tag}-k1`;
    const [r1, r2] = await Promise.all([mkOrder(sPA, k1, "e2e-a"), mkOrder(sPA2, k1, "e2e-a")]);
    const okBoth = !r1.error && !r2.error && r1.data?.id === r2.data?.id;
    const orderA = r1.data?.id ?? r2.data?.id;
    const { count: cntA } = await admin.from("partner_orders").select("id", { count: "exact", head: true })
      .eq("partner_id", pA).eq("id", orderA);
    rec("I.concorrencia_mesma_chave", okBoth && cntA === 1, `mesmo id=${okBoth}, pedidos=${cntA}`);

    const div = await mkOrder(sPA, k1, "payload divergente");
    rec("I.fingerprint_v2_observacoes", errMsg(div.error).includes("idempotency_conflict"),
      `erro=${errMsg(div.error) || "nenhum"} (reqfp_v2 cobre observações)`);

    const divQty = await sPA.rpc("create_partner_order_secure", {
      p_partner_id: pA, p_observacoes: "e2e-a", p_items: cartItems.map((c) => ({ ...c, quantidade: 3 })),
      p_payment_plan_id: plan.id, p_expected_cart_hash: simA.cart_hash, p_idempotency_key: k1,
    });
    rec("I.fingerprint_v2_itens", !!divQty.error, `erro=${errMsg(divQty.error) || "nenhum"}`);

    // linha histórica sem fingerprint -> fail-safe
    const kLeg = `${tag}-legacy`;
    await admin.from("partner_order_idempotency").insert({
      partner_id: pA, idempotency_key: kLeg, cart_hash: simA.cart_hash, order_id: orderA,
      result_snapshot: { legacy: true }, created_by: uPA.id, request_fingerprint: null,
    });
    const leg = await mkOrder(sPA, kLeg, "e2e-a");
    rec("I.legacy_unverifiable", errMsg(leg.error).includes("idempotency_legacy_unverifiable"),
      `erro=${errMsg(leg.error) || "nenhum"}`);

    // ---------- gates com pedido ainda não aprovado ----------
    const gPre: string[] = [];
    const gate = async (id: string, p: Promise<any>, expect?: string) => {
      const { error } = await p;
      const ok = !!error && (!expect || errMsg(error).includes(expect));
      gPre.push(`${id}=${ok ? "bloqueado" : "PERMITIDO"}(${errMsg(error) || "sem erro"})`);
      return ok;
    };
    const g1 = await gate("recebivel", sAdm.rpc("generate_b2b_receivable_secure", { p_partner_order_id: orderA }));
    const g2 = await gate("producao", sAdm.rpc("update_partner_order_status", { p_order_id: orderA, p_status: "em_producao", p_motivo: "gate" }));
    const g3 = await gate("entrega", sAdm.rpc("update_partner_order_status", { p_order_id: orderA, p_status: "entregue", p_motivo: "gate" }));
    const g4 = await gate("faturamento", sAdm.rpc("update_partner_order_status", { p_order_id: orderA, p_status: "faturado", p_motivo: "gate" }));
    const g5 = await gate("auto_aprovacao_parceiro", sPA.rpc("approve_partner_order", { p_order_id: orderA, p_approval_notes: "self" }));
    const g6 = await gate("tecnico_financeiro", sTec.rpc("simulate_b2b_payment_plan_secure", { p_partner_id: pA, p_payment_plan_id: plan.id, p_items: cartItems }));
    const g7 = await gate("estoque_direto_parceiro", sPA.from("estoque_produto").insert({ produto_id: priced[0].item_id, quantidade: 1 } as any));
    const g8 = await gate("financeiro_direto_parceiro", sPA.from("accounts_receivable").insert({ description: "x", amount: 1, due_date: "2030-01-01" } as any));
    const { count: arPre } = await admin.from("accounts_receivable").select("id", { count: "exact", head: true }).eq("origin_id", orderA);
    rec("G.gates_pre_aprovacao", g1 && g2 && g3 && g4 && g5 && g6 && g7 && g8 && (arPre ?? 0) === 0,
      `${gPre.join(" | ")} | efeito_zero_recebiveis=${arPre}`);

    // ---------- E2E A: aprovação -> recebível -> parcelas ----------
    const { data: ordRow } = await admin.from("partner_orders")
      .select("status, credit_block_reason, requires_financial_approval, financial_approval_status, final_amount_with_interest, payment_terms_id")
      .eq("id", orderA).single();
    const trail: string[] = [`inicial=${ordRow?.status}`];
    if (ordRow?.status === "aguardando_aprovacao_credito") {
      const { error } = await sFin.rpc("approve_b2b_credit", { p_partner_order_id: orderA, p_notes: "harness" });
      trail.push(`credito=${error ? errMsg(error) : "aprovado"}`);
    }
    if (ordRow?.requires_financial_approval && ordRow?.financial_approval_status === "pending") {
      const { error } = await sFin.rpc("approve_b2b_payment_terms_secure", { p_partner_order_id: orderA, p_notes: "harness" });
      trail.push(`condicoes=${error ? errMsg(error) : "aprovadas"}`);
    }
    const { error: apErr } = await sCom.rpc("approve_partner_order", { p_order_id: orderA, p_approval_notes: "harness" });
    trail.push(`aprovacao_comercial=${apErr ? errMsg(apErr) : "ok"}`);
    const { data: ordApp } = await admin.from("partner_orders").select("status").eq("id", orderA).single();
    rec("A.e2e_aprovacoes", ordApp?.status === "aprovado", `${trail.join(" | ")} | status=${ordApp?.status}`);

    // recebível concorrente para o MESMO pedido aprovado
    const [gr1, gr2] = await Promise.all([
      sAdm.rpc("generate_b2b_receivable_secure", { p_partner_order_id: orderA }),
      sAdm2.rpc("generate_b2b_receivable_secure", { p_partner_order_id: orderA }),
    ]);
    const recId1 = gr1.data?.receivable_id ?? gr1.data?.id;
    const recId2 = gr2.data?.receivable_id ?? gr2.data?.id;
    const { data: links } = await admin.from("partner_order_financial_links").select("receivable_id").eq("partner_order_id", orderA);
    const { data: ars } = await admin.from("accounts_receivable").select("id, amount, total_amount, installments_count").eq("origin_id", orderA);
    const arId = (ars ?? [])[0]?.id ?? (links ?? [])[0]?.receivable_id;
    const { data: insts } = await admin.from("accounts_receivable_installments")
      .select("installment_number, amount, due_date").eq("receivable_id", arId).order("installment_number");
    const { data: terms } = await admin.from("partner_order_payment_terms")
      .select("installment_count, final_amount, first_due_date").eq("partner_order_id", orderA).maybeSingle();
    const { data: sched } = await admin.from("partner_order_payment_schedule")
      .select("installment_number, amount, due_date").eq("partner_order_id", orderA).order("installment_number");
    const sumI = (insts ?? []).reduce((a: number, r: any) => a + Number(r.amount), 0);
    const sumS = (sched ?? []).reduce((a: number, r: any) => a + Number(r.amount), 0);
    const total = Number(terms?.final_amount ?? 0);
    const sameRec = !!recId1 && !!recId2 && recId1 === recId2;
    const dueOk = (insts ?? []).length === (sched ?? []).length &&
      (insts ?? []).every((r: any, k: number) => String(r.due_date) === String((sched ?? [])[k]?.due_date));
    const okRec = sameRec && (ars ?? []).length === 1 && (links ?? []).length === 1 &&
      (insts ?? []).length === Number(terms?.installment_count ?? 0) &&
      Math.abs(sumI - total) < 0.01 && Math.abs(sumS - total) < 0.01 && dueOk;
    rec("A.recebivel_concorrente", okRec,
      `mesmo_receivable=${sameRec}, recebíveis=${(ars ?? []).length}, vínculos=${(links ?? []).length}, ` +
      `parcelas=${(insts ?? []).length}/${terms?.installment_count}, soma=${sumI.toFixed(2)} vs total=${total.toFixed(2)}, ` +
      `vencimentos_iguais_ao_snapshot=${dueOk}, erros=${errMsg(gr1.error) || errMsg(gr2.error) || "nenhum"}`);

    const { data: itSnap } = await admin.from("partner_order_items")
      .select("product_id, microrganismo_id, base_price_snapshot").eq("order_id", orderA);
    const parity2 = (simA?.lines ?? []).every((l: any) => {
      const s = (itSnap ?? []).find((x: any) => x.product_id === l.item_id || x.microrganismo_id === l.item_id);
      return s && Number(s.base_price_snapshot) === Number(l.base_price);
    });
    rec("C.paridade_simulacao_snapshot", parity2, `${(itSnap ?? []).length} itens snapshot conferidos`);

    const imut = await sPA.rpc("respond_b2b_order_quote_secure", { p_order_id: orderA, p_items: cartItems, p_first_due_date: null, p_installment_count: 1, p_notes: "x" });
    rec("A.imutabilidade_pos_aprovacao", !!imut.error, `erro=${errMsg(imut.error) || "nenhum"}`);

    // ---------- E2E B: rejeição ----------
    const simB = (await sim(sPA)).data;
    const ordB = await sPA.rpc("create_partner_order_secure", {
      p_partner_id: pA, p_observacoes: "e2e-b", p_items: cartItems, p_payment_plan_id: plan.id,
      p_expected_cart_hash: simB.cart_hash, p_idempotency_key: `${tag}-kb`,
    });
    const idB = ordB.data?.id;
    const { error: rejErr } = await sCom.rpc("reject_partner_order", { p_order_id: idB, p_approval_notes: `${tag} motivo reprovacao` });
    const { data: rowB } = await admin.from("partner_orders").select("status").eq("id", idB).single();
    const { data: logB } = await admin.from("partner_order_audit_logs").select("acao").eq("order_id", idB);
    const bRec = await sAdm.rpc("generate_b2b_receivable_secure", { p_partner_order_id: idB });
    const bProd = await sAdm.rpc("update_partner_order_status", { p_order_id: idB, p_status: "em_producao", p_motivo: "gate" });
    const bFat = await sAdm.rpc("update_partner_order_status", { p_order_id: idB, p_status: "faturado", p_motivo: "gate" });
    const { count: arB } = await admin.from("accounts_receivable").select("id", { count: "exact", head: true }).eq("origin_id", idB);
    rec("B.e2e_rejeicao", !rejErr && rowB?.status === "reprovado" && !!bRec.error && !!bProd.error && !!bFat.error && (arB ?? 0) === 0,
      `status=${rowB?.status}, auditoria=[${(logB ?? []).map((l: any) => l.acao).join(",")}], ` +
      `recebível=${errMsg(bRec.error) || "PERMITIDO"}, produção=${errMsg(bProd.error) || "PERMITIDO"}, ` +
      `faturamento=${errMsg(bFat.error) || "PERMITIDO"}, efeito_zero=${arB === 0}`);

    // ---------- E2E C: pedido de ajuste de condições ----------
    const simC = (await sim(sPA)).data;
    const ordC = await sPA.rpc("create_partner_order_secure", {
      p_partner_id: pA, p_observacoes: "e2e-c", p_items: cartItems, p_payment_plan_id: plan.id,
      p_expected_cart_hash: simC.cart_hash, p_idempotency_key: `${tag}-kc`,
    });
    const idC = ordC.data?.id;
    const { error: adjErr } = await sCom.rpc("request_b2b_payment_terms_adjustment_secure", { p_partner_order_id: idC, p_notes: `${tag} motivo ajuste` });
    const { data: rowC } = await admin.from("partner_orders").select("status, financial_approval_status").eq("id", idC).single();
    const { data: termsC } = await admin.from("partner_order_payment_terms").select("approval_status").eq("partner_order_id", idC).maybeSingle();
    const cRec = await sAdm.rpc("generate_b2b_receivable_secure", { p_partner_order_id: idC });
    const cProd = await sAdm.rpc("update_partner_order_status", { p_order_id: idC, p_status: "em_producao", p_motivo: "gate" });
    const { error: reapp } = await sFin.rpc("approve_b2b_payment_terms_secure", { p_partner_order_id: idC, p_notes: "retorno canônico" });
    const { data: termsC2 } = await admin.from("partner_order_payment_terms").select("approval_status").eq("partner_order_id", idC).maybeSingle();
    const { data: logC } = await admin.from("partner_order_audit_logs").select("acao").eq("order_id", idC);
    rec("C.e2e_ajuste", !adjErr && !!cRec.error && !!cProd.error && !reapp && termsC2?.approval_status === "approved",
      `status=${rowC?.status}/${rowC?.financial_approval_status}, condicoes=${termsC?.approval_status}->${termsC2?.approval_status}, ` +
      `recebível=${errMsg(cRec.error) || "PERMITIDO"}, produção=${errMsg(cProd.error) || "PERMITIDO"}, ` +
      `retorno_canônico=${reapp ? errMsg(reapp) : "ok"}, auditoria=[${(logC ?? []).map((l: any) => l.acao).join(",")}]`);

    // ---------- RLS / 8 aliases ----------
    const aliases: Array<[string, any, boolean]> = [
      ["admin", sAdm, true], ["financeiro", sFin, true], ["gestor_comercial", sCom, true],
      ["parceiro_gestor_A", sPA, true], ["parceiro_gestor_B", sPB, false],
      ["tecnico_b2b", sTec, true], ["produtor_direto", sProd, false], ["sem_vinculo", sNone, false],
    ];
    const rlsOut: string[] = [];
    let rlsOk = true;
    for (const [alias, s, allowA] of aliases) {
      const { data: rows } = await s.from("partner_orders").select("id").eq("id", orderA);
      const seesA = (rows ?? []).length > 0;
      const { error: catE } = await s.rpc("get_partner_catalog_secure", { p_partner_id: pA });
      const catAllowed = !catE;
      const ok = seesA === allowA && catAllowed === allowA;
      if (!ok) rlsOk = false;
      rlsOut.push(`${alias}: pedidoA=${seesA ? "visível" : "negado"}, catálogoA=${catAllowed ? "ok" : errMsg(catE)}`);
    }
    const prodOrder = await sProd.rpc("create_partner_order_secure", {
      p_partner_id: pA, p_observacoes: "produtor", p_items: cartItems, p_payment_plan_id: plan.id,
      p_expected_cart_hash: simA.cart_hash, p_idempotency_key: `${tag}-kp`,
    });
    const inercia = errMsg(prodOrder.error).includes("PRODUCER_DIRECT_NOT_ENABLED") || !!prodOrder.error;
    rec("R.rls_8_aliases", rlsOk && inercia,
      `${rlsOut.join(" | ")} | produtor_direto_inercia=${errMsg(prodOrder.error) || "PERMITIDO"}`);

    const crossB = await sPB.rpc("get_partner_catalog_secure", { p_partner_id: pA });
    const { data: crossRows } = await sPB.from("partner_orders").select("id").eq("partner_id", pA);
    rec("R.isolamento_parceiros", !!crossB.error && (crossRows ?? []).length === 0,
      `catálogo cruzado=${errMsg(crossB.error) || "PERMITIDO"}, pedidos cruzados=${(crossRows ?? []).length}`);
  } catch (e) {
    rec("X.execucao", false, errMsg(e));
  } finally {
    // ---------- cleanup determinístico (sem DISABLE TRIGGER) ----------
    const errs: string[] = [];
    const del = async (t: string, c: string, v: string[]) => {
      if (!v.length) return;
      const { error } = await admin.from(t).delete().in(c, v);
      if (error) errs.push(`${t}: ${error.message}`);
    };
    try {
      const { data: sweep } = await admin.from("partner_accounts").select("id").like("razao_social", `${tag}%`);
      const partnerIds = Array.from(new Set([...created.partners, ...((sweep ?? []).map((p: any) => p.id))]));
      const { data: orders } = await admin.from("partner_orders").select("id").in("partner_id", partnerIds);
      const ids = (orders ?? []).map((o: any) => o.id);
      if (ids.length) {
        const { data: lk } = await admin.from("partner_order_financial_links").select("receivable_id").in("partner_order_id", ids);
        const recIds = (lk ?? []).map((l: any) => l.receivable_id).filter(Boolean);
        const cleaner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
        const admUser = created.users[0];
        // cancelamento canônico antes de remover vínculos (admin efêmero já criado)
        for (const id of ids) {
          const { error } = await admin.rpc("cancel_b2b_receivable_secure", { p_partner_order_id: id, p_motivo: "rollback harness" });
          if (error && !/nao encontrado|não encontrado|not_found|sem recebivel|sem recebível/i.test(error.message)) {
            errs.push(`cancel: ${error.message}`);
          }
        }
        void cleaner; void admUser;
        await del("partner_order_financial_links", "partner_order_id", ids);
        if (recIds.length) {
          await del("financial_receipts", "receivable_id", recIds);
          await del("accounts_receivable_installments", "receivable_id", recIds);
          await del("accounts_receivable", "id", recIds);
        }
        await del("accounts_receivable", "origin_id", ids);
        await del("partner_order_payment_schedule", "partner_order_id", ids);
        await del("partner_order_audit_logs", "order_id", ids);
        await del("partner_order_items", "order_id", ids);
        await del("partner_order_idempotency", "order_id", ids);
        await del("partner_orders", "id", ids);
        await del("partner_order_payment_terms", "partner_order_id", ids);
      }
      await del("partner_order_idempotency", "partner_id", partnerIds);
      await del("partner_users", "partner_id", partnerIds);
      await del("partner_financial_settings", "partner_id", partnerIds);
      await del("partner_accounts", "id", partnerIds);
      await del("produtos", "id", created.produtos);
      if (created.users.length) {
        await del("user_roles", "user_id", created.users);
        await del("financial_audit_log", "performed_by", created.users);
        await del("profiles", "user_id", created.users);
        for (const id of created.users) {
          const { error } = await admin.auth.admin.deleteUser(id);
          if (error) errs.push(`user: ${error.message}`);
        }
      }
      const { count: lo } = await admin.from("partner_orders").select("id", { count: "exact", head: true }).in("partner_id", partnerIds);
      const { count: lp } = await admin.from("partner_accounts").select("id", { count: "exact", head: true }).like("razao_social", `${tag}%`);
      const { count: lpr } = await admin.from("produtos").select("id", { count: "exact", head: true }).like("nome", `${tag}%`);
      rec("Z.cleanup", (lo ?? 0) === 0 && (lp ?? 0) === 0 && (lpr ?? 0) === 0 && errs.length === 0,
        `pedidos=${lo}, parceiros=${lp}, produtos=${lpr}, usuários removidos=${created.users.length}, erros=${errs.join(" | ") || "nenhum"}`);
    } catch (e) {
      rec("Z.cleanup", false, errMsg(e));
    }
  }

  const pass = results.filter((r) => r.ok).length;
  return new Response(JSON.stringify({ pass, total: results.length, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
