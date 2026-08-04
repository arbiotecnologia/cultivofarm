// Módulo Movimentações — harness de homologação runtime (staging ikaauvsflpmamgxmkhoq).
// Cria usuários efêmeros reais, executa o motor canônico com sessões autenticadas
// (inclusive concorrência real) e remove 100% dos resíduos ao final.
// Protegido por segredo interno; nunca deve ser chamado pelo app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

type Status = "PASS" | "FAIL" | "SKIP";
type Result = { id: string; name: string; status: Status; evidence: unknown };
const results: Result[] = [];
const check = (id: string, name: string, cond: boolean, evidence: unknown) =>
  results.push({ id, name, status: cond ? "PASS" : "FAIL", evidence });

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const RUN = crypto.randomUUID().slice(0, 8);
const PWD = `Mov-${crypto.randomUUID()}`;

type Perfil = "admin" | "producao" | "administrativo" | "produtor";
const ROLES: Record<Perfil, string[]> = {
  admin: ["administrador"],
  producao: ["producao"],
  administrativo: ["administrativo"],
  produtor: ["cliente_produtor"],
};

const users: Partial<Record<Perfil, string>> = {};
const cli: Partial<Record<Perfil, ReturnType<typeof createClient>>> = {};
const created = {
  users: [] as string[],
  produtos: [] as string[],
  lotes: [] as string[],
  itens: [] as string[],
  microrganismos: [] as string[],
  clientes: [] as string[],
};


async function op(c: any, acao: string, item: string, qtd: number | null, key: string, payload: unknown = {}) {
  const { data, error } = await c.rpc("rpc_estoque_operar_v1", {
    p_acao: acao, p_item_id: item, p_quantidade: qtd,
    p_idempotency_key: key, p_payload: payload,
  });
  return { data, msg: error?.message ?? null };
}

async function setup() {
  for (const p of Object.keys(ROLES) as Perfil[]) {
    const email = `hml.mov.${p}.${RUN}@arbio.test`;
    const { data, error } = await svc.auth.admin.createUser({
      email, password: PWD, email_confirm: true, user_metadata: { nome: `HML MOV ${p}` },
    });
    if (error) throw new Error(`user ${p}: ${error.message}`);
    users[p] = data.user!.id;
    created.users.push(data.user!.id);
    await svc.from("user_roles").delete().eq("user_id", data.user!.id);
    for (const r of ROLES[p]) {
      const { error: re } = await svc.from("user_roles").insert({ user_id: data.user!.id, role: r });
      if (re) throw new Error(`role ${p}/${r}: ${re.message}`);
    }
    const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error: se } = await c.auth.signInWithPassword({ email, password: PWD });
    if (se) throw new Error(`signin ${p}: ${se.message}`);
    cli[p] = c;
  }

  const { data: micro, error: me } = await svc.from("microrganismos")
    .insert({ nome: `HML MOV ${RUN}`, tipo: "bacteria" }).select("id").single();
  if (me) throw new Error(`microrganismo: ${me.message}`);
  created.microrganismos.push(micro.id);

  const { data: prod, error: pe } = await svc.from("produtos")
    .insert({ nome: `HML MOV Produto ${RUN}`, tipo: "inoculante", microrganismo_id: micro.id })
    .select("id").single();
  if (pe) throw new Error(`produto: ${pe.message}`);
  created.produtos.push(prod.id);

  const { data: lote, error: le } = await svc.from("lotes")
    .insert({ codigo: `HMLMOV-${RUN}`, microrganismo_id: micro.id, volume_litros: 1000, status: "aprovado" })
    .select("id").single();
  if (le) throw new Error(`lote: ${le.message}`);
  created.lotes.push(lote.id);

  const itens: string[] = [];
  for (let i = 0; i < 3; i++) {
    const { data, error } = await svc.from("estoque_produto").insert({
      produto_id: prod.id, lote_id: lote.id, microrganismo_id: micro.id,
      quantidade: 100, volume_total: 100, status: "disponivel",
      validade: new Date(Date.now() + 86400000 * 180).toISOString().slice(0, 10),
    }).select("id").single();
    if (error) throw new Error(`estoque_produto: ${error.message}`);
    itens.push(data.id);
    created.itens.push(data.id);
  }
  return itens;
}

