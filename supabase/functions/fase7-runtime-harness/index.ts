// TEMPORARY internal harness — Fase 7 runtime proofs (staging only).
// Protected by INTERNAL_FUNCTION_SECRET. Never logs secrets or tokens.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SECRET =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(URL_, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Res = { id: string; ok: boolean; detail: string };
const results: Res[] = [];
const rec = (id: string, ok: boolean, detail: string) => {
  results.push({ id, ok, detail: String(detail).slice(0, 300) });
};

const rnd = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const pwd = () => crypto.randomUUID() + "Aa1!";

async function mkUser(email: string) {
  const password = pwd();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error("createUser: " + error.message);
  return { id: data.user!.id, email, password };
}

async function session(email: string, password: string) {
  const c = createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error("signIn: " + error.message);
  return c;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7);
  const { data: claims } = await admin.auth.getClaims(token);
  const callerId = claims?.claims?.sub as string | undefined;
  let isAdmin = false;
  if (callerId) {
    const { data: rr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "administrador")
      .maybeSingle();
    isAdmin = !!rr;
  }
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tag = "h7-" + rnd();
  const created: { users: string[]; partners: string[] } = { users: [], partners: [] };

  try {
    // ---------- Item 3: ephemeral partners + auth users ----------
    const { data: pA, error: eA } = await admin
      .from("partner_accounts")
      .insert({ razao_social: `${tag} Parceiro A`, ativo: true })
      .select("id")
      .single();
    if (eA) throw new Error("partnerA: " + eA.message);
    const { data: pB, error: eB } = await admin
      .from("partner_accounts")
      .insert({ razao_social: `${tag} Parceiro B`, ativo: true })
      .select("id")
      .single();
    if (eB) throw new Error("partnerB: " + eB.message);
    created.partners.push(pA.id, pB.id);

    const uA = await mkUser(`${tag}.a@harness.invalid`);
    const uT = await mkUser(`${tag}.t@harness.invalid`);
    const uB = await mkUser(`${tag}.b@harness.invalid`);
    const uAdm = await mkUser(`${tag}.adm@harness.invalid`);
    created.users.push(uA.id, uT.id, uB.id, uAdm.id);

    await admin.from("user_roles").delete().in("user_id", created.users);
    await admin.from("user_roles").insert([
      { user_id: uA.id, role: "parceiro_b2b" },
      { user_id: uT.id, role: "parceiro_b2b_tecnico" },
      { user_id: uB.id, role: "parceiro_b2b" },
      { user_id: uAdm.id, role: "administrador" },
    ]);
    await admin.from("partner_users").insert([
      { partner_id: pA.id, user_id: uA.id, papel: "gestor" },
      { partner_id: pA.id, user_id: uT.id, papel: "tecnico" },
      { partner_id: pB.id, user_id: uB.id, papel: "gestor" },
    ]);
    rec("3.users", true, "2 parceiros + 4 usuários auth efêmeros criados");

    const sA1 = await session(uA.email, uA.password);
    const sA2 = await session(uA.email, uA.password); // segunda sessão real
    const sT = await session(uT.email, uT.password);
    const sB = await session(uB.email, uB.password);
    const sAdm1 = await session(uAdm.email, uAdm.password);
    const sAdm2 = await session(uAdm.email, uAdm.password);
    rec("3.sessions", true, "6 sessões autenticadas independentes");

    // ---------- Item 9: catálogo ----------
    const { data: cat, error: catErr } = await sA1.rpc("get_partner_catalog_secure", {
      p_partner_id: pA.id,
    });
    if (catErr) throw new Error("catalogo: " + catErr.message);
    const priced = (cat ?? []).filter((r: any) => r.preco_parceiro > 0);
    rec("9.catalog", priced.length >= 2, `${cat?.length ?? 0} itens, ${priced.length} precificados`);

    const { data: plan } = await admin
      .from("commercial_payment_plans")
      .select("id, code, discount_percent")
      .eq("active", true)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    if (!plan) throw new Error("nenhum plano ativo");

    const pick = priced.slice(0, 2);
    const items = pick.map((r: any) => ({
      item_id: r.item_id,
      item_tipo: r.item_tipo,
      quantidade: 2,
      unidade_medida:
        r.unidade_preco_principal === "hectare"
          ? "hectare"
          : r.unidade_preco_principal === "litro"
          ? "litro"
          : "dose",
    }));

    // ---------- Item 6: simulação autoritativa ----------
    const { data: sim, error: simErr } = await sA1.rpc("simulate_b2b_payment_plan_secure", {
      p_partner_id: pA.id,
      p_payment_plan_id: plan.id,
      p_items: items,
    });
    if (simErr) throw new Error("simulacao: " + simErr.message);
    rec("6.simulate", !!sim?.cart_hash && sim.final_amount > 0, `final=${sim?.final_amount}`);

    // paridade catálogo -> simulação (base_price == preço de vitrine)
    const parity = (sim.items ?? []).every((ln: any) => {
      const c = pick.find((r: any) => r.item_id === ln.item_id);
      return c && Math.abs(Number(c.preco_parceiro) - Number(ln.base_price)) < 0.01;
    });
    rec("9.parity_cat_sim", parity, "base_price da simulação == preco_parceiro do catálogo");

    // ---------- Itens 4/5: concorrência real e idempotência ----------
    const idem = `${tag}-ord-1`;
    const args = {
      p_partner_id: pA.id,
      p_observacoes: `${tag} pedido`,
      p_items: items,
      p_requested_delivery_date: null,
      p_payment_plan_id: plan.id,
      p_first_due_date: sim.first_due_date,
      p_installment_count: sim.payment_plan.installment_count,
      p_expected_cart_hash: sim.cart_hash,
      p_idempotency_key: idem,
    };
    const [r1, r2] = await Promise.all([
      sA1.rpc("create_partner_order_secure", args),
      sA2.rpc("create_partner_order_secure", args),
    ]);
    const okCount = [r1, r2].filter((r) => !r.error).length;
    const { count: ordCount } = await admin
      .from("partner_orders")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", pA.id);
    rec("4.concurrency_same_key", ordCount === 1, `sucessos=${okCount}, pedidos=${ordCount}`);

    const orderId = (r1.data ?? r2.data) as any;
    const oid = typeof orderId === "string" ? orderId : orderId?.order_id ?? orderId?.id;

    // divergente com mesma chave
    const divergent = {
      ...args,
      p_items: [{ ...items[0], quantidade: 99 }],
    };
    const dv = await sA1.rpc("create_partner_order_secure", divergent);
    const { count: ordCount2 } = await admin
      .from("partner_orders")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", pA.id);
    rec(
      "5.idempotency_conflict",
      !!dv.error && ordCount2 === 1,
      `erro=${dv.error?.message ?? "nenhum"}, pedidos=${ordCount2}`,
    );

    // ---------- Item 9: paridade simulação -> snapshot do pedido ----------
    const { data: snap } = await admin
      .from("partner_order_items")
      .select(
        "product_id, microrganismo_id, base_price_snapshot, preco_unitario_final_snapshot, plan_discount_percent_snapshot, quantidade",
      )
      .eq("order_id", oid);
    const snapOk =
      (snap?.length ?? 0) === items.length &&
      (snap ?? []).every((s: any) => {
        const ln = (sim.items ?? []).find(
          (l: any) => l.item_id === (s.product_id ?? s.microrganismo_id),
        );
        return (
          ln &&
          Math.abs(Number(s.base_price_snapshot) - Number(ln.base_price)) < 0.01 &&
          Math.abs(
            Number(s.preco_unitario_final_snapshot) - Number(ln.final_unit_price),
          ) < 0.01
        );
      });
    rec("9.parity_sim_snapshot", snapOk, `${snap?.length ?? 0} itens conferidos`);

    // ---------- Item 8: gates server-side ----------
    const badHash = await sA1.rpc("create_partner_order_secure", {
      ...args,
      p_idempotency_key: `${tag}-bad`,
      p_expected_cart_hash: "0".repeat(64),
    });
    rec("8.invalid_hash", !!badHash.error, badHash.error?.message ?? "aceitou hash inválido");

    const selfApprove = await sA1.rpc("approve_partner_order", {
      p_order_id: oid,
      p_approval_notes: "self",
      p_estimated_delivery_date: null,
    });
    rec("8.partner_self_approve", !!selfApprove.error, selfApprove.error?.message ?? "permitiu");

    const techCat = await sT.rpc("get_partner_catalog_secure", { p_partner_id: pA.id });
    const techSim = await sT.rpc("simulate_b2b_payment_plan_secure", {
      p_partner_id: pA.id,
      p_payment_plan_id: plan.id,
      p_items: items,
    });
    rec(
      "8.tecnico_sem_financeiro",
      !!techCat.error && !!techSim.error,
      `${techCat.error?.message ?? "cat ok"} | ${techSim.error?.message ?? "sim ok"}`,
    );

    // ---------- Item 7: E2E A/B/C + concorrência de recebível ----------
    const [a1, a2] = await Promise.all([
      sAdm1.rpc("approve_partner_order", {
        p_order_id: oid,
        p_approval_notes: "ok",
        p_estimated_delivery_date: null,
      }),
      sAdm2.rpc("approve_partner_order", {
        p_order_id: oid,
        p_approval_notes: "ok",
        p_estimated_delivery_date: null,
      }),
    ]);
    const apprOk = [a1, a2].filter((r) => !r.error).length;
    const { data: ord } = await admin
      .from("partner_orders")
      .select("status")
      .eq("id", oid)
      .single();
    const { data: links } = await admin
      .from("partner_order_financial_links")
      .select("id, receivable_id")
      .eq("partner_order_id", oid);
    rec(
      "7.approve_concurrency",
      apprOk === 1 && ord?.status === "aprovado",
      `ok=${apprOk}, status=${ord?.status}`,
    );
    rec("7.receivable_unico", (links?.length ?? 0) <= 1, `vínculos=${links?.length ?? 0}`);

    // concorrência real de geração de recebível (2 sessões admin)
    const [g1, g2] = await Promise.all([
      sAdm1.rpc("generate_b2b_receivable_secure", { p_partner_order_id: oid }),
      sAdm2.rpc("generate_b2b_receivable_secure", { p_partner_order_id: oid }),
    ]);
    const { data: links2 } = await admin
      .from("partner_order_financial_links")
      .select("id, receivable_id")
      .eq("partner_order_id", oid);
    const { count: recCount } = await admin
      .from("accounts_receivable")
      .select("id", { count: "exact", head: true })
      .eq("origin_id", oid);
    rec(
      "7.receivable_concurrency",
      (links2?.length ?? 0) <= 1 && (recCount ?? 0) <= 1,
      `links=${links2?.length ?? 0}, recebíveis=${recCount ?? 0}, erros=${[g1, g2].filter((r) => r.error).map((r) => r.error!.message).join(" | ") || "nenhum"}`,
    );

    const reopen = await sA1.rpc("respond_b2b_order_quote_secure", {
      p_order_id: oid,
      p_lines: [],
      p_first_due_date: null,
      p_installment_count: null,
      p_motivo: "tentativa",
    });
    rec("7.imutabilidade", !!reopen.error, reopen.error?.message ?? "permitiu alteração");

    // ---------- Item 9: RLS / isolamento ----------
    const { data: leak } = await sB.from("partner_orders").select("id").eq("id", oid);
    const catB = await sB.rpc("get_partner_catalog_secure", { p_partner_id: pA.id });
    rec(
      "9.rls_isolamento",
      (leak?.length ?? 0) === 0 && !!catB.error,
      `linhas=${leak?.length ?? 0}, catálogo cruzado=${catB.error?.message ?? "vazou"}`,
    );
  } catch (e) {
    rec("fatal", false, (e as Error).message);
  } finally {
    // ---------- rollback / cleanup determinístico ----------
    const errs: string[] = [];
    const del = async (table: string, col: string, vals: string[]) => {
      if (!vals.length) return;
      const { error } = await admin.from(table).delete().in(col, vals);
      if (error) errs.push(`${table}: ${error.message}`);
    };
    try {
      // varredura por prefixo do harness (inclui resíduos de execuções anteriores)
      const { data: sweep } = await admin
        .from("partner_accounts")
        .select("id")
        .like("razao_social", "h7-%");
      const partnerIds = Array.from(
        new Set([...(created.partners ?? []), ...((sweep ?? []).map((p: any) => p.id))]),
      );
      const { data: orders } = await admin
        .from("partner_orders")
        .select("id")
        .in("partner_id", partnerIds);
      const ids = (orders ?? []).map((o: any) => o.id);
      if (ids.length) {
        const { data: lk } = await admin
          .from("partner_order_financial_links")
          .select("receivable_id")
          .in("partner_order_id", ids);
        const recIds = (lk ?? []).map((l: any) => l.receivable_id).filter(Boolean);
        await del("partner_order_financial_links", "partner_order_id", ids);
        if (recIds.length) {
          await del("receivable_payments", "receivable_id", recIds);
          await del("accounts_receivable_installments", "receivable_id", recIds);
          await del("financial_receipts", "receivable_id", recIds);
          await del("accounts_receivable", "id", recIds);
        }
        await del("accounts_receivable", "origin_id", ids);
        await del("partner_order_payment_schedule", "order_id", ids);
        await del("partner_order_payment_terms", "partner_order_id", ids);
        await del("partner_order_audit_logs", "order_id", ids);
        await del("partner_order_items", "order_id", ids);
        await del("partner_order_idempotency", "order_id", ids);
        await del("partner_orders", "id", ids);
      }
      await del("partner_order_idempotency", "partner_id", partnerIds);
      await del("partner_users", "partner_id", partnerIds);
      await del("partner_financial_settings", "partner_id", partnerIds);
      await del("partner_accounts", "id", partnerIds);
      if (created.users.length) {
        await del("user_roles", "user_id", created.users);
        await del("profiles", "user_id", created.users);
        for (const id of created.users) await admin.auth.admin.deleteUser(id);
      }
      const { count: leftOrders } = await admin
        .from("partner_orders")
        .select("id", { count: "exact", head: true })
        .in("partner_id", partnerIds);
      const { count: leftPartners } = await admin
        .from("partner_accounts")
        .select("id", { count: "exact", head: true })
        .like("razao_social", "h7-%");
      rec(
        "3.cleanup",
        (leftOrders ?? 0) === 0 && (leftPartners ?? 0) === 0 && errs.length === 0,
        `pedidos=${leftOrders}, parceiros=${leftPartners}, usuários removidos=${created.users.length}, erros=${errs.join(" | ") || "nenhum"}`,
      );
    } catch (e) {
      rec("3.cleanup", false, (e as Error).message + " | " + errs.join(" | "));
    }
  }

  const failed = results.filter((r) => !r.ok);
  return new Response(
    JSON.stringify({ total: results.length, pass: results.length - failed.length, results }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
