// Harness de homologação runtime do módulo ENTREGA (ciclo 5) — staging apenas.
// Cria fixtures e usuários efêmeros reais, executa os gates A–P e remove tudo ao final.
// Protegido por segredo interno; nunca é chamado pelo app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isCanonicalSupabaseUrl } from "../_shared/fiscal/canonicalProject.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

const PREFIX = "TESTE_ENTREGA_E2E_";
const RUN = crypto.randomUUID().slice(0, 8);
const PWD = `Entrega-E2E-${crypto.randomUUID()}`;

type Result = { id: string; name: string; status: "PASS" | "FAIL"; evidence: unknown };
const results: Result[] = [];
const check = (id: string, name: string, cond: boolean, evidence: unknown) =>
  results.push({ id, name, status: cond ? "PASS" : "FAIL", evidence });

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

type Profile = "admin" | "entrega" | "financeiro" | "sem_papel";
const ROLES: Record<Profile, string[]> = {
  admin: ["administrador"],
  entrega: ["producao"],
  financeiro: ["financeiro"],
  sem_papel: [],
};

const clients: Partial<Record<Profile, any>> = {};
const tokens: Partial<Record<Profile, string>> = {};
const created = {
  users: [] as string[],
  clientes: [] as string[],
  produtos: [] as string[],
  lotes: [] as string[],
  embalagens: [] as string[],
  etiquetas: [] as string[],
  entregas: [] as string[],
  estoques: [] as string[],
  categorias: [] as string[],
};

async function rpc(c: any, fn: string, args: Record<string, unknown>) {
  const { data, error } = await c.rpc(fn, args);
  return { data, msg: error?.message ?? null, code: error?.code ?? null };
}

