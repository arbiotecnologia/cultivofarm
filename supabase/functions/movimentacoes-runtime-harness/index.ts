// Módulo Movimentações — harness de homologação runtime (staging ikaauvsflpmamgxmkhoq).
// Cria fixtures reais (cliente, OS, microrganismo, produto, lote, CQ, envase, estoque),
// executa o motor canônico com sessões autenticadas reais (inclusive concorrência)
// e remove 100% dos resíduos ao final, respeitando FKs e sem DISABLE TRIGGER.
// Protegido por segredo interno; nunca deve ser chamado pelo app. Temporário: removido ao fim do ciclo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

type Status = "PASS" | "FAIL" | "NA";
type Result = { id: string; name: string; status: Status; evidence: unknown };
const results: Result[] = [];
const check = (id: string, name: string, cond: boolean, evidence: unknown) =>
  results.push({ id, name, status: cond ? "PASS" : "FAIL", evidence });
const na = (id: string, name: string, motivo: string) =>
  results.push({ id, name, status: "NA", evidence: { motivo } });

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const RUN = crypto.randomUUID().slice(0, 8);
const PWD = `Mov-${crypto.randomUUID()}`;
const MARKER = `HML MOV Produto ${RUN}`;

type Perfil = "admin" | "producao" | "administrativo" | "produtor";
const ROLES: Record<Perfil, string[]> = {
  admin: ["administrador"],
  producao: ["producao"],
  administrativo: ["administrativo"],
  produtor: ["cliente_produtor"],
};

const users: Partial<Record<Perfil, string>> = {};
const cli: Partial<Record<Perfil, any>> = {};
const created = {
  users: [] as string[],
  produtos: [] as string[],
  lotes: [] as string[],
  microrganismos: [] as string[],
  envases: [] as string[],
  clientes: [] as string[],
  ordens: [] as string[],
};
const perf: { op: string; ms: number }[] = [];

async function op(c: any, acao: string, item: string, qtd: number | null, key: string, payload: unknown = {}) {
  const t0 = performance.now();
  const { data, error } = await c.rpc("rpc_estoque_operar_v1", {
    p_acao: acao, p_item_id: item, p_quantidade: qtd,
    p_idempotency_key: key, p_payload: payload,
  });
  perf.push({ op: acao, ms: performance.now() - t0 });
  return { data: data as any, msg: error?.message ?? null };
}

// ---------------------------------------------------------------- fixtures
let clienteId = "";
let osId = "";

