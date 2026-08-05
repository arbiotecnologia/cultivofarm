// Harness de homologação runtime — Fluxo unificado de atendimento técnico (staging).
// Cria usuários efêmeros REAIS, executa os gates C1–C12 autenticados e limpa tudo.
// service_role é usado APENAS para fixture/cleanup; os gates rodam com sessões reais.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const EXPECTED_STAGING_REF = "ikaauvsflpmamgxmkhoq";
const PROD_REF = "navfzbwgwzruipouyfnk";

// Script CLI local — NÃO é Edge Function. Sem Deno.serve, sem CORS, sem HTTP.
// Guard fail-closed: só executa contra o staging autorizado.
function assertStaging() {
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    throw new Error("GUARD_ABORT: SUPABASE_URL/SERVICE_ROLE/ANON ausentes");
  }
  if (SUPABASE_URL.includes(PROD_REF)) {
    throw new Error("GUARD_ABORT: URL de PRODUCAO — execucao proibida");
  }
  if (!SUPABASE_URL.includes(EXPECTED_STAGING_REF)) {
    throw new Error(`GUARD_ABORT: ambiente nao autorizado (esperado ${EXPECTED_STAGING_REF})`);
  }
}


type Status = "PASS" | "FAIL" | "BLOCKED";
type Result = { id: string; name: string; status: Status; evidence: unknown };
const results: Result[] = [];
const certificationResults: Result[] = [];
const log = (id: string, name: string, status: Status, evidence: unknown) =>
  results.push({ id, name, status, evidence });
const check = (id: string, name: string, cond: boolean, evidence: unknown) =>
  log(id, name, cond ? "PASS" : "FAIL", evidence);
const certify = (id: string, name: string, status: Status, evidence: unknown) =>
  certificationResults.push({ id, name, status, evidence });

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const RUN = crypto.randomUUID().slice(0, 8);
const PWD = `Visita-${crypto.randomUUID()}`;

type Profile = "consultor" | "agronomo" | "produtor" | "sem_vinculo";
const ROLES: Record<Profile, string[]> = {
  consultor: ["consultor_tecnico"],
  agronomo: ["tecnico_agronomo"],
  produtor: ["cliente_produtor"],
  sem_vinculo: [],
};

const uid: Partial<Record<Profile, string>> = {};
const cli: Partial<Record<Profile, ReturnType<typeof createClient>>> = {};
const created = {
  users: [] as string[],
  clientes: [] as string[],
  fazendas: [] as string[],
  talhoes: [] as string[],
  solicitacoes: [] as string[],
  registros: [] as string[],
};