async function pdfCall(token: string | null, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/entrega-termo-pdf`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j as Record<string, unknown> };
}

// ---------------------------------------------------------------- setup
async function setup() {
  for (const p of Object.keys(ROLES) as Profile[]) {
    const email = `entrega-e2e-${p}-${RUN}@arbio-staging.test`;
    const { data, error } = await svc.auth.admin.createUser({
      email, password: PWD, email_confirm: true,
      user_metadata: { nome: `${PREFIX}${p}` },
    });
    if (error) throw new Error(`createUser ${p}: ${error.message}`);
    const uid = data.user!.id;
    created.users.push(uid);
    await svc.from("user_roles").delete().eq("user_id", uid);
    for (const r of ROLES[p]) {
      const { error: re } = await svc.from("user_roles").insert({ user_id: uid, role: r });
      if (re) throw new Error(`role ${p}: ${re.message}`);
    }
    const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: sd, error: se } = await c.auth.signInWithPassword({ email, password: PWD });
    if (se) throw new Error(`signIn ${p}: ${se.message}`);
    clients[p] = c;
    tokens[p] = sd.session!.access_token;
  }

  const { data: cli, error: ce } = await svc.from("clientes")
    .insert({ nome: `${PREFIX}CLI_${RUN}`, codigo_cliente: `${PREFIX}${RUN}` })
    .select("id").single();
  if (ce) throw new Error(`cliente: ${ce.message}`);
  created.clientes.push(cli.id);

  const { data: prod, error: pe } = await svc.from("produtos")
    .insert({ nome: `${PREFIX}PROD_${RUN}`, tipo: "inoculante" }).select("id").single();
  if (pe) throw new Error(`produto: ${pe.message}`);
  created.produtos.push(prod.id);

  const { data: lote, error: le } = await svc.from("lotes")
    .insert({ codigo_lote: `${PREFIX}LOT_${RUN}`, produto_id: prod.id }).select("id").single();
  if (le) throw new Error(`lote: ${le.message}`);
  created.lotes.push(lote.id);

  const { data: est, error: se2 } = await svc.from("estoque_produto").insert({
    produto_id: prod.id, lote_id: lote.id, quantidade: 1000, quantidade_reservada: 1000,
    volume_total: 5000, status: "reservado",
  }).select("id").single();
  if (se2) throw new Error(`estoque_produto: ${se2.message}`);
  created.estoques.push(est.id);

  return {
    clienteId: cli.id as string, produtoId: prod.id as string,
    loteId: lote.id as string, estoqueId: est.id as string,
  };
}

type Fixture = { entregaId: string; etiquetas: string[]; embalagens: string[] };
type Base = { clienteId: string; produtoId: string; loteId: string; estoqueId: string };

/** Cria uma entrega separada com N embalagens/etiquetas liberadas por CQ. */
async function criarEntrega(base: Base, n: number, tag: string): Promise<Fixture> {
  const { data: ent, error: ee } = await svc.from("entregas").insert({
    cliente_id: base.clienteId, produto_id: base.produtoId, lote_id: base.loteId,
    estoque_produto_id: base.estoqueId, quantidade_entregue: 0,
    status: "separado", tipo_entrega: "motorista", assinatura_obrigatoria: true,
    comprovante_status: "pendente", financial_status: "PENDING_BILLING",
    observacoes_confirmacao: `${PREFIX}${tag}`,
  }).select("id").single();
  if (ee) throw new Error(`entrega ${tag}: ${ee.message}`);
  created.entregas.push(ent.id);


  const etiquetas: string[] = [];
  const embalagens: string[] = [];
  for (let i = 0; i < n; i++) {
    const { data: emb, error: be } = await svc.from("estoque_embalagens").insert({
      codigo_embalagem: `${PREFIX}${tag}_EMB${i}_${RUN}`,
      lote_id: base.loteId, produto_id: base.produtoId, volume: 5, unidade: "L",
      quantidade: 1, tipo_embalagem: "bombona_5L", status: "separado",
      cliente_id: base.clienteId,
    }).select("id").single();
    if (be) throw new Error(`embalagem: ${be.message}`);
    embalagens.push(emb.id);
    created.embalagens.push(emb.id);

    const { data: etq, error: qe } = await svc.from("produto_etiquetas").insert({
      codigo_etiqueta: `${PREFIX}${tag}_ETQ${i}_${RUN}`,
      tipo_etiqueta: "principal", status: "impressa",
      lote_id: base.loteId, produto_id: base.produtoId, embalagem_id: emb.id,
      produto_nome: `${PREFIX}PROD_${RUN}`, lote_codigo: `${PREFIX}LOT_${RUN}`,
      volume: 5, unidade: "L", cq_liberado: true, cliente_id: base.clienteId,
      validade_em: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10),
    }).select("id").single();
    if (qe) throw new Error(`etiqueta: ${qe.message}`);
    etiquetas.push(etq.id);
    created.etiquetas.push(etq.id);

    const { error: ve } = await svc.from("entrega_etiquetas")
      .insert({ entrega_id: ent.id, etiqueta_id: etq.id, ativo: true });
    if (ve) throw new Error(`vinculo: ${ve.message}`);
  }
  return { entregaId: ent.id, etiquetas, embalagens };
}

// ---------------------------------------------------------------- cleanup
async function cleanup() {
  const errs: Record<string, string> = {};
  const del = async (t: string, col: string, vals: string[]) => {
    if (!vals.length) return;
    const { error } = await svc.from(t).delete().in(col, vals);
    if (error) errs[`${t}.${col}`] = error.message;
  };
  // entregas derivadas (reentregas)
  const { data: reent } = await svc.from("entregas").select("id").in("reentrega_origem_id", created.entregas);
  const todasEntregas = [...new Set([...created.entregas, ...((reent ?? []).map((r: any) => r.id))])];

  // storage dos termos
  const { data: termos } = await svc.from("entrega_termos").select("id,pdf_path").in("entrega_id", todasEntregas);
  const paths = (termos ?? []).map((t: any) => t.pdf_path).filter(Boolean);
  if (paths.length) {
    const { error } = await svc.storage.from("entrega-termos").remove(paths);
    if (error) errs["storage"] = error.message;
  }

  await del("accounts_receivable_installments", "receivable_id",
    ((await svc.from("accounts_receivable").select("id").in("origin_id", todasEntregas)).data ?? []).map((r: any) => r.id));
  await del("accounts_receivable", "origin_id", todasEntregas);
  await del("financial_audit_log", "entity_id", todasEntregas);
  // reconciliações/termos são imutáveis por trigger: a remoção usa função dedicada de purga,
  // restrita a service_role e ao prefixo de fixture de homologação.

  const { error: recErr } = await svc.rpc("rpc_harness_purge_entregas_v1", { p_entrega_ids: todasEntregas });
  if (recErr) errs["purge"] = recErr.message;

  await del("estoque_embalagem_movimentacoes", "entrega_id", todasEntregas);
  await del("produto_etiquetas", "id", created.etiquetas);
  await del("estoque_embalagens", "id", created.embalagens);
  await del("estoque_produto", "id", created.estoques);
  await del("lotes", "id", created.lotes);
  await del("produtos", "id", created.produtos);
  await del("clientes", "id", created.clientes);
  await del("financial_categories", "id", created.categorias);
  for (const uid of created.users) {
    await svc.from("user_roles").delete().eq("user_id", uid);
    const { error } = await svc.auth.admin.deleteUser(uid);
    if (error) errs[`user.${uid.slice(0, 6)}`] = error.message;
  }

  // verificação de resíduo
  const { count: cEnt } = await svc.from("entregas").select("id", { count: "exact", head: true })
    .in("id", todasEntregas);
  const { count: cEtq } = await svc.from("produto_etiquetas").select("id", { count: "exact", head: true })
    .like("codigo_etiqueta", `${PREFIX}%`);
  return { errs, residuo: { entregas: cEnt ?? 0, etiquetas: cEtq ?? 0 } };
}

// ---------------------------------------------------------------- gates
async function run() {
  const base = await setup();
  check("A", "setup: usuarios efemeros + fixtures criados",
    created.users.length === 4 && created.clientes.length === 1,
    { usuarios: created.users.length, run: RUN });

  const adm = clients.admin;
  const ent = clients.entrega;
  const fin = clients.financeiro;
  const nada = clients.sem_papel;

  // ---- B: deny-by-default anônimo
  const bRpc = await rpc(anonClient, "rpc_entrega_reconciliar_v1", { p_entrega_id: created.clientes[0], p_idempotency_key: "x" });
  const bPdf = await pdfCall(null, { termo_id: crypto.randomUUID() });
  check("B", "anon nao acessa RPC de reconciliacao nem PDF",
    bRpc.msg !== null && bPdf.status === 401, { rpc: bRpc.msg?.slice(0, 60), pdf: bPdf.status });

  // ---- fixture parcial (3 itens)
  const f1 = await criarEntrega(base, 3, "P1");

  // ---- C: usuário sem papel
  const cRes = await rpc(nada, "rpc_entrega_registrar_conferencia_v1",
    { p_entrega_id: f1.entregaId, p_itens: [{ etiqueta_id: f1.etiquetas[0], status: "aceito" }] });
  check("C", "usuario sem papel bloqueado na conferencia",
    (cRes.msg ?? "").includes("sem_permissao"), { msg: cRes.msg });

  // ---- D: conferência com aceito/recusado/pendente
  const dRes = await rpc(ent, "rpc_entrega_registrar_conferencia_v1", {
    p_entrega_id: f1.entregaId,
    p_itens: [
      { etiqueta_id: f1.etiquetas[0], status: "aceito", quantidade: 1 },
      { etiqueta_id: f1.etiquetas[1], status: "recusado", quantidade: 1, motivo: "embalagem avariada no transporte" },
      { etiqueta_id: f1.etiquetas[2], status: "pendente", quantidade: 1 },
    ],
  });
  check("D", "conferencia registra 3 itens e cobertura pendente",
    dRes.msg === null && (dRes.data as any)?.itens === 3 && (dRes.data as any)?.cobertura === "pendente",
    { msg: dRes.msg, data: dRes.data });

  // resolve o pendente -> aceito (o gate E roda adiante, já com termo assinado)
  await rpc(ent, "rpc_entrega_registrar_conferencia_v1", {
    p_entrega_id: f1.entregaId,
    p_itens: [{ etiqueta_id: f1.etiquetas[2], status: "aceito", quantidade: 1 }],
  });

  // ---- F: reconciliar sem termo assinado
  const fRes = await rpc(ent, "rpc_entrega_reconciliar_v1", { p_entrega_id: f1.entregaId, p_idempotency_key: `F-${RUN}` });
  check("F", "reconciliacao exige termo assinado",
    (fRes.msg ?? "").includes("termo_nao_assinado"), { msg: fRes.msg });

  // ---- G: gerar + assinar termo (com replay idempotente)
  const g1 = await rpc(ent, "rpc_entrega_gerar_termo_v1", { p_entrega_id: f1.entregaId, p_template_versao: "termo-entrega-v1" });
  const termoId = (g1.data as any)?.termo_id as string;
  const idemAssin = `SIGN-${RUN}`;
  const payloadAssin = {
    recebedor_nome: "Recebedor Homologacao",
    recebedor_documento: "000.000.000-00",
    assinatura_tipo: "digital_tela",
    assinatura_hash: "a".repeat(64),
    origem: "harness",
  };
  const g2 = await rpc(ent, "rpc_entrega_assinar_termo_v1", { p_termo_id: termoId, p_payload: payloadAssin, p_idempotency_key: idemAssin });
  const g3 = await rpc(ent, "rpc_entrega_assinar_termo_v1", { p_termo_id: termoId, p_payload: payloadAssin, p_idempotency_key: idemAssin });
  check("G", "termo gerado, assinado e replay idempotente",
    g1.msg === null && g2.msg === null && (g2.data as any)?.replay === false &&
    g3.msg === null && (g3.data as any)?.replay === true,
    { g1: g1.msg, g2: g2.msg, g3: g3.msg, cobertura: (g1.data as any)?.cobertura, replay: (g3.data as any)?.replay });

  // ---- E: com termo assinado, item pendente ainda bloqueia a reconciliacao
  await rpc(ent, "rpc_entrega_registrar_conferencia_v1", {
    p_entrega_id: f1.entregaId,
    p_itens: [{ etiqueta_id: f1.etiquetas[2], status: "pendente", quantidade: 1 }],
  });
  const eRes = await rpc(ent, "rpc_entrega_reconciliar_v1", { p_entrega_id: f1.entregaId, p_idempotency_key: `E-${RUN}` });
  check("E", "reconciliacao bloqueada com item pendente (termo ja assinado)",
    (eRes.msg ?? "").includes("conferencia_pendente"), { msg: eRes.msg });
  await rpc(ent, "rpc_entrega_registrar_conferencia_v1", {
    p_entrega_id: f1.entregaId,
    p_itens: [{ etiqueta_id: f1.etiquetas[2], status: "aceito", quantidade: 1 }],
  });

  // ---- H: reconciliação parcial — baixa dos aceitos, estorno dos recusados
  const hRes = await rpc(ent, "rpc_entrega_reconciliar_v1", { p_entrega_id: f1.entregaId, p_idempotency_key: `H-${RUN}` });
  const { data: embStatus } = await svc.from("estoque_embalagens")
    .select("id,status,entrega_id").in("id", f1.embalagens);
  const entregues = (embStatus ?? []).filter((e: any) => e.status === "entregue").length;
  const estornadas = (embStatus ?? []).filter((e: any) => e.status === "em_estoque" && e.entrega_id === null).length;
  const { data: movs } = await svc.from("estoque_embalagem_movimentacoes")
    .select("tipo_movimentacao").eq("entrega_id", f1.entregaId);
  const movEntrega = (movs ?? []).filter((m: any) => m.tipo_movimentacao === "entrega_confirmada").length;
  const movEstorno = (movs ?? []).filter((m: any) => m.tipo_movimentacao === "estorno_recusa").length;
  check("H", "baixa somente dos aceitos e estorno auditado dos recusados",
    hRes.msg === null && (hRes.data as any)?.itens_aceitos === 2 && (hRes.data as any)?.itens_recusados === 1 &&
    entregues === 2 && estornadas === 1 && movEntrega === 2 && movEstorno === 1,
    { rpc: hRes.data, entregues, estornadas, movEntrega, movEstorno, msg: hRes.msg });

  // ---- I: replay e chave divergente
  const i1 = await rpc(ent, "rpc_entrega_reconciliar_v1", { p_entrega_id: f1.entregaId, p_idempotency_key: `H-${RUN}` });
  const i2 = await rpc(ent, "rpc_entrega_reconciliar_v1", { p_entrega_id: f1.entregaId, p_idempotency_key: `OUTRA-${RUN}` });
  check("I", "replay idempotente e chave divergente rejeitada",
    i1.msg === null && (i1.data as any)?.replay === true && (i2.msg ?? "").includes("entrega_ja_reconciliada"),
    { replay: (i1.data as any)?.replay, divergente: i2.msg });

  // ---- J: concorrência real — exatamente uma reconciliação
  const f2 = await criarEntrega(base, 2, "P2");
  await rpc(ent, "rpc_entrega_registrar_conferencia_v1", {
    p_entrega_id: f2.entregaId,
    p_itens: f2.etiquetas.map((e) => ({ etiqueta_id: e, status: "aceito", quantidade: 1 })),
  });
  const gt2 = await rpc(ent, "rpc_entrega_gerar_termo_v1", { p_entrega_id: f2.entregaId, p_template_versao: "termo-entrega-v1" });
  const termo2 = (gt2.data as any)?.termo_id as string;
  await rpc(ent, "rpc_entrega_assinar_termo_v1", { p_termo_id: termo2, p_payload: payloadAssin, p_idempotency_key: `SIGN2-${RUN}` });
  const conc = await Promise.all([
    rpc(ent, "rpc_entrega_reconciliar_v1", { p_entrega_id: f2.entregaId, p_idempotency_key: `J1-${RUN}` }),
    rpc(adm, "rpc_entrega_reconciliar_v1", { p_entrega_id: f2.entregaId, p_idempotency_key: `J2-${RUN}` }),
  ]);
  const { count: nRec } = await svc.from("entrega_reconciliacoes")
    .select("id", { count: "exact", head: true }).eq("entrega_id", f2.entregaId).eq("status", "reconciliada");
  const okConc = conc.filter((r) => r.msg === null).length;
  check("J", "concorrencia real gera exatamente 1 reconciliacao",
    nRec === 1 && okConc === 1, { reconciliacoes: nRec, sucessos: okConc, erros: conc.map((c) => c.msg?.slice(0, 40)) });

  // ---- K: estado financeiro/operacional da entrega parcial
  const { data: e1 } = await svc.from("entregas")
    .select("status,financial_status,quantidade_entregue,entregue_em").eq("id", f1.entregaId).single();
  check("K", "entrega parcial marcada entregue/PENDING_BILLING com quantidade dos aceitos",
    e1?.status === "entregue" && e1?.financial_status === "PENDING_BILLING" && Number(e1?.quantidade_entregue) === 2,
    e1);

  // ---- L: faturamento sem reconciliação é bloqueado
  const { data: cat } = await svc.from("financial_categories")
    .insert({ name: `${PREFIX}CAT_${RUN}`, type: "RECEITA" }).select("id").maybeSingle();
  if (cat?.id) created.categorias.push(cat.id);
  const catId = cat?.id ??
    ((await svc.from("financial_categories").select("id").limit(1)).data ?? [])[0]?.id;

  const f3 = await criarEntrega(base, 1, "P3");
  await rpc(ent, "rpc_entrega_registrar_conferencia_v1", {
    p_entrega_id: f3.entregaId, p_itens: [{ etiqueta_id: f3.etiquetas[0], status: "aceito", quantidade: 1 }],
  });
  await svc.from("entregas").update({ status: "entregue" }).eq("id", f3.entregaId);
  const lRes = await rpc(fin, "fn_generate_receivable_from_entrega", {
    _entrega_id: f3.entregaId,
    _payload: { total_amount: 100, installment_count: 1, category_id: catId },
  });
  check("L", "faturamento bloqueado sem reconciliacao",
    (lRes.msg ?? "").includes("entrega_nao_reconciliada"), { msg: lRes.msg });

  // ---- M: recusa total -> NOT_BILLABLE e faturamento bloqueado
  const f4 = await criarEntrega(base, 2, "P4");
  await rpc(ent, "rpc_entrega_registrar_conferencia_v1", {
    p_entrega_id: f4.entregaId,
    p_itens: f4.etiquetas.map((e) => ({ etiqueta_id: e, status: "recusado", quantidade: 1, motivo: "produto fora da especificacao" })),
  });
  const gt4 = await rpc(ent, "rpc_entrega_gerar_termo_v1", { p_entrega_id: f4.entregaId, p_template_versao: "termo-entrega-v1" });
  await rpc(ent, "rpc_entrega_assinar_termo_v1", {
    p_termo_id: (gt4.data as any)?.termo_id, p_payload: payloadAssin, p_idempotency_key: `SIGN4-${RUN}`,
  });
  const m1 = await rpc(ent, "rpc_entrega_reconciliar_v1", { p_entrega_id: f4.entregaId, p_idempotency_key: `M-${RUN}` });
  const { data: e4 } = await svc.from("entregas")
    .select("financial_status,not_billable_reason").eq("id", f4.entregaId).single();
  const m2 = await rpc(fin, "fn_generate_receivable_from_entrega", {
    _entrega_id: f4.entregaId, _payload: { total_amount: 100, installment_count: 1, category_id: catId },
  });
  check("M", "recusa total gera NOT_BILLABLE e impede faturamento",
    m1.msg === null && (m1.data as any)?.faturavel === false &&
    e4?.financial_status === "NOT_BILLABLE" && (m2.msg ?? "").length > 0,
    { rec: m1.data, entrega: e4, faturamento: m2.msg?.slice(0, 80) });

  // ---- N: reentrega do saldo recusado
  const n1 = await rpc(ent, "rpc_entrega_reentrega_saldo_v1", { p_entrega_id: f1.entregaId, p_idempotency_key: `N-${RUN}` });
  const n2 = await rpc(ent, "rpc_entrega_reentrega_saldo_v1", { p_entrega_id: f1.entregaId, p_idempotency_key: `N-${RUN}` });
  const novaEntrega = (n1.data as any)?.entrega_id as string;
  const { count: nLinks } = await svc.from("entrega_etiquetas")
    .select("id", { count: "exact", head: true }).eq("entrega_id", novaEntrega).eq("ativo", true);
  check("N", "reentrega do saldo criada uma unica vez com os itens recusados",
    n1.msg === null && (n1.data as any)?.itens === 1 && nLinks === 1 &&
    n2.msg === null && (n2.data as any)?.replay === true && (n2.data as any)?.entrega_id === novaEntrega,
    { criada: (n1.data as any)?.itens, replay: (n2.data as any)?.replay, vinculos: nLinks });

  // ---- O: PDF privado — geração, replay e negativa anônima
  const o1 = await pdfCall(tokens.entrega!, { termo_id: termoId, action: "generate" });
  const o2 = await pdfCall(tokens.entrega!, { termo_id: termoId, action: "generate" });
  const o3 = await pdfCall(tokens.entrega!, { termo_id: termoId, action: "signed_url" });
  const o4 = await pdfCall(tokens.sem_papel!, { termo_id: termoId, action: "signed_url" });
  check("O", "PDF privado gerado, idempotente, com signed URL e negado a quem nao tem vinculo",
    o1.status === 200 && typeof (o1.body as any).pdf_hash === "string" &&
    o2.status === 200 && (o2.body as any).replay === true &&
    o3.status === 200 && typeof (o3.body as any).signed_url === "string" &&
    o4.status >= 400,
    {
      gerar: o1.status, replay: (o2.body as any)?.replay,
      signed: o3.status, sem_papel: o4.status,
      hash_len: String((o1.body as any)?.pdf_hash ?? "").length,
    });

  // ---- P: imutabilidade e RLS da reconciliação
  const { error: pUpd } = await ent.from("entrega_reconciliacoes")
    .update({ itens_aceitos: 99 }).eq("entrega_id", f1.entregaId);
  const { error: pDel } = await ent.from("entrega_reconciliacoes").delete().eq("entrega_id", f1.entregaId);
  const { error: pSvcUpd } = await svc.from("entrega_reconciliacoes")
    .update({ itens_aceitos: 99 }).eq("entrega_id", f1.entregaId);
  const { data: pSel } = await nada.from("entrega_reconciliacoes").select("id").eq("entrega_id", f1.entregaId);
  const { data: pFin } = await fin.from("entrega_reconciliacoes").select("id").eq("entrega_id", f1.entregaId);
  check("P", "reconciliacao imutavel; leitura restrita a entrega/financeiro",
    !!pUpd === false && (pSel ?? []).length === 0 && (pFin ?? []).length === 1 && !!pSvcUpd === true,
    {
      update_authenticated_afetou: !pUpd, delete_authenticated: pDel?.message?.slice(0, 40) ?? null,
      update_service_role_bloqueado: !!pSvcUpd, sem_papel_leu: (pSel ?? []).length, financeiro_leu: (pFin ?? []).length,
    });

  // ---- Evento de comunicação publicado pelo PDF
  const { count: nEv } = await svc.from("comunicacao_eventos")
    .select("id", { count: "exact", head: true }).eq("source_id", termoId);
  check("Q", "evento de comunicacao publicado por referencia (1 por termo/versao)",
    (nEv ?? 0) === 1, { eventos: nEv });

  return { f1, f2, f3, f4 };
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
      code: "ENTREGA_HARNESS_DISABLED_CANONICAL_TARGET",
    }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  // Acesso restrito: segredo interno OU chave de serviço (uso operacional interno).
  const secret = req.headers.get("x-internal-secret") ?? "";
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const okSecret = INTERNAL_SECRET.length > 0 && secret === INTERNAL_SECRET;
  const okService = SERVICE_KEY.length > 0 && bearer === SERVICE_KEY;
  if (!okSecret && !okService) {

    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let fatal: string | null = null;
  try {
    await run();
  } catch (e) {
    fatal = (e as Error).message;
  }
  let clean: unknown = null;
  try {
    clean = await cleanup();
  } catch (e) {
    clean = { fatal: (e as Error).message };
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  return new Response(JSON.stringify({
    run: RUN, fatal, total: results.length, passed,
    failed: results.filter((r) => r.status === "FAIL"),
    results, cleanup: clean,
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
