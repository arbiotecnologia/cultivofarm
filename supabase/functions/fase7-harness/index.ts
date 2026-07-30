// TEMPORARIO — harness interno de auditoria (Fase 7). Somente staging.
// Protegido por segredo aleatorio em memoria (FASE7_HARNESS_SECRET).
// Deve ser removido apos a execucao. Nao expor publicamente.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const STAGING_REF = "ikaauvsflpmamgxmkhoq";
const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SECRET_SHA256 = "4e34ff70dc6ccdc019b74528ad9c0a464218ef4f9b61a20d3d8050b48f37c5f3";
async function sha256Hex(v: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

type Res = { id: string; status: "PASS" | "FAIL"; detail: string };

const admin = () => createClient(URL_, SERVICE, { auth: { persistSession: false } });
const rnd = () => crypto.randomUUID().slice(0, 8);
const pw = () => `Hx${crypto.randomUUID()}!9`;

async function userClient(email: string, password: string) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signin ${email}: ${error.message}`);
  return createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const provided = req.headers.get("x-harness-secret") ?? "";
  if (!provided || (await sha256Hex(provided)) !== SECRET_SHA256) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });
  }
  if (!URL_.includes(STAGING_REF)) {
    return new Response(JSON.stringify({ error: "ambiente nao e staging — recusado" }), { status: 400, headers: corsHeaders });
  }

  const a = admin();
  const out: Res[] = [];
  const push = (id: string, ok: boolean, detail: unknown) =>
    out.push({ id, status: ok ? "PASS" : "FAIL", detail: String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400) });

  const createdUsers: string[] = [];
  let partnerId: string | null = null;
  let partnerBId: string | null = null;
  const orderIds: string[] = [];

  try {
    // marker de staging
    const { data: mk } = await a.from("_fiscal_staging_marker").select("marker,project_ref").limit(1);
    const m = (mk ?? [])[0] as { marker?: string; project_ref?: string } | undefined;
    if (m?.marker !== "STAGING" || m?.project_ref !== STAGING_REF) throw new Error("marker de staging invalido");

    const tag = `f7h-${rnd()}`;
    // ---------- setup: parceiros efemeros ----------
    const mkPartner = async (suffix: string) => {
      const { data, error } = await a.from("partner_accounts").insert({
        razao_social: `HARNESS ${tag}-${suffix}`,
        nome_fantasia: `HARNESS ${tag}-${suffix}`,
        ativo: true,
        limite_credito_brl: 1000000,
      }).select("id").single();
      if (error) throw new Error(`partner_accounts: ${error.message}`);
      return data.id as string;
    };
    partnerId = await mkPartner("A");
    partnerBId = await mkPartner("B");

    const mkUser = async (role: string, partner?: string | null) => {
      const email = `${tag}-${role}-${rnd()}@harness.staging.local`;
      const password = pw();
      const { data, error } = await a.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw new Error(`createUser ${role}: ${error.message}`);
      const uid = data.user!.id;
      createdUsers.push(uid);
      await a.from("user_roles").delete().eq("user_id", uid);
      const { error: re } = await a.from("user_roles").insert({ user_id: uid, role });
      if (re) throw new Error(`user_roles ${role}: ${re.message}`);
      if (partner) {
        const { error: pe } = await a.from("partner_users").insert({ partner_id: partner, user_id: uid });
        if (pe) throw new Error(`partner_users: ${pe.message}`);
      }
      return { uid, email, password };
    };

    const uPartner = await mkUser("parceiro_b2b", partnerId);
    const uPartnerB = await mkUser("parceiro_b2b", partnerBId);
    const uTec = await mkUser("parceiro_b2b_tecnico", partnerId);
    const uAdmin = await mkUser("administrador", null);

    const cP = await userClient(uPartner.email, uPartner.password);
    const cP2 = await userClient(uPartner.email, uPartner.password); // segunda sessao real
    const cB = await userClient(uPartnerB.email, uPartnerB.password);
    const cT = await userClient(uTec.email, uTec.password);
    const cA = await userClient(uAdmin.email, uAdmin.password);

    // ---------- item 9: catalogo (origem e paridade) ----------
    const { data: cat, error: catErr } = await cP.rpc("get_partner_catalog_secure", { p_partner_id: partnerId });
    const items = (cat ?? []) as Record<string, unknown>[];
    const priced = items.filter((i) => Number(i.preco_parceiro ?? 0) > 0 || Number(i.valor_dose_brl ?? 0) > 0 || Number(i.valor_litro_brl ?? 0) > 0);
    const quoteOnly = items.filter((i) => !(Number(i.preco_parceiro ?? 0) > 0 || Number(i.valor_dose_brl ?? 0) > 0 || Number(i.valor_litro_brl ?? 0) > 0));
    push("P9-catalogo", !catErr && items.length > 0 && priced.length + quoteOnly.length === items.length,
      { erro: catErr?.message, total: items.length, precificados: priced.length, quote_only: quoteOnly.length });

    const { data: plans } = await a.from("commercial_payment_plans")
      .select("id,code,is_active").eq("is_active", true).limit(1);
    const planId = (plans ?? [])[0]?.id as string | undefined;

    const src = priced[0] as Record<string, unknown> | undefined;
    const unidade = src?.item_tipo === "microrganismo"
      ? "litro"
      : (Number(src?.valor_dose_brl ?? 0) > 0 ? "dose" : "litro");
    const buildCart = (qty: number) => [{
      item_id: src?.item_id,
      item_tipo: src?.item_tipo,
      quantidade: qty,
      unidade_medida: unidade,
      volume_ml: null,
    }];

    if (!src || !planId) {
      push("P4-P8", false, "sem item precificado ou plano ativo para exercitar o fluxo");
    } else {
      const cart = buildCart(2);
      const { data: sim, error: simErr } = await cP.rpc("simulate_b2b_payment_plan_secure", {
        p_partner_id: partnerId, p_payment_plan_id: planId, p_items: cart, p_first_due_date: null,
      });
      const simObj = (Array.isArray(sim) ? sim[0] : sim) as Record<string, any> | null;
      const finalTotal = Number(simObj?.amounts?.final_amount ?? 0);
      const hash = simObj?.cart_hash ?? null;
      push("P4-simulacao", !simErr && finalTotal > 0 && !!hash,
        { erro: simErr?.message, total: finalTotal, hash_presente: !!hash, quote: simObj?.quote_required });

      const key = `${tag}-idem`;
      const call = (c: typeof cP, k: string, cartX: unknown[], h: unknown) => c.rpc("create_partner_order_secure", {
        p_partner_id: partnerId, p_observacoes: `HARNESS ${tag}`, p_items: cartX,
        p_requested_delivery_date: null, p_payment_plan_id: planId, p_first_due_date: null,
        p_installment_count: null, p_expected_cart_hash: h, p_idempotency_key: k,
      });

      // ITEM 4 — concorrencia real, duas sessoes, mesma chave e mesmo payload
      const r4 = await Promise.all([call(cP, key, cart, hash), call(cP2, key, cart, hash)]);
      const { count: c4 } = await a.from("partner_orders").select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId).eq("observacoes", `HARNESS ${tag}`);
      push("P4-concorrencia-mesma-chave", c4 === 1,
        { pedidos: c4, respostas: r4.map((r) => (r.error ? `ERR:${r.error.code ?? ""}` : "OK")) });

      const { data: ordRows } = await a.from("partner_orders").select("id,status")
        .eq("partner_id", partnerId).eq("observacoes", `HARNESS ${tag}`);
      (ordRows ?? []).forEach((o: { id: string }) => orderIds.push(o.id));

      // ITEM 5 — mesma chave, payload divergente => conflito e nenhum pedido novo
      const r5 = await call(cP, key, buildCart(7), hash);
      const { count: c5 } = await a.from("partner_orders").select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId);
      push("P5-conflito-payload", !!r5.error && c5 === 1, { erro: r5.error?.message?.slice(0, 120), pedidos: c5 });

      // ITEM 8a — hash invalido nao cria pedido
      const r8 = await call(cP, `${tag}-bad`, cart, "0".repeat(64));
      const { count: c8 } = await a.from("partner_orders").select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId);
      push("P8-hash-invalido", !!r8.error && c8 === 1, { erro: r8.error?.message?.slice(0, 120), pedidos: c8 });

      const orderId = orderIds[0];
      if (orderId) {
        // ITEM 8b — parceiro nao aprova o proprio pedido (gate server-side, efeito zero)
        const before = (await a.from("partner_orders").select("status").eq("id", orderId).single()).data?.status;
        const r8b = await cP.rpc("approve_partner_order", { p_order_id: orderId, p_approval_notes: "x", p_estimated_delivery_date: null });
        const after = (await a.from("partner_orders").select("status").eq("id", orderId).single()).data?.status;
        push("P8-parceiro-nao-aprova", !!r8b.error && before === after, { erro: r8b.error?.message?.slice(0, 120), status: after });

        // ITEM 8c — tecnico b2b sem acesso financeiro
        const r8c = await cT.rpc("rpc_b2b_partner_credit", { p_partner_id: partnerId });
        push("P8-tecnico-sem-financeiro", !!r8c.error, { erro: r8c.error?.message?.slice(0, 120) });

        // ITEM 7 + 6 — aprovacao E2E concorrente (duas sessoes admin) e unicidade de recebivel
        const cA2 = await userClient(uAdmin.email, uAdmin.password);
        const appr = (c: typeof cA) => c.rpc("approve_partner_order", {
          p_order_id: orderId, p_approval_notes: `HARNESS ${tag}`, p_estimated_delivery_date: null,
        });
        const r6 = await Promise.all([appr(cA), appr(cA2)]);
        const { data: st } = await a.from("partner_orders").select("status").eq("id", orderId).single();
        const { count: recv } = await a.from("accounts_receivable").select("id", { count: "exact", head: true })
          .eq("partner_order_id", orderId);
        push("P7-aprovacao-e2e", !!st && st.status !== "pendente",
          { status: st?.status, respostas: r6.map((r) => (r.error ? "ERR" : "OK")) });
        push("P6-recebivel-unico", (recv ?? 0) <= 1, { recebiveis: recv });

        // ITEM 7b — imutabilidade pos-aprovacao (ajuste bloqueado)
        const r7b = await cP.rpc("respond_b2b_order_quote_secure", {
          p_order_id: orderId, p_lines: [], p_first_due_date: null, p_installment_count: null, p_motivo: "harness",
        });
        push("P7-imutabilidade-pos-aprovacao", !!r7b.error, { erro: r7b.error?.message?.slice(0, 120) });

        // ITEM 9 — RLS: parceiro B nao enxerga pedido do parceiro A
        const { data: leak } = await cB.from("partner_orders").select("id").eq("id", orderId);
        push("P9-rls-isolamento", (leak ?? []).length === 0, { vazou: (leak ?? []).length });
      }
    }
  } catch (e) {
    push("EXCECAO", false, (e as Error).message);
  } finally {
    // cleanup determinístico (sem DISABLE TRIGGER)
    try {
      for (const id of orderIds) {
        await a.from("accounts_receivable_installments").delete().in("accounts_receivable_id",
          ((await a.from("accounts_receivable").select("id").eq("partner_order_id", id)).data ?? []).map((r: { id: string }) => r.id));
        await a.from("accounts_receivable").delete().eq("partner_order_id", id);
        await a.from("partner_order_payment_schedule").delete().eq("partner_order_id", id);
        await a.from("partner_order_payment_terms").delete().eq("partner_order_id", id);
        await a.from("partner_order_items").delete().eq("partner_order_id", id);
        await a.from("partner_order_audit_logs").delete().eq("partner_order_id", id);
        await a.from("partner_orders").delete().eq("id", id);
      }
      for (const p of [partnerId, partnerBId]) {
        if (!p) continue;
        await a.from("partner_order_idempotency").delete().eq("partner_id", p);
        await a.from("partner_users").delete().eq("partner_id", p);
        await a.from("partner_accounts").delete().eq("id", p);
      }
      for (const u of createdUsers) {
        await a.from("user_roles").delete().eq("user_id", u);
        await a.from("profiles").delete().eq("user_id", u);
        await a.auth.admin.deleteUser(u);
      }
      const { count: leftOrders } = await a.from("partner_orders").select("id", { count: "exact", head: true })
        .ilike("observacoes", "HARNESS %");
      const { count: leftPartners } = await a.from("partner_accounts").select("id", { count: "exact", head: true })
        .ilike("razao_social", "HARNESS %");
      push("CLEANUP", (leftOrders ?? 0) === 0 && (leftPartners ?? 0) === 0,
        { pedidos_residuais: leftOrders, parceiros_residuais: leftPartners });
    } catch (e) {
      push("CLEANUP", false, (e as Error).message);
    }
  }

  const failed = out.filter((r) => r.status === "FAIL").length;
  return new Response(JSON.stringify({ veredito: failed === 0 ? "PASS" : "FAIL", falhas: failed, resultados: out }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