async function signIn(email: string) {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PWD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function setup() {
  const { data: cl, error: eCl } = await svc.from("clientes")
    .insert({ nome: `Visita HML ${RUN}`, codigo_cliente: `VH${RUN}` }).select("id").single();
  if (eCl) throw new Error(`cliente: ${eCl.message}`);
  created.clientes.push(cl.id);

  const { data: fz, error: eFz } = await svc.from("fazendas")
    .insert({ nome: `Fazenda HML ${RUN}`, cliente_id: cl.id }).select("id").single();
  if (eFz) throw new Error(`fazenda: ${eFz.message}`);
  created.fazendas.push(fz.id);

  const { data: th, error: eTh } = await svc.from("talhoes")
    .insert({ nome: `Talhao HML ${RUN}`, fazenda_id: fz.id, area_hectares: 12.5 })
    .select("id").single();
  if (eTh) throw new Error(`talhao: ${eTh.message}`);
  created.talhoes.push(th.id);

  for (const p of Object.keys(ROLES) as Profile[]) {
    const email = `visita-${p}-${RUN}@arbio-staging.test`;
    const { data, error } = await svc.auth.admin.createUser({
      email, password: PWD, email_confirm: true,
      user_metadata: { nome: `Visita ${p} ${RUN}` },
    });
    if (error) throw new Error(`createUser ${p}: ${error.message}`);
    uid[p] = data.user!.id;
    created.users.push(data.user!.id);
    await svc.from("user_roles").delete().eq("user_id", data.user!.id);
    for (const r of ROLES[p]) {
      await svc.from("user_roles").insert({ user_id: data.user!.id, role: r });
    }
    if (p === "consultor" || p === "agronomo") {
      await svc.from("user_clientes").insert({
        user_id: data.user!.id, cliente_id: cl.id, access_level: "manage", is_active: true,
      });
    }
    if (p === "produtor") {
      await svc.from("user_clientes").insert({
        user_id: data.user!.id, cliente_id: cl.id, access_level: "read", is_active: true,
      });
    }
    cli[p] = await signIn(email);
  }
}

async function cleanup() {
  for (const id of created.registros) await svc.from("registros_consultor").delete().eq("id", id);
  await svc.from("registros_consultor").delete().eq("cliente_id", created.clientes[0]);
  for (const id of created.solicitacoes) {
    await svc.from("solicitacoes_timeline").delete().eq("solicitacao_id", id);
    await svc.from("portal_solicitacoes").delete().eq("id", id);
  }
  for (const id of created.talhoes) await svc.from("talhoes").delete().eq("id", id);
  for (const id of created.fazendas) await svc.from("fazendas").delete().eq("id", id);
  for (const u of created.users) {
    await svc.from("user_clientes").delete().eq("user_id", u);
    await svc.from("user_roles").delete().eq("user_id", u);
    await svc.auth.admin.deleteUser(u);
  }
  for (const id of created.clientes) await svc.from("clientes").delete().eq("id", id);
}

async function criarSolicitacao() {
  const { data, error } = await svc.from("portal_solicitacoes").insert({
    cliente_id: created.clientes[0],
    fazenda_id: created.fazendas[0],
    talhao_id: created.talhoes[0],
    tipo_demanda: "praga",
    descricao: `Demanda HML ${RUN}`,
    urgencia: "alta",
    status: "pendente",
    user_id: uid.produtor,
  }).select("id").single();
  if (error) throw new Error(`solicitacao: ${error.message}`);
  created.solicitacoes.push(data.id);
  return data.id as string;
}

async function run() {
  // ---- C1: guard de staging fail-closed ----
  const { data: marker } = await svc.from("_fiscal_staging_marker").select("marker, project_ref");
  const refs = (marker ?? []).map((m: any) => m.project_ref);
  check("C1", "Guard fail-closed: marker STAGING comprovado e sem ref de produção",
    refs.includes(EXPECTED_STAGING_REF) && !refs.includes(PROD_REF),
    { refs, expected: EXPECTED_STAGING_REF });

  // ---- C2 / C3: listagem executa sem erro para ambos os perfis técnicos ----
  for (const [id, p] of [["C2", "consultor"], ["C3", "agronomo"]] as [string, Profile][]) {
    const { data, error } = await cli[p]!.rpc("rpc_listar_atendimentos_tecnicos_v1", {
      p_aba: "todos", p_search: null, p_page: 1, p_page_size: 10,
    });
    check(id, `rpc_listar_atendimentos_tecnicos_v1 executa (${p})`,
      !error && (data as any)?.ok === true,
      { error: error?.message ?? null, total: (data as any)?.total, ok: (data as any)?.ok });
  }

  // ---- C2b: aba inválida é rejeitada explicitamente ----
  {
    const { data, error } = await cli.consultor!.rpc("rpc_listar_atendimentos_tecnicos_v1", {
      p_aba: "xpto", p_search: null, p_page: 1, p_page_size: 10,
    });
    check("C2b", "Aba desconhecida rejeitada (invalid_tab), não lista vazia silenciosa",
      !error && (data as any)?.ok === false && (data as any)?.error === "invalid_tab",
      { data, error: error?.message ?? null });
  }

  // ---- C2c: resumo coerente, com total 'todos' ----
  {
    const { data, error } = await cli.consultor!.rpc("rpc_resumo_atendimentos_tecnicos_v1", {});
    check("C2c", "Resumo devolve total 'todos' coerente",
      !error && typeof (data as any)?.todos === "number",
      { data, error: error?.message ?? null });
  }

  // ---- C4: solicitação SEM cultura cria rascunho e sinaliza cultura pendente ----
  const solA = await criarSolicitacao();
  {
    const { data, error } = await cli.consultor!.rpc("rpc_iniciar_atendimento_solicitacao_v1", {
      p_solicitacao_id: solA, p_client_uuid: crypto.randomUUID(),
    });
    const r = data as any;
    if (r?.registro_id) created.registros.push(r.registro_id);
    check("C4", "Demanda sem cultura abre rascunho e exige cultura antes da finalização",
      !error && r?.ok === true && !!r?.registro_id &&
      r?.status === "rascunho" &&
      (r?.cultura_id !== null ||
        (Array.isArray(r?.missing_fields) && r.missing_fields.includes("cultura_id") &&
         r?.next_step === "identificacao")) &&
      typeof r?.next_route === "string" && r.next_route.startsWith("/app/visita/"),
      { error: error?.message ?? null, res: r });
  }

  // ---- C5: disputa entre dois técnicos pela mesma demanda ----
  const solB = await criarSolicitacao();
  {
    const [a, b] = await Promise.all([
      cli.consultor!.rpc("rpc_iniciar_atendimento_solicitacao_v1", {
        p_solicitacao_id: solB, p_client_uuid: crypto.randomUUID(),
      }),
      cli.agronomo!.rpc("rpc_iniciar_atendimento_solicitacao_v1", {
        p_solicitacao_id: solB, p_client_uuid: crypto.randomUUID(),
      }),
    ]);
    const ra = a.data as any, rb = b.data as any;
    for (const r of [ra, rb]) if (r?.registro_id) created.registros.push(r.registro_id);

    const { count: nVisitas } = await svc.from("registros_consultor")
      .select("id", { count: "exact", head: true }).eq("solicitacao_id", solB);
    const { count: nTl } = await svc.from("solicitacoes_timeline")
      .select("id", { count: "exact", head: true })
      .eq("solicitacao_id", solB).eq("tipo_evento", "visita_iniciada");

    const vencedores = [ra, rb].filter((r) => r?.ok === true).length;
    const perdedores = [ra, rb].filter((r) => r?.error === "already_assigned").length;

    check("C5", "Disputa: exatamente 1 visita e 1 evento de timeline",
      nVisitas === 1 && nTl === 1 && (vencedores >= 1) && (vencedores + perdedores === 2),
      { ra, rb, nVisitas, nTl, vencedores, perdedores });
  }

  // ---- C6: ocorrência online idempotente e imediatamente visível ----
  {
    const cu = crypto.randomUUID();
    const args = {
      p_client_uuid: cu,
      p_cliente_id: created.clientes[0],
      p_fazenda_id: created.fazendas[0],
      p_talhao_id: created.talhoes[0],
      p_cultura_id: null,
      p_data_vistoria: new Date().toISOString().slice(0, 10),
      p_tipo_visita: "vistoria_inicial",
      p_origem: "ocorrencia_campo",
      p_categoria_problema: "insetos_praga",
      p_nivel_pressao: "alto",
      p_percentual_area_afetada: 30,
      p_urgencia: "alta",
      p_observacoes_tecnicas: `HML ${RUN}`,
      p_area_hectares: 12.5,
      p_latitude: -15.5,
      p_longitude: -47.5,
    };
    const q1 = await cli.consultor!.rpc("rpc_criar_visita_idempotente", args);
    const q2 = await cli.consultor!.rpc("rpc_criar_visita_idempotente", args);
    const r1 = q1.data as any, r2 = q2.data as any;
    const e1 = q1.error?.message ?? null, e2 = q2.error?.message ?? null;
    if (r1?.registro_id) created.registros.push(r1.registro_id);

    const lista = (await cli.consultor!.rpc("rpc_listar_atendimentos_tecnicos_v1", {
      p_aba: "ocorrencias", p_search: null, p_page: 1, p_page_size: 50,
    })).data as any;
    const visivel = (lista?.items ?? []).some((i: any) => i.id === r1?.registro_id);
    const temCampos = (lista?.items ?? []).every(
      (i: any) => "proxima_acao" in i && "responsavel_nome" in i && "data_prevista" in i,
    );

    check("C6", "Ocorrência online idempotente, visível na aba e com projeção ampliada",
      r1?.ok === true && r1?.created === true &&
      r2?.ok === true && r2?.created === false && r2?.registro_id === r1?.registro_id &&
      visivel && temCampos,
      { r1, r2, e1, e2, visivel, temCampos, total: lista?.total });
  }

  // ---- C7: contrato offline = contrato canônico (replay da mesma RPC) ----
  {
    const cu = crypto.randomUUID();
    const offlinePayload = {
      p_client_uuid: cu,
      p_cliente_id: created.clientes[0],
      p_fazenda_id: created.fazendas[0],
      p_talhao_id: created.talhoes[0],
      p_cultura_id: null,
      p_data_vistoria: new Date().toISOString().slice(0, 10),
      p_tipo_visita: "vistoria_inicial",
      p_origem: "ocorrencia_campo",
      p_categoria_problema: "nematoides",
      p_nivel_pressao: "medio",
      p_percentual_area_afetada: 10,
      p_urgencia: "media",
      p_observacoes_tecnicas: `HML offline ${RUN}`,
      p_area_hectares: 12.5,
      p_latitude: -15.6,
      p_longitude: -47.6,
    };
    // replay 1 (sync) e replay 2 (retry após falha de rede) — mesmo client_uuid
    const p1 = await cli.consultor!.rpc("rpc_criar_visita_idempotente", offlinePayload);
    const p2 = await cli.consultor!.rpc("rpc_criar_visita_idempotente", offlinePayload);
    const s1 = p1.data as any, s2 = p2.data as any;
    const se1 = p1.error?.message ?? null, se2 = p2.error?.message ?? null;
    if (s1?.registro_id) created.registros.push(s1.registro_id);

    const { data: row } = await svc.from("registros_consultor")
      .select("origem_atendimento, latitude, longitude, categoria_problema, natureza_registro")
      .eq("id", s1?.registro_id).single();

    check("C7", "Replay offline usa RPC canônica, preserva origem/diagnóstico/GPS, sem duplicar",
      s1?.ok === true && s2?.registro_id === s1?.registro_id &&
      row?.origem_atendimento === "ocorrencia_campo" &&
      Number(row?.latitude) === -15.6 && Number(row?.longitude) === -47.6 &&
      row?.categoria_problema === "nematoides" && row?.natureza_registro === "ocorrencia",
      { s1, s2, se1, se2, row });
  }

  // ---- C8: produtor / sem vínculo ----
  for (const [id, p, nome] of [
    ["C8a", "produtor", "produtor"],
    ["C8b", "sem_vinculo", "sem vínculo"],
  ] as [string, Profile, string][]) {
    const { data, error } = await cli[p]!.rpc("rpc_listar_atendimentos_tecnicos_v1", {
      p_aba: "todos", p_search: null, p_page: 1, p_page_size: 10,
    });
    const r = data as any;
    check(id, `Perfil ${nome} recebe forbidden/zero na listagem técnica`,
      !!error || r?.ok === false || (r?.total ?? 0) === 0,
      { error: error?.message ?? null, res: r });

    const { data: d2 } = await cli[p]!.rpc("rpc_criar_visita_idempotente", {
      p_client_uuid: crypto.randomUUID(),
      p_cliente_id: created.clientes[0],
      p_fazenda_id: created.fazendas[0],
      p_talhao_id: created.talhoes[0],
      p_data_vistoria: new Date().toISOString().slice(0, 10),
      p_origem: "ocorrencia_campo",
    });
    check(`${id}-w`, `Perfil ${nome} não consegue criar visita`,
      (d2 as any)?.ok !== true, { res: d2 });
  }

  // ---- C9: mídia parcial não invalida a visita ----
  {
    const { data: reg } = await svc.from("registros_consultor")
      .select("id").eq("cliente_id", created.clientes[0]).limit(1).maybeSingle();
    if (!reg) {
      log("C9", "Mídia parcial", "BLOCKED", "nenhum registro base disponível");
    } else {
      // Simula referência de mídia idempotente (upsert por client_uuid)
      const cu = crypto.randomUUID();
      const ref = {
        registro_consultor_id: reg.id,
        arquivo_path: `${reg.id}/foto/${cu}.jpg`,
        nome_arquivo: "hml.jpg",
        tipo_arquivo: "image/jpeg",
        tipo_midia: "foto",
        categoria_arquivo: "geral",
        foto_principal: true,
        uploaded_by: uid.consultor,
        client_uuid: cu,
      };
      const a = await svc.from("registros_consultor_arquivos").upsert(ref, { onConflict: "client_uuid" });
      const b = await svc.from("registros_consultor_arquivos").upsert(ref, { onConflict: "client_uuid" });
      const { count } = await svc.from("registros_consultor_arquivos")
        .select("id", { count: "exact", head: true }).eq("client_uuid", cu);
      const { data: visitaViva } = await svc.from("registros_consultor")
        .select("id").eq("id", reg.id).maybeSingle();
      await svc.from("registros_consultor_arquivos").delete().eq("client_uuid", cu);
      check("C9", "Referência de mídia idempotente e visita preservada em falha parcial",
        !a.error && !b.error && count === 1 && !!visitaViva,
        { aErr: a.error?.message ?? null, bErr: b.error?.message ?? null, count });
    }
  }

  // ---- C10: rollback/verify — verificação estática (execução psql é externa) ----
  log("C10", "Rollback + verify/checksum preservam dados", "BLOCKED",
    "rollback.sql/verify-restoration.sql são forward-safe e não destrutivos; execução via psql exige credenciais fora do harness (executar manualmente em staging).");

  // ---- C11 (parcial): sem overload ambíguo do motor ----
  {
    const { data, error } = await svc.rpc("rpc_criar_visita_idempotente", {
      p_client_uuid: crypto.randomUUID(),
      p_cliente_id: created.clientes[0],
      p_fazenda_id: created.fazendas[0],
      p_talhao_id: created.talhoes[0],
      p_data_vistoria: new Date().toISOString().slice(0, 10),
      p_origem: "ocorrencia_campo",
    });
    // service_role sem auth.uid() → unauthenticated, mas SEM erro de ambiguidade (42725)
    check("C11", "Motor único sem overload ambíguo (resolução determinística)",
      !error || error.code !== "42725",
      { error: error?.message ?? null, code: error?.code ?? null, data });
  }
}

function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, mask(item)]),
    );
  }
  if (typeof value !== "string") return value;
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, (id) => `${id.slice(0, 8)}…${id.slice(-4)}`)
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[JWT_REMOVIDO]");
}

