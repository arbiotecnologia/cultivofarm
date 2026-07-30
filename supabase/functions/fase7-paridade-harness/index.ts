// TEMPORÁRIO — gate de paridade E2E (staging). Removido ao final da auditoria.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SVC = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const errMsg = (e: any) => (e ? String(e.message ?? e) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(URL_, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
  const results: Array<{ id: string; ok: boolean; esperado: string; obtido: string }> = [];
  const rec = (id: string, ok: boolean, esperado: string, obtido: string) =>
    results.push({ id, ok, esperado, obtido });

  const tag = `hp-${crypto.randomUUID().slice(0, 8)}`;
  const created = { users: [] as string[], partners: [] as string[], produtos: [] as string[], planos: [] as string[] };
  let admSess: any = null;

  const mkUser = async (alias: string, roles: string[], partnerId?: string, papel = "gestor") => {
    const email = `${tag}.${alias}@harness.invalid`;
    const password = `Hx#${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`user ${alias}: ${error.message}`);
    const id = data.user!.id;
    created.users.push(id);
    await admin.from("user_roles").delete().eq("user_id", id);
    for (const r of roles) await admin.from("user_roles").insert({ user_id: id, role: r });
    if (partnerId) {
      const { error: e2 } = await admin.from("partner_users").insert({ partner_id: partnerId, user_id: id, papel });
      if (e2) throw new Error(`partner_users ${alias}: ${e2.message}`);
    }
    return { id, email, password };
  };
  const session = async (email: string, password: string) => {
    const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`session: ${error.message}`);
    return c;
  };

  try {
    const { data: pa, error: paErr } = await admin.from("partner_accounts").insert({
      razao_social: `${tag}-parceiro`, nome_fantasia: `${tag}`, cnpj: String(Date.now()).padStart(14, "0").slice(-14),
      partner_type: "revenda", email_comercial: `${tag}@harness.invalid`, ativo: true,
    }).select("id").single();
    if (paErr) throw new Error(`partner: ${paErr.message}`);
    const pid = pa.id;
    created.partners.push(pid);

    const uAdm = await mkUser("adm", ["administrador"]);
    const uFin = await mkUser("fin", ["financeiro"]);
    const uCom = await mkUser("com", ["gestor_comercial"]);
    const uPar = await mkUser("par", ["parceiro_b2b"], pid, "gestor");
    const uTec = await mkUser("tec", ["parceiro_b2b_tecnico"], pid, "tecnico");
    const sAdm = await session(uAdm.email, uAdm.password); admSess = sAdm;
    const sFin = await session(uFin.email, uFin.password);
    const sCom = await session(uCom.email, uCom.password);
    const sPar = await session(uPar.email, uPar.password);
    const sTec = await session(uTec.email, uTec.password);
    rec("P0.fixtures", true, "parceiro + 5 sessões", `parceiro=${tag}, sessões=5`);

    // ---------- catálogo ----------
    const { data: cat, error: catErr } = await sPar.rpc("get_partner_catalog_secure", { p_partner_id: pid });
    const items: any[] = (cat as any[]) ?? [];
    const isQuote = (i: any) => i.preco_parceiro == null || Number(i.preco_parceiro) === 0;
    const priced = items.filter((i) => !isQuote(i)).slice(0, 2);
    rec("P1.catalogo", !catErr && priced.length === 2,
      "catálogo acessível com ≥2 itens precificados",
      `erro=${errMsg(catErr) || "nenhum"}, total=${items.length}, precificados=${items.filter((i) => !isQuote(i)).length}`);
    if (priced.length < 2) throw new Error("catálogo insuficiente");

    // fixture efêmero: plano parcelado (ausente no catálogo de staging)
    const { data: planFix, error: planFixErr } = await admin.from("commercial_payment_plans").insert({
      name: `${tag}-parcelado-3x`, code: `${tag.toUpperCase()}-3X`, plan_type: "medium_term",
      max_days: 30, months_count: 3, installment_count: 3, discount_percent: 0,
      monthly_interest_percent: 1.5, interest_type: "compound", active: true,
    }).select("id").single();
    if (planFixErr) throw new Error(`fixture plano: ${planFixErr.message}`);
    created.planos.push(planFix.id);

    const { data: plans } = await sAdm.rpc("rpc_b2b_list_selectable_payment_plans");
    const allPlans = (plans as any[]) ?? [];
    const plan = allPlans.find((p: any) => Number(p.installment_count ?? 1) <= 1) ?? allPlans[0];
    const planVista = allPlans.find((p: any) => Number(p.installment_count ?? p.parcelas ?? 1) <= 1) ?? plan;

    const planParc = allPlans.find((p: any) => Number(p.installment_count ?? p.parcelas ?? 1) > 1) ?? null;
    const planAprov = allPlans.find((p: any) => p.requires_financial_approval === true) ?? null;
    if (!plan) throw new Error("nenhum plano selecionável");

    const cart = priced.map((i) => ({ item_tipo: i.item_tipo, item_id: i.item_id, quantidade: 2 }));
    const simLines = (o: any): any[] => (o?.lines ?? o?.items ?? o?.linhas ?? o?.itens ?? []) as any[];
    const sim = async (s: any, p: any = plan, c: any = cart) =>
      await s.rpc("simulate_b2b_payment_plan_secure", { p_partner_id: pid, p_payment_plan_id: p.id, p_items: c });

    // ---------- P2: paridade catálogo -> carrinho resolvido -> simulação ----------
    const { data: s1, error: s1e } = await sim(sPar);
    const l1 = simLines(s1);
    const cmp: string[] = [];
    let parOk = !s1e && l1.length === cart.length;
    for (const l of l1) {
      const c = items.find((i) => i.item_id === l.item_id);
      const q = cart.find((x) => x.item_id === l.item_id)?.quantidade ?? 0;
      const base = Number(l.base_price ?? 0);
      const sub = Number(l.line_final_amount ?? 0);
      const desc = Number(l.plan_discount_percent ?? 0);
      const catPrice = Number(c?.preco_parceiro ?? -1);
      const esperadoSub = Math.round(base * (1 - desc / 100) * 100) / 100 * q;
      const okItem = !!c && Math.abs(catPrice - base) < 0.005 &&
        Number(l.quantidade) === q && l.unidade_medida === "hectare" &&
        Math.abs(sub - esperadoSub) < 0.05;
      if (!okItem) parOk = false;
      cmp.push(`${l.codigo}: catálogo=${catPrice} base=${base} un=${l.unidade_medida} qtd=${l.quantidade} desc=${desc}% subtotal=${sub} (esperado ${esperadoSub.toFixed(2)})`);
    }
    const sumLines = l1.reduce((a: number, l: any) => a + Number(l.line_final_amount ?? 0), 0);
    const netAmt = Number(s1?.net_amount_after_discount ?? 0);
    const finalAmt = Number(s1?.final_amount ?? 0);
    const arred = Math.abs(finalAmt * 100 - Math.round(finalAmt * 100)) < 1e-6 &&
      Math.abs(sumLines - netAmt) < 0.02;
    rec("P2.paridade_catalogo_carrinho_simulacao", parOk && arred,
      "mesmo preço-base/unidade/qtd/desconto/subtotal do catálogo; soma das linhas = líquido; total com 2 casas",
      `${cmp.join(" | ")} | soma_linhas=${sumLines.toFixed(2)} liquido=${netAmt.toFixed(2)} juros=${s1?.financial_interest_amount} final=${finalAmt.toFixed(2)} arredondamento_ok=${arred}`);

    // ---------- P3: pedido — snapshot idêntico à simulação ----------
    const ord = await sPar.rpc("create_partner_order_secure", {
      p_partner_id: pid, p_observacoes: "paridade", p_items: cart, p_payment_plan_id: plan.id,
      p_expected_cart_hash: s1.cart_hash, p_idempotency_key: `${tag}-k1`,
    });
    const oid = ord.data?.id;
    const { data: snap } = await admin.from("partner_order_items")
      .select("product_id, microrganismo_id, quantidade, base_price_snapshot, subtotal").eq("order_id", oid);
    const { data: terms } = await admin.from("partner_order_payment_terms")
      .select("installment_count, final_amount, first_due_date").eq("partner_order_id", oid).maybeSingle();
    const snapOk = !ord.error && (snap ?? []).length === cart.length &&
      l1.every((l: any) => {
        const s = (snap ?? []).find((x: any) => x.product_id === l.item_id || x.microrganismo_id === l.item_id);
        return s && Math.abs(Number(s.base_price_snapshot) - Number(l.base_price)) < 0.005 &&
          Number(s.quantidade) === Number(l.quantidade);
      }) && Math.abs(Number(terms?.final_amount ?? -1) - finalAmt) < 0.01 &&
      Number(terms?.installment_count) === (s1?.schedule ?? []).length;
    rec("P3.snapshot_pedido", snapOk,
      "snapshot do pedido = simulação (preço-base, qtd, subtotal, total, parcelas)",
      `itens=${(snap ?? []).length}, total_snapshot=${terms?.final_amount}, total_simulado=${finalAmt.toFixed(2)}, parcelas_snapshot=${terms?.installment_count}, parcelas_simuladas=${(s1?.schedule ?? []).length}, erro=${errMsg(ord.error) || "nenhum"}`);

    // ---------- P4: crédito comprometido = total snapshot, sem dupla contagem ----------
    const exposure = async () => {
      const { data } = await sFin.rpc("rpc_b2b_partner_credit", { p_partner_id: pid });
      const d: any = Array.isArray(data) ? data[0] : data;
      return Number(d?.exposicao_atual ?? 0);
    };

    const totalSnap = Number(terms?.final_amount ?? 0);
    const expPendente = await exposure();
    const apr = await sCom.rpc("approve_partner_order", { p_order_id: oid, p_approval_notes: `${tag} aprovacao paridade` });
    const expAfter = await exposure();
    const replays = await Promise.all([1, 2].map(() => sPar.rpc("create_partner_order_secure", {
      p_partner_id: pid, p_observacoes: "paridade", p_items: cart, p_payment_plan_id: plan.id,
      p_expected_cart_hash: s1.cart_hash, p_idempotency_key: `${tag}-k1`,
    })));
    const expReplay = await exposure();
    const { count: cntK1 } = await admin.from("partner_orders").select("id", { count: "exact", head: true })
      .eq("partner_id", pid).eq("observacoes", "paridade");
    rec("P4.credito_total_snapshot",
      Math.abs(expPendente) < 0.01 && !apr.error && Math.abs(expAfter - totalSnap) < 0.01 &&
      Math.abs(expReplay - expAfter) < 0.01 && (cntK1 ?? 0) === 1 &&
      replays.every((r: any) => r.data?.id === oid),
      "pendente não compromete; após aprovação exposição = total snapshot; replay/concorrência não duplica",
      `exposição_pendente=${expPendente.toFixed(2)}, aprovação=${errMsg(apr.error) || "ok"}, exposição_aprovado=${expAfter.toFixed(2)}, total_snapshot=${totalSnap.toFixed(2)}, após_2_replays_concorrentes=${expReplay.toFixed(2)}, pedidos_com_a_chave=${cntK1}, replays_mesmo_id=${replays.every((r: any) => r.data?.id === oid)}`);


    // ---------- P5: mudança de preço/plano -> hash inválido, zero pedido/exposição ----------
    const alvo = priced[0];
    const isProd = alvo.item_tipo === "produto";
    const tbl = isProd ? "produtos" : "microrganismos";
    const { data: orig } = await admin.from(tbl).select("valor_ha_brl, valor_litro_brl, valor_dose_brl").eq("id", alvo.item_id).single();
    const bump = (v: any) => (v == null ? null : Number(v) + 1);
    await admin.from(tbl).update({
      valor_ha_brl: bump(orig?.valor_ha_brl), valor_litro_brl: bump(orig?.valor_litro_brl), valor_dose_brl: bump(orig?.valor_dose_brl),
    }).eq("id", alvo.item_id);
    const stale = await sPar.rpc("create_partner_order_secure", {
      p_partner_id: pid, p_observacoes: "preco alterado", p_items: cart, p_payment_plan_id: plan.id,
      p_expected_cart_hash: s1.cart_hash, p_idempotency_key: `${tag}-kstale`,
    });
    const expStale = await exposure();
    const { count: cntStale } = await admin.from("partner_orders").select("id", { count: "exact", head: true })
      .eq("partner_id", pid).eq("observacoes", "preco alterado");
    await admin.from(tbl).update(orig as any).eq("id", alvo.item_id);
    const staleMsg = errMsg(stale.error);
    rec("P5.price_changed_hash_invalido", !!stale.error && (cntStale ?? 0) === 0 && Math.abs(expStale - expAfter) < 0.01,
      "erro price_changed/hash inválido, zero pedido e zero exposição adicional",
      `erro=${staleMsg || "PERMITIDO"}, pedidos_criados=${cntStale}, exposição=${expStale.toFixed(2)} (inalterada=${Math.abs(expStale - expAfter) < 0.01})`);

    const planAlt = allPlans[1];
    let planSwapDetail = "sem plano alternativo";
    let planSwapOk = true;
    if (planAlt) {
      const sw = await sPar.rpc("create_partner_order_secure", {
        p_partner_id: pid, p_observacoes: "plano trocado", p_items: cart, p_payment_plan_id: planAlt.id,
        p_expected_cart_hash: s1.cart_hash, p_idempotency_key: `${tag}-kswap`,
      });
      const { count: cSw } = await admin.from("partner_orders").select("id", { count: "exact", head: true })
        .eq("partner_id", pid).eq("observacoes", "plano trocado");
      planSwapOk = !!sw.error && (cSw ?? 0) === 0;
      planSwapDetail = `erro=${errMsg(sw.error) || "PERMITIDO"}, pedidos=${cSw}`;
    }
    rec("P6.troca_de_plano_invalida_hash", planSwapOk,
      "hash da simulação não vale para outro plano; zero pedido", planSwapDetail);

    // ---------- P7: quote_only ----------
    const { data: qo, error: qoErr } = await admin.from("produtos").insert({
      nome: `${tag}-sem-preco`, codigo: `${tag.toUpperCase()}-QO`, tipo: "inoculante",
      ativo: true, b2b_enabled: true, valor_ha_brl: null, valor_litro_brl: null, valor_dose_brl: null,
    }).select("id").single();
    if (qoErr) throw new Error(`fixture quote_only: ${qoErr.message}`);
    created.produtos.push(qo.id);
    const { data: cat2 } = await sPar.rpc("get_partner_catalog_secure", { p_partner_id: pid });
    const qoRow = ((cat2 as any[]) ?? []).find((i) => i.item_id === qo.id);
    const qoVisivel = !!qoRow && qoRow.unidade_preco_principal === "sob_consulta" && qoRow.preco_parceiro == null;
    rec("P7.quote_only_visivel", qoVisivel,
      "item sem preço aparece como 'sob consulta', nunca zero nem omitido",
      `presente=${!!qoRow}, unidade=${qoRow?.unidade_preco_principal}, preco=${String(qoRow?.preco_parceiro)}`);

    const qoCart = [{ item_tipo: "produto", item_id: qo.id, quantidade: 1 }];
    const mixCart = [...cart, { item_tipo: "produto", item_id: qo.id, quantidade: 1 }];
    const qSim = await sim(sPar, plan, qoCart);
    const mSim = await sim(sPar, plan, mixCart);
    const qOrder = await sPar.rpc("create_partner_order_secure", {
      p_partner_id: pid, p_observacoes: "quote only", p_items: qoCart, p_payment_plan_id: plan.id,
      p_expected_cart_hash: (qSim.data as any)?.cart_hash ?? "0".repeat(64), p_idempotency_key: `${tag}-kqo`,
    });
    const mOrder = await sPar.rpc("create_partner_order_secure", {
      p_partner_id: pid, p_observacoes: "quote misto", p_items: mixCart, p_payment_plan_id: plan.id,
      p_expected_cart_hash: (mSim.data as any)?.cart_hash ?? "0".repeat(64), p_idempotency_key: `${tag}-kmix`,
    });
    const expQo = await exposure();
    const simQoBlocked = !!qSim.error || Number((qSim.data as any)?.final_amount ?? 0) === 0;
    const simMixBlocked = !!mSim.error || Number((mSim.data as any)?.final_amount ?? 0) === 0;
    const qoOk = simQoBlocked && simMixBlocked && !!qOrder.error && !!mOrder.error && Math.abs(expQo - expAfter) < 0.01;
    rec("P8.quote_only_bloqueia_servidor", qoOk,
      "simulação conclusiva/checkout/conversão e crédito bloqueados para quote_only e para carrinho misto",
      `sim_quote=${errMsg(qSim.error) || `final=${(qSim.data as any)?.final_amount}`}, sim_misto=${errMsg(mSim.error) || `final=${(mSim.data as any)?.final_amount}`}, ` +
      `pedido_quote=${errMsg(qOrder.error) || "PERMITIDO"}, pedido_misto=${errMsg(mOrder.error) || "PERMITIDO"}, exposição=${expQo.toFixed(2)} (inalterada)`);

    // ---------- P9: revalidação pós-cotação ----------
    const { data: reSim } = await sim(sPar);
    const reOk = !!reSim?.cart_hash && Math.abs(Number(reSim.final_amount) - finalAmt) < 0.01;
    const { data: ordNow } = await admin.from("partner_orders").select("status").eq("id", oid).single();
    rec("P9.revalidacao_pos_cotacao", reOk,
      "após cotação, preço/plano/hash/total revalidados contra o snapshot",
      `hash_novo=${!!reSim?.cart_hash}, total=${Number(reSim?.final_amount).toFixed(2)} vs snapshot=${totalSnap.toFixed(2)}, status_pedido=${ordNow?.status}`);

    // ---------- P10: planos à vista / parcelado / com aprovação ----------
    const planDet: string[] = [];
    let planOk = true;
    for (const [rot, pl] of [["à_vista", planVista], ["parcelado", planParc], ["com_aprovação", planAprov]] as any[]) {
      if (!pl) { planDet.push(`${rot}=inexistente no catálogo de planos`); continue; }
      const { data: sp, error: spe } = await sim(sPar, pl);
      const sched = (sp?.schedule ?? []) as any[];
      const n = sched.length;
      const soma = sched.reduce((a: number, r: any) => a + Number(r.amount ?? 0), 0);
      const ok = !spe && Number(sp?.final_amount ?? 0) > 0 &&
        n === Number(pl.installment_count ?? 1) && Math.abs(soma - Number(sp.final_amount)) < 0.02;
      if (!ok) planOk = false;
      planDet.push(`${rot}: total=${sp?.final_amount}, juros=${sp?.financial_interest_amount}, parcelas=${n}/${pl.installment_count}, soma_parcelas=${soma.toFixed(2)}, aprovação_exigida=${pl.requires_financial_approval}, erro=${errMsg(spe) || "nenhum"}`);

    }
    rec("P10.planos_vista_parcelado_aprovacao", planOk,
      "cada modalidade simula com total>0 e soma de parcelas = total", planDet.join(" | "));

    // ---------- P11: perfis autorizados ----------
    const perf: string[] = [];
    const tecSim = await sim(sTec);
    const comSim = await sim(sCom);
    const perfOk = !!tecSim.error && !comSim.error;
    perf.push(`tecnico_b2b=${errMsg(tecSim.error) || "PERMITIDO"}`, `gestor_comercial=${errMsg(comSim.error) || "ok"}`);
    rec("P11.perfis_autorizados", perfOk,
      "técnico B2B sem termos financeiros; gestor comercial autorizado", perf.join(" | "));

    // ---------- P12: liberação de crédito por rejeição / cancelamento canônicos ----------
    const ciclo = async (rot: string, key: string, aprovar: boolean, fim: (id: string) => Promise<any>) => {
      const { data: sx } = await sim(sPar);
      const o = await sPar.rpc("create_partner_order_secure", {
        p_partner_id: pid, p_observacoes: rot, p_items: cart, p_payment_plan_id: plan.id,
        p_expected_cart_hash: (sx as any).cart_hash, p_idempotency_key: key,
      });
      const base = await exposure();
      let ap: any = null; let comAprov = base;
      if (aprovar) {
        ap = await sCom.rpc("approve_partner_order", { p_order_id: o.data?.id, p_approval_notes: `${tag} ${rot}` });
        comAprov = await exposure();
      }
      const esperadoAprov = aprovar ? base + totalSnap : base;
      const fimRes = await fim(o.data?.id);
      const depois = await exposure();
      const ok = !ap?.error && Math.abs(comAprov - esperadoAprov) < 0.05 &&
        !fimRes?.error && Math.abs(depois - base) < 0.05;
      return { ok, txt: `${rot}(aprovado=${aprovar}): base=${base.toFixed(2)} pós_aprovação=${comAprov.toFixed(2)} (esperado ${esperadoAprov.toFixed(2)}) final=${depois.toFixed(2)} (esperado ${base.toFixed(2)}) encerramento=${errMsg(fimRes?.error) || "ok"}` };
    };
    // rejeição é canônica apenas antes da aprovação; cancelamento libera pedido já aprovado
    const cRej = await ciclo("rejeitar", `${tag}-krej`, false, (id) =>
      sCom.rpc("reject_partner_order", { p_order_id: id, p_approval_notes: `${tag} motivo rejeicao` }));
    const cCan = await ciclo("cancelar", `${tag}-kcan`, true, (id) =>
      sCom.rpc("update_partner_order_status", { p_order_id: id, p_status: "cancelado", p_motivo: `${tag} cancelamento` }));

    rec("P12.credito_liberado_rejeicao_cancelamento", cRej.ok && cCan.ok,
      "aprovação compromete exatamente o total snapshot; rejeição e cancelamento canônicos liberam integralmente",
      `${cRej.txt} | ${cCan.txt}`);


    // ---------- P13: preservação histórica ----------
    const { data: hist } = await admin.from("partner_order_items")
      .select("base_price_snapshot").eq("order_id", oid);
    const preserved = (hist ?? []).every((h: any, k: number) =>
      Math.abs(Number(h.base_price_snapshot) - Number((snap ?? [])[k]?.base_price_snapshot)) < 0.005);
    rec("P13.preservacao_historica", preserved,
      "snapshot do pedido não muda após alteração/reversão de preço no catálogo",
      `itens conferidos=${(hist ?? []).length}, inalterados=${preserved}`);
  } catch (e) {
    rec("X.execucao", false, "execução completa", errMsg(e));
  } finally {
    const errs: string[] = [];
    try {
      const { data: sweep } = await admin.from("partner_accounts").select("id").like("razao_social", "hp-%");
      const pids = Array.from(new Set([...created.partners, ...((sweep ?? []).map((p: any) => p.id))]));
      const { data: orders } = await admin.from("partner_orders").select("id").in("partner_id", pids);
      const ids = (orders ?? []).map((o: any) => o.id);
      const del = async (t: string, c: string, v: string[], client: any = admin) => {
        if (!v.length) return;
        const { error } = await client.from(t).delete().in(c, v);
        if (error) errs.push(`${t}: ${error.message}`);
      };
      if (ids.length) {
        const { data: lk } = await admin.from("partner_order_financial_links").select("receivable_id").in("partner_order_id", ids);
        const recIds = (lk ?? []).map((l: any) => l.receivable_id).filter(Boolean);
        for (const id of ids) {
          const { error } = await (admSess ?? admin).rpc("cancel_b2b_receivable_secure", { p_partner_order_id: id, p_motivo: "rollback harness paridade" });
          if (error && !/nao encontrado|não encontrado|not_found|sem cobran/i.test(error.message)) errs.push(`cancel: ${error.message}`);
        }
        await del("partner_order_financial_links", "partner_order_id", ids, admSess ?? admin);
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
      await del("partner_order_idempotency", "partner_id", pids);
      await del("partner_users", "partner_id", pids);
      await del("partner_financial_settings", "partner_id", pids);
      await del("partner_accounts", "id", pids);
      await del("produtos", "id", created.produtos);
      await del("commercial_payment_plans", "id", created.planos);

      if (created.users.length) {
        await del("user_roles", "user_id", created.users);
        await del("financial_audit_log", "performed_by", created.users);
        await del("profiles", "user_id", created.users);
        for (const id of created.users) {
          const { error } = await admin.auth.admin.deleteUser(id);
          if (error) errs.push(`user: ${error.message}`);
        }
      }
      const { count: lo } = await admin.from("partner_orders").select("id", { count: "exact", head: true }).in("partner_id", pids);
      const { count: lp } = await admin.from("partner_accounts").select("id", { count: "exact", head: true }).like("razao_social", "hp-%");
      const { count: lpr } = await admin.from("produtos").select("id", { count: "exact", head: true }).like("nome", "hp-%");
      const { count: lpl } = await admin.from("commercial_payment_plans").select("id", { count: "exact", head: true }).like("name", "hp-%");
      rec("Z.cleanup", (lo ?? 0) === 0 && (lp ?? 0) === 0 && (lpr ?? 0) === 0 && (lpl ?? 0) === 0 && errs.length === 0,
        "zero residuais e zero erros",
        `pedidos=${lo}, parceiros=${lp}, produtos=${lpr}, planos=${lpl}, usuários removidos=${created.users.length}, erros=${errs.join(" | ") || "nenhum"}`);

    } catch (e) {
      rec("Z.cleanup", false, "zero residuais", errMsg(e));
    }
  }

  const pass = results.filter((r) => r.ok).length;
  return new Response(JSON.stringify({ pass, total: results.length, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