async function movsDo(item: string) {
  const { data } = await svc.from("estoque_movimentacoes")
    .select("*").eq("estoque_produto_id", item).order("created_at", { ascending: true });
  return (data ?? []) as any[];
}

async function run() {
  const [I1, I2, I3] = await setup();
  const admin = cli.admin!, producao = cli.producao!, produtor = cli.produtor!;

  // A — reserva pelo motor grava snapshot completo
  const kA = `hml-${RUN}-reserva-A`;
  const A = await op(admin, "reserva", I1, 30, kA, { origem: "harness", referencia_tipo: "manual" });
  const mA = await movsDo(I1);
  check("A", "Reserva via motor grava lançamento com snapshot", 
    !A.msg && mA.length === 1 && Number(mA[0].saldo_anterior) === 100 &&
    Number(mA[0].reservado_posterior) === 30 && mA[0].idempotency_key === kA &&
    !!mA[0].request_fingerprint && mA[0].origem === "harness",
    { err: A.msg, mov: mA[0] });

  // B — replay idempotente: mesma chave + mesmo payload
  const B = await op(admin, "reserva", I1, 30, kA, { origem: "harness", referencia_tipo: "manual" });
  const mB = await movsDo(I1);
  check("B", "Replay com mesma chave não duplica lançamento",
    !B.msg && (B.data as any)?.replay === true && mB.length === 1, { err: B.msg, data: B.data, total: mB.length });

  // C — mesma chave com payload divergente é rejeitada
  const C = await op(admin, "reserva", I1, 55, kA, { origem: "harness", referencia_tipo: "manual" });
  check("C", "Chave reutilizada com payload divergente é rejeitada",
    !!C.msg && C.msg.includes("ESTQ_IDEMPOTENCY_CONFLITO"), { err: C.msg });

  // D — UPDATE direto em estoque_produto bloqueado mesmo para admin autenticado
  const { error: dErr } = await admin.from("estoque_produto")
    .update({ status: "expedido" }).eq("id", I1);
  check("D", "UPDATE direto em estoque_produto é bloqueado",
    !!dErr && /ESTQ_UPDATE_DIRETO_BLOQUEADO|permission|row-level/i.test(dErr.message), { err: dErr?.message });

  // E — livro append-only: UPDATE e DELETE bloqueados
  const { error: eU } = await admin.from("estoque_movimentacoes").update({ motivo: "hack" }).eq("id", mA[0].id);
  const { error: eD } = await admin.from("estoque_movimentacoes").delete().eq("id", mA[0].id);
  const mE = await movsDo(I1);
  check("E", "Livro de movimentações é append-only (sem UPDATE/DELETE)",
    !!eU && !!eD && mE.length === 1 && mE[0].motivo !== "hack",
    { update: eU?.message, delete: eD?.message, total: mE.length });

  // F — expedição encadeia saldos (posterior de N = anterior de N+1)
  const F = await op(admin, "expedicao", I1, 30, `hml-${RUN}-exped-F`, { origem: "harness", referencia_tipo: "entrega" });
  const mF = await movsDo(I1);
  const encadeado = mF.length === 2 &&
    Number(mF[0].saldo_posterior) === Number(mF[1].saldo_anterior) &&
    Number(mF[0].reservado_posterior) === Number(mF[1].reservado_anterior);
  check("F", "Expedição encadeia saldo anterior/posterior sem furo",
    !F.msg && encadeado && mF[1].status_novo === "expedido",
    { err: F.msg, cadeia: mF.map((m) => ({ acao: m.acao, ant: m.saldo_anterior, pos: m.saldo_posterior })) });

  // G — estorno vinculado à origem, e estorno duplicado bloqueado
  const movExp = mF[1];
  const G1 = await op(admin, "estorno_expedicao", I1, null, `hml-${RUN}-estorno-G`, {
    origem: "harness", movimentacao_origem_id: movExp.id, motivo: "cancelamento de entrega HML",
  });
  const G2 = await op(admin, "estorno_expedicao", I1, null, `hml-${RUN}-estorno-G2`, {
    origem: "harness", movimentacao_origem_id: movExp.id, motivo: "tentativa duplicada",
  });
  const mG = await movsDo(I1);
  const estorno = mG.find((m) => m.acao === "estorno_expedicao");
  check("G", "Estorno vinculado à origem e sem duplicidade",
    !G1.msg && !!estorno && estorno.movimentacao_origem_id === movExp.id &&
    !!G2.msg && G2.msg.includes("ESTQ_ESTORNO_DUPLICADO") &&
    Number(estorno.saldo_posterior) === Number(movExp.saldo_anterior),
    { g1: G1.msg, g2: G2.msg, estorno_origem: estorno?.movimentacao_origem_id });

  // H — concorrência real: duas sessões reservam ao mesmo tempo o saldo total
  const [H1, H2] = await Promise.all([
    op(admin, "reserva", I2, 80, `hml-${RUN}-conc-1`, { origem: "harness" }),
    op(producao, "reserva", I2, 80, `hml-${RUN}-conc-2`, { origem: "harness" }),
  ]);
  const { data: itemH } = await svc.from("estoque_produto")
    .select("quantidade, quantidade_reservada, status").eq("id", I2).single();
  const okH = ((!H1.msg ? 1 : 0) + (!H2.msg ? 1 : 0)) === 1 &&
    Number(itemH!.quantidade_reservada) === 80 &&
    Number(itemH!.quantidade_reservada) <= Number(itemH!.quantidade);
  check("H", "Concorrência real: apenas uma reserva vence, sem saldo negativo",
    okH, { h1: H1.msg, h2: H2.msg, item: itemH });

  // I — perfil sem permissão operacional é barrado
  const I = await op(produtor, "reserva", I3, 10, `hml-${RUN}-perm-I`, { origem: "harness" });
  check("I", "Perfil produtor não pode operar estoque",
    !!I.msg && /ESTQ_SEM_PERMISSAO|permission/i.test(I.msg), { err: I.msg });

  // J — anônimo não executa o motor
  const J = await op(anon, "reserva", I3, 10, `hml-${RUN}-anon-J`, { origem: "harness" });
  check("J", "Anônimo não executa o motor canônico", !!J.msg, { err: J.msg });

  // K — ajuste acima do limite exige aprovação (perfil sem alçada)
  const K = await op(cli.administrativo!, "perda", I3, 95, `hml-${RUN}-limite-K`, {
    origem: "harness", motivo: "perda acima do limite",
  });
  check("K", "Redução acima do limite exige aprovação",
    !!K.msg && /ESTQ_APROVACAO_REQUERIDA|ESTQ_SEM_PERMISSAO/.test(K.msg), { err: K.msg });

  // L — perda com motivo dentro do limite: saldo e trilha coerentes
  const L = await op(admin, "perda", I3, 5, `hml-${RUN}-perda-L`, { origem: "harness", motivo: "quebra de frasco" });
  const mL = (await movsDo(I3)).filter((m) => m.acao === "perda");
  const { data: itemL } = await svc.from("estoque_produto").select("quantidade").eq("id", I3).single();
  check("L", "Perda registra motivo, direção e saldo coerente",
    !L.msg && mL.length === 1 && Number(mL[0].saldo_anterior) === 100 &&
    Number(mL[0].saldo_posterior) === 95 && Number(itemL!.quantidade) === 95 && !!mL[0].motivo,
    { err: L.msg, mov: mL[0], saldo: itemL });

  // M — motivo obrigatório em perda/ajuste/descarte
  const M = await op(admin, "descarte", I3, 1, `hml-${RUN}-motivo-M`, { origem: "harness" });
  check("M", "Motivo é obrigatório em perda/ajuste/descarte",
    !!M.msg && M.msg.includes("ESTQ_MOTIVO_OBRIGATORIO"), { err: M.msg });

  // N — devolução não reintegrável não devolve saldo comercial, mas deixa trilha
  const { data: antesN } = await svc.from("estoque_produto").select("quantidade").eq("id", I3).single();
  const N = await op(admin, "devolucao", I3, 3, `hml-${RUN}-devol-N`, {
    origem: "harness", classificacao: "quarentena", motivo: "retorno de campo sem laudo",
  });
  const { data: depoisN } = await svc.from("estoque_produto").select("quantidade").eq("id", I3).single();
  const mN = (await movsDo(I3)).filter((m) => m.acao === "devolucao");
  check("N", "Devolução em quarentena não reintegra saldo comercial",
    !N.msg && mN.length === 1 && Number(antesN!.quantidade) === Number(depoisN!.quantidade) &&
    mN[0].metadata?.reintegrado === false,
    { err: N.msg, antes: antesN, depois: depoisN, mov: mN[0]?.metadata });

  // O — toda movimentação tem autoria, unidade e direção preenchidas
  const todas = [...(await movsDo(I1)), ...(await movsDo(I2)), ...(await movsDo(I3))];
  const completas = todas.filter((m) => m.usuario_id && m.unidade && m.direcao && m.origem);
  check("O", "Trilha completa: autoria, unidade, direção e origem em 100% dos lançamentos",
    todas.length > 0 && completas.length === todas.length,
    { total: todas.length, completas: completas.length });

  // P — ação inválida rejeitada pelo motor
  const P = await op(admin, "teleporte", I3, 1, `hml-${RUN}-acao-P`, { origem: "harness" });
  check("P", "Ação fora da taxonomia canônica é rejeitada",
    !!P.msg && P.msg.includes("ESTQ_ACAO_INVALIDA"), { err: P.msg });
}