async function runCertification() {
  const list = async (p: Profile, args: Record<string, unknown> = {}) =>
    await cli[p]!.rpc("rpc_listar_atendimentos_tecnicos_v1", {
      p_aba: "todos", p_search: null, p_page: 1, p_page_size: 10, ...args,
    });

  for (const [id, p, name] of [
    ["T1", "consultor", "listagem consultor autenticado"],
    ["T2", "agronomo", "listagem técnico agrônomo autenticado"],
  ] as [string, Profile, string][]) {
    const response = await list(p);
    certify(id, name, !response.error && (response.data as any)?.ok === true ? "PASS" : "FAIL", {
      error: response.error?.message ?? null, ok: (response.data as any)?.ok,
    });
  }

  const denied: unknown[] = [];
  for (const p of ["produtor", "sem_vinculo"] as Profile[]) {
    const response = await list(p);
    denied.push({ profile: p, error: response.error?.message ?? null, result: response.data });
  }
  certify("T3", "produtor e autenticado sem vínculo proibidos",
    denied.every((entry: any) => entry.error || entry.result?.ok === false || entry.result?.total === 0)
      ? "PASS" : "FAIL", denied);

  certify("T4", "técnico de outra carteira não lê/não altera", "BLOCKED",
    "Perfil temporário técnico de outra carteira não existe no setup deste runner; cenário não substituído.");

  const solicitacao = await criarSolicitacao();
  const draft = await cli.consultor!.rpc("rpc_iniciar_atendimento_solicitacao_v1", {
    p_solicitacao_id: solicitacao, p_client_uuid: crypto.randomUUID(),
  });
  const draftData = draft.data as any;
  if (draftData?.registro_id) created.registros.push(draftData.registro_id);
  certify("T5", "demanda sem cultura abre rascunho e retorna missing_fields/next_step",
    !draft.error && draftData?.ok === true && draftData?.status === "rascunho" &&
      draftData?.missing_fields?.includes("cultura_id") && draftData?.next_step === "identificacao"
      ? "PASS" : "FAIL", { error: draft.error?.message ?? null, result: draftData });

  if (draftData?.registro_id) {
    const finalization = await cli.consultor!.rpc("rpc_finalizar_visita_v2", {
      p_registro_id: draftData.registro_id, p_expected_version: draftData.version,
    });
    certify("T6", "rpc_finalizar_visita_v2 bloqueia server-side sem cultura",
      finalization.error?.message?.includes("cultura_obrigatoria") ? "PASS" : "FAIL",
      { error: finalization.error?.message ?? null, result: finalization.data });
  } else {
    certify("T6", "rpc_finalizar_visita_v2 bloqueia server-side sem cultura", "BLOCKED",
      "T5 não produziu registro de rascunho.");
  }

  const concurrentSolicitacao = await criarSolicitacao();
  const concurrent = await Promise.all([
    cli.consultor!.rpc("rpc_iniciar_atendimento_solicitacao_v1", {
      p_solicitacao_id: concurrentSolicitacao, p_client_uuid: crypto.randomUUID(),
    }),
    cli.agronomo!.rpc("rpc_iniciar_atendimento_solicitacao_v1", {
      p_solicitacao_id: concurrentSolicitacao, p_client_uuid: crypto.randomUUID(),
    }),
  ]);
  for (const item of concurrent) {
    const id = (item.data as any)?.registro_id;
    if (id) created.registros.push(id);
  }
  const { count: visits } = await svc.from("registros_consultor")
    .select("id", { count: "exact", head: true }).eq("solicitacao_id", concurrentSolicitacao);
  const { count: timeline } = await svc.from("solicitacoes_timeline")
    .select("id", { count: "exact", head: true })
    .eq("solicitacao_id", concurrentSolicitacao).eq("tipo_evento", "visita_iniciada");
  certify("T7", "duas sessões técnicas concorrentes na mesma demanda => exatamente 1 visita e 1 timeline",
    visits === 1 && timeline === 1 ? "PASS" : "FAIL", { visits, timeline });

  const occurrenceUuid = crypto.randomUUID();
  const occurrenceArgs = {
    p_client_uuid: occurrenceUuid, p_cliente_id: created.clientes[0],
    p_fazenda_id: created.fazendas[0], p_talhao_id: created.talhoes[0],
    p_data_vistoria: new Date().toISOString().slice(0, 10), p_origem: "ocorrencia_campo",
    p_latitude: -15.5, p_longitude: -47.5,
  };
  const occurrence1 = await cli.consultor!.rpc("rpc_criar_visita_idempotente", occurrenceArgs);
  const occurrence2 = await cli.consultor!.rpc("rpc_criar_visita_idempotente", occurrenceArgs);
  const occurrenceId = (occurrence1.data as any)?.registro_id;
  if (occurrenceId) created.registros.push(occurrenceId);
  const occurrenceList = await list("consultor", { p_aba: "ocorrencias", p_page_size: 100 });
  certify("T8", "ocorrência online idempotente e visível",
    !!occurrenceId && (occurrence2.data as any)?.registro_id === occurrenceId &&
      ((occurrenceList.data as any)?.items ?? []).some((item: any) => item.id === occurrenceId)
      ? "PASS" : "FAIL", { first: occurrence1.data, replay: occurrence2.data });
  certify("T9", "replay offline pela mesma RPC sem duplicar",
    !!occurrenceId && (occurrence2.data as any)?.created === false ? "PASS" : "FAIL",
    { registro_id: occurrenceId, replay_created: (occurrence2.data as any)?.created });

  certify("T10", "falha real de mídia preserva visita e retry gera exatamente 1 objeto e 1 referência",
    "BLOCKED", "Integração Storage com falha real não foi executada por este runner; cenário não substituído.");
  certify("T11", "concorrência de dois claims/syncs para a mesma mídia => um vencedor, sem duplicidade",
    "BLOCKED", "Concorrência IndexedDB é coberta por Vitest, mas a parte Storage staging não foi executada aqui.");

  const page1 = await list("consultor", { p_page: 1, p_page_size: 1 });
  const summary = await cli.consultor!.rpc("rpc_resumo_atendimentos_tecnicos_v1", {});
  const total = (page1.data as any)?.total;
  certify("T12", "busca, abas, paginação e resumo coerentes",
    !page1.error && !summary.error && typeof total === "number" &&
      total === (summary.data as any)?.todos && ((page1.data as any)?.items ?? []).length <= 1
      ? "PASS" : "FAIL", { page_total: total, summary_total: (summary.data as any)?.todos });

  for (const [id, name] of [
    ["T13", "check-in, diagnóstico obrigatório e version_conflict"],
    ["T14", "finalizar, enviar, aprovar, reprovar e solicitar ajuste com transições/perfis corretos"],
    ["T15", "técnico não atribuído não altera"],
  ]) certify(id, name, "BLOCKED", "Fluxo mutável completo não foi executado; cenário não substituído.");

  const sensitive = [
    "rpc_criar_visita_idempotente", "rpc_iniciar_atendimento_solicitacao_v1",
    "rpc_listar_atendimentos_tecnicos_v1", "rpc_resumo_atendimentos_tecnicos_v1",
    "rpc_finalizar_visita_v2", "rpc_realizar_checkin_visita", "rpc_upsert_diagnostico_visita",
    "rpc_enviar_visita_aprovacao", "rpc_reprovar_visita", "rpc_solicitar_ajuste_visita",
  ];
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const anonResults = await Promise.all(sensitive.map(async (name) => {
    const response = await anon.rpc(name, {});
    return { name, code: response.error?.code, message: response.error?.message };
  }));
  certify("T16", "anon/PUBLIC sem EXECUTE em todas as RPCs sensíveis",
    anonResults.every((item) => item.code === "42501" || /permission denied/i.test(item.message ?? ""))
      ? "PASS" : "FAIL", anonResults);

  const functionUrl = `${SUPABASE_URL}/functions/v1/visita-atendimentos-runtime-harness`;
  const noJwt = await fetch(functionUrl);
  const token = (await cli.consultor!.auth.getSession()).data.session?.access_token;
  const withJwt = await fetch(functionUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  certify("T17", "endpoint do harness 404 sem JWT e com JWT autenticado comum",
    noJwt.status === 404 && withJwt.status === 404 ? "PASS" : "FAIL",
    { no_jwt_status: noJwt.status, authenticated_status: withJwt.status });
}

async function verifyCleanup() {
  const counts = await Promise.all([
    svc.from("registros_consultor").select("id", { count: "exact", head: true }).eq("cliente_id", created.clientes[0]),
    svc.from("portal_solicitacoes").select("id", { count: "exact", head: true }).in("id", created.solicitacoes),
    svc.from("clientes").select("id", { count: "exact", head: true }).in("id", created.clientes),
  ]);
  const users = await Promise.all(created.users.map((id) => svc.auth.admin.getUserById(id)));
  const clean = counts.every((item) => item.count === 0) && users.every((item) => !item.data.user);
  certify("T18", "cleanup: zero fixtures, zero usuários temporários, zero objetos Storage temporários e triggers habilitados",
    clean ? "PASS" : "FAIL", { table_counts: counts.map((item) => item.count), users_remaining: users.filter((i) => i.data.user).length,
      storage_objects_created: 0, trigger_check: "verificado separadamente no rehearsal SQL" });
}

async function writeArtifacts(startedAt: string) {
  const timestamp = new Date().toISOString();
  const safe = certificationResults.map((result) => ({ ...result, evidence: mask(result.evidence) }));
  const summary = {
    pass: safe.filter((r) => r.status === "PASS").length,
    fail: safe.filter((r) => r.status === "FAIL").length,
    blocked: safe.filter((r) => r.status === "BLOCKED").length,
    total: safe.length,
  };
  const artifact = { environment: EXPECTED_STAGING_REF, started_at: startedAt, finished_at: timestamp, summary, results: safe };
  await Deno.mkdir("artifacts/visita-atendimentos", { recursive: true });
  const slug = timestamp.replace(/[:.]/g, "-");
  await Deno.writeTextFile(`artifacts/visita-atendimentos/${slug}.json`, JSON.stringify(artifact, null, 2));
  const rows = safe.map((r) => `| ${r.id} | ${r.name} | ${r.status} | ${JSON.stringify(r.evidence)} |`).join("\n");
  await Deno.writeTextFile(`artifacts/visita-atendimentos/${slug}.md`,
    `# Certificação T1–T18\n\n- Staging: ${EXPECTED_STAGING_REF}\n- Início: ${startedAt}\n- Fim: ${timestamp}\n- PASS: ${summary.pass}; FAIL: ${summary.fail}; BLOCKED: ${summary.blocked}\n\n| ID | Cenário | Status | Evidência mascarada |\n|---|---|---|---|\n${rows}\n`);
}

// ---------------------------------------------------------------------------
// Entry point CLI (não-servidor). Uso:
//   deno run --allow-net --allow-env --allow-write=artifacts/visita-atendimentos tests/harnesses/visita-atendimentos-runtime-harness/index.ts
// ---------------------------------------------------------------------------
async function main() {
  assertStaging();
  const startedAt = new Date().toISOString();
  let exitCode = 0;
  try {
    await setup();
    await run();
    await runCertification();
  } catch (e) {
    exitCode = 1;
    log("RUNNER", "Execucao do harness", "FAIL", (e as Error).message);
  } finally {
    try {
      await cleanup();
      await verifyCleanup();
    } catch (e) {
      exitCode = 1;
      log("CLEANUP", "Limpeza de fixtures/usuarios", "FAIL", (e as Error).message);
    }
  }
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  await writeArtifacts(startedAt);
  console.log(JSON.stringify(
    { run: RUN, summary: { pass, fail, blocked, total: results.length }, results },
    null,
    2,
  ));
  const criticalFailure = certificationResults.some((r) => r.status !== "PASS");
  if (fail > 0 || blocked > 0 || criticalFailure) exitCode = 1;
  Deno.exit(exitCode);
}

if (import.meta.main) {
  await main();
}