async function setup(): Promise<string[]> {
  const { data: cliente, error: ce } = await svc.from("clientes")
    .insert({ nome: `HML MOV Cliente ${RUN}`, codigo_cliente: `HMLMOV-${RUN}` })
    .select("id").single();
  if (ce) throw new Error(`cliente: ${ce.message}`);
  clienteId = cliente.id;
  created.clientes.push(cliente.id);

  for (const p of Object.keys(ROLES) as Perfil[]) {
    const email = `hml.mov.${p}.${RUN}@arbio.test`;
    const { data, error } = await svc.auth.admin.createUser({
      email, password: PWD, email_confirm: true, user_metadata: { nome: `HML MOV ${p}` },
    });
    if (error) throw new Error(`user ${p}: ${error.message}`);
    users[p] = data.user!.id;
    created.users.push(data.user!.id);
    await svc.from("user_roles").delete().eq("user_id", data.user!.id);
    if (p === "produtor") {
      await svc.from("profiles").update({ cliente_id: cliente.id }).eq("user_id", data.user!.id);
      const { error: uce } = await svc.from("user_clientes")
        .insert({ user_id: data.user!.id, cliente_id: cliente.id });
      if (uce) throw new Error(`user_clientes: ${uce.message}`);
    }
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
    .insert({ nome: MARKER, tipo: "inoculante" }).select("id").single();
  if (pe) throw new Error(`produto: ${pe.message}`);
  created.produtos.push(prod.id);

  // OS canônica exigida por reservar_estoque_item / validate_estoque_reserva
  const { data: os, error: ose } = await svc.from("ordens_servico").insert({
    numero_os: `HMLMOV-${RUN}`,
    cliente_id: cliente.id,
    produto_id: prod.id,
    tipo_item: "produto",
    origem: "agronomica",
    status: "aberta",
    prioridade: "media",
    volume_total_ml: 100000,
  }).select("id").single();
  if (ose) throw new Error(`ordens_servico: ${ose.message}`);
  osId = os.id;
  created.ordens.push(os.id);

  const { data: lote, error: le } = await svc.from("lotes")
    .insert({
      codigo_lote: `HMLMOV-${RUN}`, produto_id: prod.id, microrganismo_id: micro.id,
      volume_produzido: 100000, status: "aprovado",
    }).select("id").single();
  if (le) throw new Error(`lote: ${le.message}`);
  created.lotes.push(lote.id);

  const { error: cqe } = await svc.from("controle_qualidade")
    .insert({ lote_id: lote.id, resultado: "aprovado", ph: 6.8, contaminacao: false, aparencia: "conforme" });
  if (cqe) throw new Error(`cq: ${cqe.message}`);

  const itens: string[] = [];
  for (let i = 0; i < 5; i++) {
    const { data: env, error: ee } = await svc.from("envase")
      .insert({ lote_id: lote.id, tipo_embalagem: "bombona_20L", volume_por_unidade: 20, quantidade: 5 })
      .select("id").single();
    if (ee) throw new Error(`envase: ${ee.message}`);
    created.envases.push(env.id);

    const { data, error } = await svc.from("estoque_produto").insert({
      produto_id: prod.id, lote_id: lote.id, microrganismo_id: micro.id,
      quantidade: 100, volume_total: 100, status: "disponivel", envase_id: env.id,
      validade: new Date(Date.now() + 86400000 * 180).toISOString().slice(0, 10),
    }).select("id").single();
    if (error) throw new Error(`estoque_produto: ${error.message}`);
    itens.push(data.id);
  }
  return itens;
}

const RES = { os_id: "", cliente_id: "", os_tipo: "interna" as const };
const resPayload = (extra: Record<string, unknown> = {}) =>
  ({ origem: "harness", os_id: osId, cliente_id: clienteId, os_tipo: "interna", ...extra });

async function movsDo(item: string) {
  const { data } = await svc.from("estoque_movimentacoes")
    .select("*").eq("estoque_produto_id", item).order("created_at", { ascending: true });
  return (data ?? []) as any[];
}
async function movByKey(key: string) {
  const { data } = await svc.from("estoque_movimentacoes").select("*").eq("idempotency_key", key);
  return (data ?? []) as any[];
}
async function item(id: string) {
  const { data } = await svc.from("estoque_produto")
    .select("id, quantidade, quantidade_reservada, status, reservado_para_os_id, reservado_para_cliente_id")
    .eq("id", id).maybeSingle();
  return data as any;
}

// ---------------------------------------------------------------- gates
async function run() {
  const [I1, I2, I3, I4, I5] = await setup();
  const admin = cli.admin!, producao = cli.producao!, produtor = cli.produtor!;

  // A — reserva total pelo motor grava lançamento com snapshot completo
  const kA = `hml-${RUN}-reserva-A`;
  const A = await op(admin, "reserva", I1, 100, kA, resPayload());
  const mA = await movByKey(kA);
  check("A", "Reserva via motor grava lançamento único com snapshot completo",
    !A.msg && mA.length === 1 && Number(mA[0].saldo_anterior) === 100 &&
    Number(mA[0].reservado_anterior) === 0 && Number(mA[0].reservado_posterior) === 100 &&
    mA[0].status_anterior === "disponivel" && mA[0].status_novo === "reservado" &&
    !!mA[0].request_fingerprint && mA[0].origem === "harness" && mA[0].os_id === osId,
    { err: A.msg, mov: mA[0] });

  // B — replay idempotente
  const B = await op(admin, "reserva", I1, 100, kA, resPayload());
  check("B", "Replay com mesma chave e mesmo payload não duplica lançamento",
    !B.msg && B.data?.replay === true && (await movByKey(kA)).length === 1,
    { err: B.msg, data: B.data });

  // C — mesma chave com payload divergente
  const C = await op(admin, "reserva", I1, 55, kA, resPayload());
  check("C", "Chave reutilizada com payload divergente é rejeitada",
    !!C.msg && C.msg.includes("ESTQ_IDEMPOTENCY_CONFLITO"), { err: C.msg });

  // D — UPDATE direto bloqueado
  const { error: dErr } = await admin.from("estoque_produto").update({ status: "expedido" }).eq("id", I1);
  check("D", "UPDATE direto em estoque_produto é bloqueado",
    !!dErr && /ESTQ_UPDATE_DIRETO_BLOQUEADO|permission|row-level/i.test(dErr.message), { err: dErr?.message });

  // E — livro append-only
  const { error: eU } = await admin.from("estoque_movimentacoes").update({ motivo: "hack" }).eq("id", mA[0].id);
  const { error: eD } = await admin.from("estoque_movimentacoes").delete().eq("id", mA[0].id);
  const eAfter = await movByKey(kA);
  check("E", "Livro de movimentações é append-only (UPDATE/DELETE bloqueados)",
    !!eU && !!eD && eAfter.length === 1 && eAfter[0].motivo !== "hack",
    { update: eU?.message, delete: eD?.message });

  // F — expedição encadeia saldos
  const kF = `hml-${RUN}-exped-F`;
  const F = await op(admin, "expedicao", I1, 100, kF, resPayload({ referencia_tipo: "entrega" }));
  const mF = (await movByKey(kF))[0];
  check("F", "Expedição encadeia saldo/reserva anterior→posterior sem furo",
    !F.msg && !!mF && Number(mA[0].saldo_posterior) === Number(mF.saldo_anterior) &&
    Number(mA[0].reservado_posterior) === Number(mF.reservado_anterior) &&
    mF.status_novo === "expedido" && mF.direcao === "saida",
    { err: F.msg, reserva: { pos: mA[0].saldo_posterior }, exped: mF && { ant: mF.saldo_anterior, pos: mF.saldo_posterior, dir: mF.direcao } });

  // G — estorno único, vinculado à origem
  const G1 = await op(admin, "estorno_expedicao", I1, null, `hml-${RUN}-estorno-G`, {
    origem: "harness", movimentacao_origem_id: mF?.id, motivo: "cancelamento de entrega HML",
  });
  const G2 = await op(admin, "estorno_expedicao", I1, null, `hml-${RUN}-estorno-G2`, {
    origem: "harness", movimentacao_origem_id: mF?.id, motivo: "tentativa duplicada",
  });
  const estorno = (await movsDo(I1)).find((m) => m.acao === "estorno_expedicao");
  check("G", "Estorno vinculado à origem e sem duplicidade",
    !G1.msg && !!estorno && estorno.movimentacao_origem_id === mF?.id &&
    !!G2.msg && G2.msg.includes("ESTQ_ESTORNO_DUPLICADO") &&
    Number(estorno.saldo_posterior) === Number(mF.saldo_anterior),
    { g1: G1.msg, g2: G2.msg, estorno_origem: estorno?.movimentacao_origem_id });

  // H — concorrência real: duas sessões distintas disputam o mesmo saldo
  const [H1, H2] = await Promise.all([
    op(admin, "reserva", I2, 80, `hml-${RUN}-conc-1`, resPayload()),
    op(producao, "reserva", I2, 80, `hml-${RUN}-conc-2`, resPayload()),
  ]);
  const itH = await item(I2);
  const okConc = ((!H1.msg ? 1 : 0) + (!H2.msg ? 1 : 0)) === 1 &&
    Number(itH.quantidade) === 20 && Number(itH.quantidade) >= 0;
  // concorrência sobre a MESMA chave: exatamente um lançamento
  const kSame = `hml-${RUN}-conc-samekey`;
  const [S1, S2] = await Promise.all([
    op(admin, "reserva", I5, 40, kSame, resPayload()),
    op(admin, "reserva", I5, 40, kSame, resPayload()),
  ]);
  const okSame = (await movByKey(kSame)).length === 1 && !(S1.msg && S2.msg);
  check("H", "Concorrência real: um vencedor por saldo e lançamento único por chave",
    okConc && okSame, { h1: H1.msg, h2: H2.msg, item_i2: itH, samekey: { s1: S1.msg, s2: S2.msg, lancamentos: (await movByKey(kSame)).length } });

  // I — produtor bloqueado
  const I = await op(produtor, "reserva", I3, 10, `hml-${RUN}-perm-I`, resPayload());
  check("I", "Perfil produtor não pode operar o motor de estoque",
    !!I.msg && /ESTQ_SEM_PERMISSAO|permission/i.test(I.msg), { err: I.msg });

  // J — anônimo bloqueado
  const J = await op(anon, "reserva", I3, 10, `hml-${RUN}-anon-J`, resPayload());
  check("J", "Anônimo não executa o motor canônico", !!J.msg, { err: J.msg });

  // K — limite de redução sem alçada
  const K = await op(producao, "perda", I3, 95, `hml-${RUN}-limite-K`, { origem: "harness", motivo: "perda acima do limite" });
  const K2 = await op(cli.administrativo!, "perda", I3, 2, `hml-${RUN}-limite-K2`, { origem: "harness", motivo: "sem alçada" });
  check("K", "Redução acima do limite exige alçada e perfil sem alçada é barrado",
    !!K.msg && /ESTQ_APROVACAO_REQUERIDA/.test(K.msg) &&
    !!K2.msg && /ESTQ_SEM_PERMISSAO/.test(K2.msg), { err: K.msg, err2: K2.msg });

  // L — perda coerente
  const kL = `hml-${RUN}-perda-L`;
  const L = await op(admin, "perda", I3, 5, kL, { origem: "harness", motivo: "quebra de frasco" });
  const mL = (await movByKey(kL))[0];
  const itL = await item(I3);
  check("L", "Perda registra motivo, direção e saldo coerente",
    !L.msg && !!mL && Number(mL.saldo_anterior) === 100 && Number(mL.saldo_posterior) === 95 &&
    Number(itL.quantidade) === 95 && !!mL.motivo && mL.direcao === "saida",
    { err: L.msg, mov: mL && { ant: mL.saldo_anterior, pos: mL.saldo_posterior, dir: mL.direcao }, saldo: itL.quantidade });

  // M — motivo obrigatório
  const M = await op(admin, "descarte", I3, 1, `hml-${RUN}-motivo-M`, { origem: "harness" });
  check("M", "Motivo é obrigatório em perda/ajuste/descarte",
    !!M.msg && M.msg.includes("ESTQ_MOTIVO_OBRIGATORIO"), { err: M.msg });

  // N — devolução em quarentena não reintegra saldo comercial
  const antesN = await item(I3);
  const kN = `hml-${RUN}-devol-N`;
  const N = await op(admin, "devolucao", I3, 3, kN, {
    origem: "harness", classificacao: "quarentena", motivo: "retorno de campo sem laudo",
  });
  const depoisN = await item(I3);
  const mN = (await movByKey(kN))[0];
  check("N", "Devolução em quarentena mantém trilha e não reintegra saldo comercial",
    !N.msg && !!mN && Number(antesN.quantidade) === Number(depoisN.quantidade) &&
    mN.metadata?.reintegrado === false && mN.direcao === "neutro",
    { err: N.msg, antes: antesN.quantidade, depois: depoisN.quantidade, meta: mN?.metadata });

  // O — autoria/unidade/direção/origem em 100% dos lançamentos do motor
  const seedIds = [I1, I2, I3, I4, I5];
  const todas: any[] = [];
  for (const i of seedIds) todas.push(...(await movsDo(i)));
  const doMotor = todas.filter((m) => !!m.idempotency_key);
  const completas = doMotor.filter((m) => m.usuario_id && m.unidade && m.direcao && m.origem);
  check("O", "Trilha completa (autoria, unidade, direção, origem) em 100% dos lançamentos do motor",
    doMotor.length > 0 && completas.length === doMotor.length,
    { motor: doMotor.length, completas: completas.length, seed_sem_chave: todas.length - doMotor.length });

  // P — ação inválida
  const P = await op(admin, "teleporte", I3, 1, `hml-${RUN}-acao-P`, { origem: "harness" });
  check("P", "Ação fora da taxonomia canônica é rejeitada",
    !!P.msg && P.msg.includes("ESTQ_ACAO_INVALIDA"), { err: P.msg });

  // Q — cancelamento de reserva devolve o item para disponível
  const kQr = `hml-${RUN}-reserva-Q`, kQc = `hml-${RUN}-cancel-Q`;
  const Qr = await op(admin, "reserva", I4, 100, kQr, resPayload());
  const Qc = await op(admin, "cancelamento_reserva", I4, 100, kQc, { origem: "harness" });
  const mQ = (await movByKey(kQc))[0];
  const itQ = await item(I4);
  check("Q", "Cancelamento de reserva libera o item e encadeia o snapshot",
    !Qr.msg && !Qc.msg && !!mQ && mQ.status_anterior === "reservado" &&
    mQ.status_novo === "disponivel" && itQ.status === "disponivel",
    { qr: Qr.msg, qc: Qc.msg, mov: mQ && { ant: mQ.status_anterior, novo: mQ.status_novo }, item: itQ.status });

  // R — entrega baixa saldo com trilha de saída
  const kRr = `hml-${RUN}-reserva-R`, kRe = `hml-${RUN}-entrega-R`;
  const Rr = await op(admin, "reserva", I4, 100, kRr, resPayload());
  const antesR = await item(I4);
  const R = await op(admin, "entrega", I4, 10, kRe, resPayload({ referencia_tipo: "entrega" }));
  const mR = (await movByKey(kRe))[0];
  const depoisR = await item(I4);
  check("R", "Entrega baixa saldo com direção de saída e snapshot coerente",
    !Rr.msg && !R.msg && !!mR && Number(depoisR.quantidade) === Number(antesR.quantidade) - 10 &&
    mR.direcao === "saida" && Number(mR.saldo_anterior) - Number(mR.saldo_posterior) === 10,
    { err: R.msg, antes: antesR.quantidade, depois: depoisR.quantidade, mov: mR && { ant: mR.saldo_anterior, pos: mR.saldo_posterior } });

  // S — ajuste de entrada aumenta saldo com direção de entrada
  const kS = `hml-${RUN}-ajuste-S`;
  const antesS = await item(I3);
  const S = await op(admin, "ajuste", I3, 4, kS, { origem: "harness", motivo: "recontagem física", sentido: "entrada" });
  const mS = (await movByKey(kS))[0];
  const depoisS = await item(I3);
  check("S", "Ajuste de entrada aumenta saldo e registra direção de entrada",
    !S.msg && !!mS && Number(depoisS.quantidade) === Number(antesS.quantidade) + 4 && mS.direcao === "entrada",
    { err: S.msg, antes: antesS.quantidade, depois: depoisS.quantidade, dir: mS?.direcao });

  // T — reserva acima do saldo
  const T = await op(admin, "reserva", I2, 9999, `hml-${RUN}-saldo-T`, resPayload());
  check("T", "Reserva acima do saldo disponível é rejeitada",
    !!T.msg && T.msg.includes("ESTQ_SALDO_INSUFICIENTE"), { err: T.msg });

  // U — chave de idempotência obrigatória
  const U = await op(admin, "reserva", I2, 1, "curta", resPayload());
  check("U", "Chave de idempotência fraca/ausente é rejeitada",
    !!U.msg && U.msg.includes("ESTQ_IDEMPOTENCY_OBRIGATORIA"), { err: U.msg });

  // V — devolução exige classificação válida
  const V = await op(admin, "devolucao", I3, 1, `hml-${RUN}-devclass-V`, { origem: "harness", motivo: "sem classificacao" });
  check("V", "Devolução sem classificação válida é rejeitada",
    !!V.msg && V.msg.includes("ESTQ_DEVOLUCAO_CLASSIFICACAO"), { err: V.msg });

  // W — estorno de estorno / origem inválida
  const W1 = await op(admin, "estorno_expedicao", I1, null, `hml-${RUN}-estdeest-W`, {
    origem: "harness", movimentacao_origem_id: estorno?.id, motivo: "estorno de estorno",
  });
  const W2 = await op(admin, "estorno_expedicao", I3, null, `hml-${RUN}-estorigem-W`, {
    origem: "harness", movimentacao_origem_id: mF?.id, motivo: "origem de outro item",
  });
  check("W", "Estorno de estorno e origem cruzada são bloqueados",
    !!W1.msg && /ESTQ_ESTORNO_DE_ESTORNO|ESTQ_ESTORNO_DUPLICADO/.test(W1.msg) &&
    !!W2.msg && W2.msg.includes("ESTQ_ESTORNO_ORIGEM_INVALIDA"), { w1: W1.msg, w2: W2.msg });

  // X — expedição de item não reservado
  const X = await op(admin, "expedicao", I3, 1, `hml-${RUN}-expedlivre-X`, resPayload());
  check("X", "Expedição de item não reservado é bloqueada",
    !!X.msg && X.msg.includes("ESTQ_STATUS_INVALIDO"), { err: X.msg });

  // Y — reserva parcial gera linha filha com vínculo real de OS/cliente e trilha
  const kY = `hml-${RUN}-parcial-Y`;
  const Y = await op(admin, "reserva", I2, 5, kY, resPayload());
  const filhoId = Y.data?.estoque_produto_id;
  const filho = filhoId ? await item(filhoId) : null;
  const mY = (await movByKey(kY))[0];
  check("Y", "Reserva parcial cria linha filha vinculada à OS/cliente reais com trilha",
    !Y.msg && !!filho && filhoId !== I2 && Number(filho.quantidade) === 5 &&
    filho.status === "reservado" && filho.reservado_para_os_id === osId &&
    filho.reservado_para_cliente_id === clienteId && !!mY,
    { err: Y.msg, filho, mov_id: mY?.id });

  // Z — transferência entre locais de estoque
  na("Z", "Transferência entre locais de estoque",
    "Não existe modelo canônico de locais/depósitos no schema (estoque_produto não possui local_id nem tabela de locais). Sem fluxo real, o item não pode ser exercitado nem aprovado.");

  // Performance p50/p95 das chamadas do motor
  const ms = perf.map((p) => p.ms).sort((a, b) => a - b);
  const pct = (q: number) => ms.length ? Number(ms[Math.min(ms.length - 1, Math.floor(q * ms.length))].toFixed(1)) : 0;
  results.push({
    id: "PERF", name: "Latência do motor (p50/p95)", status: pct(0.95) < 2000 ? "PASS" : "FAIL",
    evidence: { chamadas: ms.length, p50_ms: pct(0.5), p95_ms: pct(0.95), max_ms: Number((ms[ms.length - 1] ?? 0).toFixed(1)) },
  });
}

// ---------------------------------------------------------------- cleanup
async function cleanup(marker: string) {
  // 1) livro + itens de estoque via expurgo controlado (append-only e delete-guard preservados)
  const { data: purged, error: pErr } = await svc.rpc("fn_hml_purge_movimentacoes_fixture", { p_marker: marker });
  if (pErr) throw new Error(`purge: ${pErr.message}`);

  // 2) dependentes de usuário
  for (const id of created.users) {
    await svc.from("notificacoes_operacionais").delete().eq("usuario_id", id);
    await svc.from("user_roles").delete().eq("user_id", id);
    await svc.from("user_clientes").delete().eq("user_id", id);
  }
  // 3) OS -> envase/CQ -> lote -> produto/microrganismo (ordem de FK)
  for (const id of created.ordens) await svc.from("ordens_servico").delete().eq("id", id);
  for (const id of created.envases) await svc.from("envase").delete().eq("id", id);
  for (const id of created.lotes) await svc.from("controle_qualidade").delete().eq("lote_id", id);
  for (const id of created.lotes) await svc.from("lotes").delete().eq("id", id);
  for (const id of created.produtos) await svc.from("produtos").delete().eq("id", id);
  for (const id of created.microrganismos) await svc.from("microrganismos").delete().eq("id", id);
  // 4) usuários efêmeros e cliente
  for (const id of created.users) await svc.auth.admin.deleteUser(id);
  for (const id of created.clientes) {
    await svc.from("user_clientes").delete().eq("cliente_id", id);
    await svc.from("clientes").delete().eq("id", id);
  }
  return { purged, residuos: await contarResiduos() };
}

async function contarResiduos() {
  const c = async (table: string, col: string, pattern: string) => {
    const { count } = await svc.from(table).select("id", { count: "exact", head: true }).like(col, pattern);
    return count ?? 0;
  };
  const { data: itens } = await svc.from("estoque_produto").select("id, produtos!inner(nome)")
    .like("produtos.nome", "HML MOV%");
  return {
    estoque_produto: (itens ?? []).length,
    produtos: await c("produtos", "nome", "HML MOV%"),
    lotes: await c("lotes", "codigo_lote", "HMLMOV-%"),
    microrganismos: await c("microrganismos", "nome", "HML MOV%"),
    clientes: await c("clientes", "nome", "HML MOV%"),
    ordens_servico: await c("ordens_servico", "numero_os", "HMLMOV-%"),
    envase: (await svc.from("envase").select("id, lotes!inner(codigo_lote)").like("lotes.codigo_lote", "HMLMOV-%")).data?.length ?? 0,
  };
}

// ---------------------------------------------------------------- endpoint
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!INTERNAL_SECRET || req.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);

  // Varredura de resíduos de execuções anteriores (somente fixtures HML MOV)
  let sweep: unknown = null;
  if (url.searchParams.get("sweep") === "1") {
    const { data, error } = await svc.rpc("fn_hml_purge_movimentacoes_fixture", { p_marker: "HML MOV " });
    sweep = error ? { error: error.message } : data;
    const { data: orfaos } = await svc.from("produtos").select("id").like("nome", "HML MOV%");
    for (const p of orfaos ?? []) {
      const { data: ls } = await svc.from("lotes").select("id").eq("produto_id", p.id);
      await svc.from("ordens_servico").delete().eq("produto_id", p.id);
      for (const l of ls ?? []) {
        await svc.from("envase").delete().eq("lote_id", l.id);
        await svc.from("controle_qualidade").delete().eq("lote_id", l.id);
        await svc.from("lotes").delete().eq("id", l.id);
      }
      await svc.from("produtos").delete().eq("id", p.id);
    }
    await svc.from("microrganismos").delete().like("nome", "HML MOV%");
    const { data: cs } = await svc.from("clientes").select("id").like("nome", "HML MOV%");
    for (const cl of cs ?? []) {
      await svc.from("user_clientes").delete().eq("cliente_id", cl.id);
      await svc.from("clientes").delete().eq("id", cl.id);
    }
    if (url.searchParams.get("only") === "sweep") {
      return new Response(JSON.stringify({ sweep, residuos: await contarResiduos() }, null, 2),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }
  }

  let fatal: string | null = null;
  try {
    await run();
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e);
  }
  let limpeza: any = {};
  try {
    limpeza = await cleanup(MARKER);
  } catch (e) {
    fatal = `${fatal ?? ""} | cleanup: ${e instanceof Error ? e.message : String(e)}`;
  }
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const naCount = results.filter((r) => r.status === "NA").length;
  const limpo = Object.values(limpeza.residuos ?? { x: 1 }).every((v) => v === 0);
  return new Response(JSON.stringify({
    run: RUN, sweep,
    gate: fail === 0 && !fatal && limpo ? "PASS" : "FAIL",
    total: results.length, pass, fail, na: naCount, fatal,
    limpeza, results,
  }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