async function cleanup() {
  for (const id of created.itens) {
    await svc.from("estoque_movimentacoes").delete().eq("estoque_produto_id", id);
    await svc.from("estoque_produto").delete().eq("id", id);
  }
  for (const id of created.lotes) await svc.from("lotes").delete().eq("id", id);
  for (const id of created.produtos) await svc.from("produtos").delete().eq("id", id);
  for (const id of created.microrganismos) await svc.from("microrganismos").delete().eq("id", id);
  for (const id of created.users) {
    await svc.from("user_roles").delete().eq("user_id", id);
    await svc.auth.admin.deleteUser(id);
  }
  const residuos: Record<string, number> = {};
  const { count: cItens } = await svc.from("estoque_produto")
    .select("id", { count: "exact", head: true }).in("id", created.itens.length ? created.itens : [crypto.randomUUID()]);
  residuos.estoque_produto = cItens ?? 0;
  const { count: cLotes } = await svc.from("lotes")
    .select("id", { count: "exact", head: true }).like("codigo", `HMLMOV-${RUN}%`);
  residuos.lotes = cLotes ?? 0;
  const { count: cProd } = await svc.from("produtos")
    .select("id", { count: "exact", head: true }).like("nome", `%HML MOV%${RUN}%`);
  residuos.produtos = cProd ?? 0;
  return residuos;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!INTERNAL_SECRET || req.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  let fatal: string | null = null;
  try {
    await run();
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e);
  }
  let residuos: Record<string, number> = {};
  try {
    residuos = await cleanup();
  } catch (e) {
    fatal = `${fatal ?? ""} | cleanup: ${e instanceof Error ? e.message : String(e)}`;
  }
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const limpo = Object.values(residuos).every((v) => v === 0);
  return new Response(JSON.stringify({
    run: RUN,
    gate: fail === 0 && !fatal && limpo ? "PASS" : "FAIL",
    total: results.length, pass, fail, fatal, residuos, results,
  }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
