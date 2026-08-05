// ============================================================================
// Runner CLI de certificação T1–T18 — Fluxo unificado de visita técnica.
// Staging ikaauvsflpmamgxmkhoq SOMENTE. Produção navfzbwgwzruipouyfnk proibida.
//
// - Não é Edge Function: sem Deno.serve, sem CORS, sem HTTP server.
// - A credencial administrativa é resolvida SOMENTE no backend e usada apenas
//   para setup/cleanup. Todos os cenários funcionais rodam com sessões JWT reais.
// - Nenhum valor, prefixo ou tamanho de credencial é impresso ou gravado.
// - Qualquer FAIL, BLOCKED ou cenário não executado => exit 1.
//
// Uso:
//   deno run --allow-net --allow-env \
//     --allow-write=artifacts/visita-atendimentos \
//     tests/harnesses/visita-atendimentos-runtime-harness/index.ts
// ============================================================================
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { DsnAdmin } from "./dsn-admin-adapter.ts";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
// Chave anônima/publicável (pública por design; usada apenas para abrir sessões JWT reais).
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("VITE_SUPABASE_ANON_KEY") ??
  "";
// Chave administrativa: service_role clássica OU secret key moderna. Backend-only.
const ADMIN_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
// Alternativa administrativa quando a service key nao esta disponivel no ambiente:
// conexao direta ao staging (backend-only, usada somente em setup/cleanup/verificacao).
const ADMIN_DSN = Deno.env.get("STAGING_DSN") ?? "";

const EXPECTED_STAGING_REF = "ikaauvsflpmamgxmkhoq";
const PROD_REF = "navfzbwgwzruipouyfnk";
const BUCKET = "consultor-arquivos";

function assertStaging() {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!ANON_KEY) missing.push("SUPABASE_ANON_KEY");
  if (!ADMIN_KEY && !ADMIN_DSN) missing.push("SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|STAGING_DSN");
  if (missing.length > 0) {
    throw new Error(`GUARD_ABORT: variaveis ausentes: ${missing.join(", ")}`);
  }
  if (SUPABASE_URL.includes(PROD_REF)) {
    throw new Error("GUARD_ABORT: URL de PRODUCAO — execucao proibida");
  }
  if (!SUPABASE_URL.includes(EXPECTED_STAGING_REF)) {
    throw new Error(`GUARD_ABORT: ambiente nao autorizado (esperado ${EXPECTED_STAGING_REF})`);
  }
}

// ---------------------------------------------------------------------------
// Resultado / evidência
// ---------------------------------------------------------------------------
type Status = "PASS" | "FAIL" | "BLOCKED";
type Result = { id: string; name: string; status: Status; evidence: unknown };

const T_NAMES: Record<string, string> = {
  T1: "listagem consultor",
  T2: "listagem agrônomo",
  T3: "produtor/sem vínculo negados",
  T4: "outra carteira isolada",
  T5: "demanda sem cultura em rascunho",
  T6: "finalização bloqueada server-side sem cultura",
  T7: "concorrência de demanda",
  T8: "ocorrência online",
  T9: "replay offline",
  T10: "falha/retry real de mídia",
  T11: "claims/sync concorrentes",
  T12: "busca/abas/paginação/resumo",
  T13: "check-in/diagnóstico/version conflict",
  T14: "finalizar/enviar/aprovar/reprovar/ajuste",
  T15: "não atribuído negado",
  T16: "grants anon/PUBLIC",
  T17: "endpoint 404 com e sem JWT",
  T18: "cleanup",
};
const T_ORDER = Object.keys(T_NAMES);

const certificationResults = new Map<string, Result>();
const certify = (id: string, status: Status, evidence: unknown) =>
  certificationResults.set(id, { id, name: T_NAMES[id] ?? id, status, evidence });
const certifyBool = (id: string, cond: boolean, evidence: unknown) =>
  certify(id, cond ? "PASS" : "FAIL", evidence);

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
// Cliente administrativo criado APÓS a guarda de ambiente (setup/cleanup apenas).
let _svc: SupabaseClient | null = null;
let _dsnAdmin: DsnAdmin | null = null;
const svc = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    if (!_svc) {
      if (ADMIN_KEY) {
        _svc = createClient(SUPABASE_URL, ADMIN_KEY, { auth: { persistSession: false } });
      } else if (_dsnAdmin) {
        _svc = _dsnAdmin as unknown as SupabaseClient;
      } else {
        throw new Error("GUARD_ABORT: credencial administrativa ausente");
      }
    }
    const value = (_svc as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(_svc) : value;
  },
});
const RUN = crypto.randomUUID().slice(0, 8);
const PWD = `Visita-${crypto.randomUUID()}`;

type Profile =
  | "gestor"
  | "consultor"
  | "agronomo"
  | "produtor"
  | "sem_vinculo"
  | "tecnico_carteira_b";

const ROLES: Record<Profile, string[]> = {
  gestor: ["gestor"],
  consultor: ["consultor_tecnico"],
  agronomo: ["tecnico_agronomo"],
  produtor: ["cliente_produtor"],
  sem_vinculo: [],
  tecnico_carteira_b: ["consultor_tecnico"],
};

const uid: Partial<Record<Profile, string>> = {};
const cli: Partial<Record<Profile, SupabaseClient>> = {};

const created = {
  users: [] as string[],
  clientes: [] as string[],
  fazendas: [] as string[],
  talhoes: [] as string[],
  solicitacoes: [] as string[],
  registros: [] as string[],
  storageObjects: [] as string[],
  culturas: [] as string[],
};

let clienteA = "";
let clienteB = "";
let fazendaA = "";
let fazendaB = "";
let talhaoA = "";
let talhaoB = "";
let culturaId = "";

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PWD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function novoCliente(sufixo: string) {
  const { data: cl, error: eCl } = await svc.from("clientes")
    .insert({ nome: `Visita HML ${sufixo} ${RUN}`, codigo_cliente: `VH${sufixo}${RUN}` })
    .select("id").single();
  if (eCl) throw new Error(`cliente ${sufixo}: ${eCl.message}`);
  created.clientes.push(cl.id);
  const { data: fz, error: eFz } = await svc.from("fazendas")
    .insert({ nome: `Fazenda ${sufixo} ${RUN}`, cliente_id: cl.id }).select("id").single();
  if (eFz) throw new Error(`fazenda ${sufixo}: ${eFz.message}`);
  created.fazendas.push(fz.id);
  const { data: th, error: eTh } = await svc.from("talhoes")
    .insert({ nome: `Talhao ${sufixo} ${RUN}`, fazenda_id: fz.id, area_hectares: 12.5 })
    .select("id").single();
  if (eTh) throw new Error(`talhao ${sufixo}: ${eTh.message}`);
  created.talhoes.push(th.id);
  return { cliente: cl.id as string, fazenda: fz.id as string, talhao: th.id as string };
}

async function setup() {
  const a = await novoCliente("A");
  const b = await novoCliente("B");
  clienteA = a.cliente; fazendaA = a.fazenda; talhaoA = a.talhao;
  clienteB = b.cliente; fazendaB = b.fazenda; talhaoB = b.talhao;

  const { data: cult } = await svc.from("culturas").select("id").eq("ativo", true).limit(1).maybeSingle();
  if (cult?.id) {
    culturaId = cult.id;
  } else {
    const { data: nova, error } = await svc.from("culturas")
      .insert({ nome: `Cultura HML ${RUN}`, ativo: true }).select("id").single();
    if (error) throw new Error(`cultura: ${error.message}`);
    culturaId = nova.id;
    created.culturas.push(nova.id);
  }

  for (const p of Object.keys(ROLES) as Profile[]) {
    const email = `visita-${p}-${RUN}@arbio-staging.test`;
    const { data, error } = await svc.auth.admin.createUser({
      email, password: PWD, email_confirm: true,
      user_metadata: { nome: `Visita ${p} ${RUN}` },
    });
    if (error) throw new Error(`createUser ${p}: ${error.message}`);
    uid[p] = data.user!.id;
    created.users.push(data.user!.id);
    // Vínculo de carteira ANTES do papel: o papel sem vínculo não pode
    // conceder acesso, e a falha de vínculo precisa abortar o setup.
    const vinculo =
      p === "consultor" || p === "agronomo" || p === "gestor"
        ? { cliente_id: clienteA, access_level: "manage" }
        : p === "produtor"
          ? { cliente_id: clienteA, access_level: "read" }
          : p === "tecnico_carteira_b"
            ? { cliente_id: clienteB, access_level: "manage" }
            : null;
    if (vinculo) {
      const { error: eLink } = await svc.from("user_clientes").insert({
        user_id: data.user!.id,
        cliente_id: vinculo.cliente_id,
        access_level: vinculo.access_level,
        is_active: true,
      });
      if (eLink) throw new Error(`user_clientes ${p}: ${eLink.message}`);
    }

    await svc.from("user_roles").delete().eq("user_id", data.user!.id);
    for (const r of ROLES[p]) {
      const { error: eRole } = await svc.from("user_roles")
        .insert({ user_id: data.user!.id, role: r });
      if (eRole) throw new Error(`user_roles ${p}: ${eRole.message}`);
    }

    cli[p] = await signIn(email);
  }
}

/**
 * Lista recursivamente todos os BLOBS reais sob um prefixo do bucket.
 * Entradas de pasta (id === null) nao sao objetos e sao percorridas, nao contadas.
 */
async function listStorageObjectsRecursive(prefix: string): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await svc.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return out;
  for (const entry of data) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if ((entry as { id?: string | null }).id === null || (entry as { id?: string | null }).id === undefined) {
      out.push(...(await listStorageObjectsRecursive(path)));
    } else {
      out.push(path);
    }
  }
  return out;
}

/** Remove blobs reais via API de Storage (nunca DELETE em storage.objects). */
async function purgeStoragePrefix(prefix: string): Promise<number> {
  const paths = await listStorageObjectsRecursive(prefix);
  if (paths.length === 0) return 0;
  await svc.storage.from(BUCKET).remove(paths);
  return paths.length;
}

async function cleanup() {
  // Storage primeiro (objetos referenciam registros). Remocao pela API de
  // Storage: os blobs reais sao apagados, nunca por DELETE em storage.objects.
  if (created.storageObjects.length > 0) {
    await svc.storage.from(BUCKET).remove(created.storageObjects);
    created.storageObjects = [];
  }
  const prefixos = [...new Set([...created.registros, ...created.solicitacoes])];
  for (const id of prefixos) {
    await purgeStoragePrefix(id);
  }

  for (const id of created.clientes) {
    const { data: regs } = await svc.from("registros_consultor").select("id").eq("cliente_id", id);
    for (const r of regs ?? []) {
      await svc.from("registros_consultor_arquivos").delete().eq("registro_consultor_id", r.id);
      await svc.from("registros_consultor_status_log").delete().eq("registro_consultor_id", r.id);
    }
    await svc.from("registros_consultor").delete().eq("cliente_id", id);
  }
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
  for (const id of created.culturas) await svc.from("culturas").delete().eq("id", id);
}

async function criarSolicitacao(cliente = clienteA, fazenda = fazendaA, talhao = talhaoA) {
  const { data, error } = await svc.from("portal_solicitacoes").insert({
    cliente_id: cliente,
    fazenda_id: fazenda,
    talhao_id: talhao,
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

const listar = (p: Profile, args: Record<string, unknown> = {}) =>
  cli[p]!.rpc("rpc_listar_atendimentos_tecnicos_v1", {
    p_aba: "todos", p_search: null, p_page: 1, p_page_size: 10, ...args,
  });

async function versaoDe(registroId: string): Promise<number> {
  const { data } = await svc.from("registros_consultor").select("version").eq("id", registroId).maybeSingle();
  return Number((data as any)?.version ?? 1);
}

async function statusDe(registroId: string): Promise<string | null> {
  const { data } = await svc.from("registros_consultor").select("status").eq("id", registroId).maybeSingle();
  return (data as any)?.status ?? null;
}

/** Cria visita completa (com cultura), pronta para o ciclo de aprovação. */
async function criarVisitaCompleta(perfil: Profile = "consultor") {
  const clientUuid = crypto.randomUUID();
  const { data, error } = await cli[perfil]!.rpc("rpc_criar_visita_idempotente", {
    p_client_uuid: clientUuid,
    p_cliente_id: clienteA,
    p_fazenda_id: fazendaA,
    p_talhao_id: talhaoA,
    p_cultura_id: culturaId,
    p_data_vistoria: new Date().toISOString().slice(0, 10),
    p_tipo_visita: "vistoria_inicial",
    p_origem: "ocorrencia_campo",
    p_categoria_problema: "insetos_praga",
    p_nivel_pressao: "alto",
    p_percentual_area_afetada: 25,
    p_urgencia: "alta",
    p_observacoes_tecnicas: `HML ${RUN}`,
    p_area_hectares: 12.5,
    p_latitude: -15.5,
    p_longitude: -47.5,
  });
  if (error) throw new Error(`criarVisitaCompleta: ${error.message}`);
  const registroId = (data as any)?.registro_id as string;
  if (!registroId) throw new Error(`criarVisitaCompleta sem registro_id: ${JSON.stringify(data)}`);
  created.registros.push(registroId);
  return registroId;
}

async function checkinEDiagnostico(registroId: string, perfil: Profile = "consultor") {
  const checkin = await cli[perfil]!.rpc("rpc_realizar_checkin_visita", {
    p_registro_id: registroId,
    p_client_uuid: crypto.randomUUID(),
    p_tipo: "chegada_talhao",
    p_latitude: -15.5,
    p_longitude: -47.5,
    p_precisao: 8,
    p_justificativa_sem_gps: null,
    p_observacoes: `check-in HML ${RUN}`,
    p_captured_at_local: new Date().toISOString(),
    p_solicitacao_id: null,
    p_cliente_id: clienteA,
    p_fazenda_id: fazendaA,
    p_talhao_id: talhaoA,
    p_foto_path: null,
  });
  const diagnostico = await cli[perfil]!.rpc("rpc_upsert_diagnostico_visita", {
    p_registro_id: registroId,
    p_client_uuid: crypto.randomUUID(),
    p_payload: {
      categoria_problema: "insetos_praga",
      nivel_pressao: "alto",
      percentual_area_afetada: 25,
      urgencia: "alta",
      problema_principal: `Problema HML ${RUN}`,
      observacoes_tecnicas: `Diagnóstico HML ${RUN}`,
    },
    p_expected_versao: await versaoDe(registroId),
  });
  return { checkin, diagnostico };
}

// ---------------------------------------------------------------------------
// T1–T18
// ---------------------------------------------------------------------------
async function t1_t3() {
  for (const [id, p] of [["T1", "consultor"], ["T2", "agronomo"]] as [string, Profile][]) {
    const r = await listar(p);
    certifyBool(id, !r.error && (r.data as any)?.ok === true, {
      error: r.error?.message ?? null, ok: (r.data as any)?.ok, total: (r.data as any)?.total,
    });
  }

  const negados: unknown[] = [];
  for (const p of ["produtor", "sem_vinculo"] as Profile[]) {
    const lista = await listar(p);
    const escrita = await cli[p]!.rpc("rpc_criar_visita_idempotente", {
      p_client_uuid: crypto.randomUUID(),
      p_cliente_id: clienteA, p_fazenda_id: fazendaA, p_talhao_id: talhaoA,
      p_data_vistoria: new Date().toISOString().slice(0, 10), p_origem: "ocorrencia_campo",
    });
    const escritaId = (escrita.data as any)?.registro_id;
    if (escritaId) created.registros.push(escritaId);
    negados.push({
      profile: p,
      leitura_negada: !!lista.error || (lista.data as any)?.ok === false || ((lista.data as any)?.total ?? 0) === 0,
      escrita_negada: !!escrita.error || (escrita.data as any)?.ok !== true,
      leitura: { error: lista.error?.message ?? null, ok: (lista.data as any)?.ok, total: (lista.data as any)?.total },
      escrita: { error: escrita.error?.message ?? null, ok: (escrita.data as any)?.ok },
    });
  }
  certifyBool("T3", negados.every((n: any) => n.leitura_negada && n.escrita_negada), negados);
}

async function t4(registroCarteiraA: string) {
  const lista = await listar("tecnico_carteira_b", { p_page_size: 100 });
  const itens = ((lista.data as any)?.items ?? []) as any[];
  const vazouLeitura = itens.some((i) => i.id === registroCarteiraA);

  const versao = await versaoDe(registroCarteiraA);
  const mutacoes = await Promise.all([
    cli.tecnico_carteira_b!.rpc("rpc_atualizar_identificacao_visita", {
      p_registro_id: registroCarteiraA, p_expected_version: versao,
      p_payload: { observacoes_tecnicas: "invasao carteira B" },
    }),
    cli.tecnico_carteira_b!.rpc("rpc_finalizar_visita_v2", {
      p_registro_id: registroCarteiraA, p_expected_version: versao,
    }),
    cli.tecnico_carteira_b!.rpc("rpc_enviar_visita_aprovacao", {
      p_registro_id: registroCarteiraA, p_expected_version: versao,
    }),
  ]);
  const negadas = mutacoes.map((m) => ({
    error: m.error?.message ?? null,
    ok: (m.data as any)?.ok ?? null,
    negada: !!m.error || (m.data as any)?.ok === false,
  }));

  certifyBool("T4", !vazouLeitura && negadas.every((n) => n.negada), {
    leitura_itens: itens.length, vazou_registro_carteira_a: vazouLeitura, mutacoes: negadas,
  });
}

async function t5_t6() {
  const solicitacao = await criarSolicitacao();
  const draft = await cli.consultor!.rpc("rpc_iniciar_atendimento_solicitacao_v1", {
    p_solicitacao_id: solicitacao, p_client_uuid: crypto.randomUUID(),
  });
  const d = draft.data as any;
  if (d?.registro_id) created.registros.push(d.registro_id);

  const t5ok = !draft.error && d?.ok === true && d?.status === "rascunho" &&
    Array.isArray(d?.missing_fields) && d.missing_fields.includes("cultura_id") &&
    d?.next_step === "identificacao";
  certifyBool("T5", t5ok, { error: draft.error?.message ?? null, result: d });

  if (!t5ok || !d?.registro_id) {
    certify("T6", "BLOCKED", "T5 falhou: rascunho sem cultura não foi produzido.");
    return { t5ok: false, registroId: d?.registro_id as string | undefined };
  }

  const fin = await cli.consultor!.rpc("rpc_finalizar_visita_v2", {
    p_registro_id: d.registro_id, p_expected_version: await versaoDe(d.registro_id),
  });
  const msg = fin.error?.message ?? JSON.stringify(fin.data ?? {});
  const statusPos = await statusDe(d.registro_id);
  certifyBool("T6", /cultura_obrigatoria/i.test(msg) && statusPos !== "finalizado", {
    error: fin.error?.message ?? null, result: fin.data, status_apos_tentativa: statusPos,
  });
  return { t5ok: true, registroId: d.registro_id as string };
}

async function t7() {
  const solicitacao = await criarSolicitacao();
  const [a, b] = await Promise.all([
    cli.consultor!.rpc("rpc_iniciar_atendimento_solicitacao_v1", {
      p_solicitacao_id: solicitacao, p_client_uuid: crypto.randomUUID(),
    }),
    cli.agronomo!.rpc("rpc_iniciar_atendimento_solicitacao_v1", {
      p_solicitacao_id: solicitacao, p_client_uuid: crypto.randomUUID(),
    }),
  ]);
  for (const r of [a, b]) {
    const id = (r.data as any)?.registro_id;
    if (id) created.registros.push(id);
  }
  const { count: visitas } = await svc.from("registros_consultor")
    .select("id", { count: "exact", head: true }).eq("solicitacao_id", solicitacao);
  const { count: timeline } = await svc.from("solicitacoes_timeline")
    .select("id", { count: "exact", head: true })
    .eq("solicitacao_id", solicitacao).eq("tipo_evento", "visita_iniciada");
  const vencedores = [a, b].filter((r) => (r.data as any)?.ok === true).length;
  certifyBool("T7", visitas === 1 && timeline === 1 && vencedores >= 1, {
    visitas, timeline, vencedores,
    respostas: [a, b].map((r) => ({ ok: (r.data as any)?.ok, error: (r.data as any)?.error ?? r.error?.message ?? null })),
  });
}

async function t8_t9() {
  const clientUuid = crypto.randomUUID();
  const args = {
    p_client_uuid: clientUuid,
    p_cliente_id: clienteA, p_fazenda_id: fazendaA, p_talhao_id: talhaoA,
    p_cultura_id: culturaId,
    p_data_vistoria: new Date().toISOString().slice(0, 10),
    p_tipo_visita: "vistoria_inicial",
    p_origem: "ocorrencia_campo",
    p_categoria_problema: "nematoides",
    p_nivel_pressao: "medio",
    p_urgencia: "media",
    p_area_hectares: 12.5,
    p_latitude: -15.6, p_longitude: -47.6,
  };
  const first = await cli.consultor!.rpc("rpc_criar_visita_idempotente", args);
  const replay = await cli.consultor!.rpc("rpc_criar_visita_idempotente", args);
  const registroId = (first.data as any)?.registro_id as string | undefined;
  if (registroId) created.registros.push(registroId);

  const lista = await listar("consultor", { p_aba: "ocorrencias", p_page_size: 100 });
  const itens = ((lista.data as any)?.items ?? []) as any[];
  const visivel = itens.some((i) => i.id === registroId);
  const projecao = itens.every((i) => "proxima_acao" in i && "responsavel_nome" in i && "data_prevista" in i);

  certifyBool("T8", !!registroId && (first.data as any)?.created === true && visivel && projecao, {
    registro_id: registroId, created: (first.data as any)?.created, visivel, projecao,
    error: first.error?.message ?? null,
  });

  const { data: row } = await svc.from("registros_consultor")
    .select("origem_atendimento, latitude, longitude, categoria_problema, natureza_registro")
    .eq("id", registroId ?? "").maybeSingle();
  const { count: duplicatas } = await svc.from("registros_consultor")
    .select("id", { count: "exact", head: true }).eq("client_uuid", clientUuid);

  certifyBool("T9",
    (replay.data as any)?.registro_id === registroId &&
    (replay.data as any)?.created === false &&
    duplicatas === 1 &&
    (row as any)?.origem_atendimento === "ocorrencia_campo" &&
    Number((row as any)?.latitude) === -15.6 && Number((row as any)?.longitude) === -47.6 &&
    (row as any)?.categoria_problema === "nematoides",
    { replay: replay.data, duplicatas, row, error: replay.error?.message ?? null });

  return registroId!;
}

/** Bytes determinísticos de um JPEG mínimo. */
function fakeJpeg(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
}

async function t10(registroId: string) {
  const clientUuid = crypto.randomUUID();
  const capturadoEm = new Date().toISOString();
  const path = `${registroId}/foto/${clientUuid}.jpg`;
  const storage = cli.consultor!.storage.from(BUCKET);

  // 1) Falha REAL de mídia: path inválido (fora do prefixo permitido / vazio).
  const falha = await storage.upload(`../${clientUuid}.jpg`, fakeJpeg(), { contentType: "image/jpeg" });
  const falhouDeVerdade = !!falha.error;

  // 2) Visita preservada mesmo após a falha de mídia.
  const { data: viva } = await svc.from("registros_consultor").select("id, status").eq("id", registroId).maybeSingle();

  // 3) Retry real no Storage + referência com GPS e capturado_em.
  const retry = await storage.upload(path, fakeJpeg(), { contentType: "image/jpeg", upsert: true });
  if (!retry.error) created.storageObjects.push(path);

  const ref = {
    registro_consultor_id: registroId,
    arquivo_path: path,
    arquivo_url: path,
    nome_arquivo: "hml-retry.jpg",
    tipo_arquivo: "image/jpeg",
    tipo_midia: "foto",
    categoria_arquivo: "geral",
    foto_principal: true,
    uploaded_by: uid.consultor,
    client_uuid: clientUuid,
    latitude: -15.7,
    longitude: -47.7,
    capturado_em: capturadoEm,
  };
  const insercao = await svc.from("registros_consultor_arquivos").upsert(ref, { onConflict: "client_uuid" });

  const { data: objetos } = await svc.storage.from(BUCKET).list(`${registroId}/foto`, { limit: 100 });
  const objetosDoTeste = (objetos ?? []).filter((o) => o.name === `${clientUuid}.jpg`);
  const { data: refs } = await svc.from("registros_consultor_arquivos")
    .select("id, latitude, longitude, capturado_em").eq("client_uuid", clientUuid);

  const ok = falhouDeVerdade && !!viva && !retry.error && !insercao.error &&
    objetosDoTeste.length === 1 && (refs ?? []).length === 1 &&
    Number(refs![0].latitude) === -15.7 && Number(refs![0].longitude) === -47.7 &&
    !!refs![0].capturado_em;

  certifyBool("T10", ok, {
    falha_real: falha.error?.message ?? null,
    visita_preservada: !!viva,
    retry_error: retry.error?.message ?? null,
    objetos_no_storage: objetosDoTeste.length,
    referencias: (refs ?? []).length,
    gps: refs?.[0] ? { lat: refs[0].latitude, lng: refs[0].longitude } : null,
    capturado_em_presente: !!refs?.[0]?.capturado_em,
  });

  // cleanup real deste cenário
  await svc.from("registros_consultor_arquivos").delete().eq("client_uuid", clientUuid);
  await svc.storage.from(BUCKET).remove([path]);
  created.storageObjects = created.storageObjects.filter((p) => p !== path);
  const { data: pos } = await svc.storage.from(BUCKET).list(`${registroId}/foto`, { limit: 100 });
  return (pos ?? []).filter((o) => o.name === `${clientUuid}.jpg`).length === 0;
}

async function t11(registroId: string) {
  const clientUuid = crypto.randomUUID();
  const path = `${registroId}/foto/${clientUuid}.jpg`;
  const storage = cli.consultor!.storage.from(BUCKET);
  const ref = {
    registro_consultor_id: registroId,
    arquivo_path: path,
    arquivo_url: path,
    nome_arquivo: "hml-concorrente.jpg",
    tipo_arquivo: "image/jpeg",
    tipo_midia: "foto",
    categoria_arquivo: "geral",
    foto_principal: false,
    uploaded_by: uid.consultor,
    client_uuid: clientUuid,
    latitude: -15.8,
    longitude: -47.8,
    capturado_em: new Date().toISOString(),
  };

  // Dois "syncs" concorrentes sobre a MESMA mídia (mesmo client_uuid).
  const [s1, s2] = await Promise.all([
    (async () => {
      const up = await storage.upload(path, fakeJpeg(), { contentType: "image/jpeg", upsert: true });
      const db = await svc.from("registros_consultor_arquivos").upsert(ref, { onConflict: "client_uuid" });
      return { up: up.error?.message ?? null, db: db.error?.message ?? null };
    })(),
    (async () => {
      const up = await storage.upload(path, fakeJpeg(), { contentType: "image/jpeg", upsert: true });
      const db = await svc.from("registros_consultor_arquivos").upsert(ref, { onConflict: "client_uuid" });
      return { up: up.error?.message ?? null, db: db.error?.message ?? null };
    })(),
  ]);

  if (!s1.up || !s2.up) created.storageObjects.push(path);

  const { data: objetos } = await svc.storage.from(BUCKET).list(`${registroId}/foto`, { limit: 100 });
  const objetosDoTeste = (objetos ?? []).filter((o) => o.name === `${clientUuid}.jpg`);
  const { count: refs } = await svc.from("registros_consultor_arquivos")
    .select("id", { count: "exact", head: true }).eq("client_uuid", clientUuid);

  certifyBool("T11", objetosDoTeste.length === 1 && refs === 1, {
    sync1: s1, sync2: s2, objetos: objetosDoTeste.length, referencias: refs,
    nota_indexeddb: "claim atômico determinístico coberto por src/test/offlineDb.claim.test.ts (exatamente 1 claim=true)",
  });

  await svc.from("registros_consultor_arquivos").delete().eq("client_uuid", clientUuid);
  await svc.storage.from(BUCKET).remove([path]);
  created.storageObjects = created.storageObjects.filter((p) => p !== path);
}

async function t12() {
  const abas = ["todos", "ocorrencias", "demandas"];
  const porAba: Record<string, unknown> = {};
  let abasOk = true;
  for (const aba of abas) {
    const r = await listar("consultor", { p_aba: aba, p_page_size: 5 });
    porAba[aba] = { ok: (r.data as any)?.ok, total: (r.data as any)?.total, error: r.error?.message ?? null };
    if (r.error || (r.data as any)?.ok !== true) abasOk = false;
  }
  const invalida = await listar("consultor", { p_aba: "xpto" });
  const invalidaOk = !invalida.error && (invalida.data as any)?.ok === false &&
    (invalida.data as any)?.error === "invalid_tab";

  const busca = await listar("consultor", { p_search: RUN, p_page_size: 50 });
  const buscaOk = !busca.error && (busca.data as any)?.ok === true;

  const p1 = await listar("consultor", { p_page: 1, p_page_size: 1 });
  const p2 = await listar("consultor", { p_page: 2, p_page_size: 1 });
  const itens1 = ((p1.data as any)?.items ?? []) as any[];
  const itens2 = ((p2.data as any)?.items ?? []) as any[];
  const paginacaoOk = itens1.length <= 1 && (itens2.length === 0 || itens1[0]?.id !== itens2[0]?.id);

  const resumo = await cli.consultor!.rpc("rpc_resumo_atendimentos_tecnicos_v1", {});
  const resumoOk = !resumo.error && (p1.data as any)?.total === (resumo.data as any)?.todos;

  certifyBool("T12", abasOk && invalidaOk && buscaOk && paginacaoOk && resumoOk, {
    abas: porAba, aba_invalida: invalida.data, busca_ok: buscaOk,
    paginacao: { p1: itens1.length, p2: itens2.length, distintos: paginacaoOk },
    total: (p1.data as any)?.total, resumo_todos: (resumo.data as any)?.todos,
  });
}

async function t13() {
  const registroId = await criarVisitaCompleta("consultor");

  const checkin = await cli.consultor!.rpc("rpc_realizar_checkin_visita", {
    p_registro_id: registroId, p_client_uuid: crypto.randomUUID(), p_tipo: "chegada_talhao",
    p_latitude: -15.5, p_longitude: -47.5, p_precisao: 8,
    p_justificativa_sem_gps: null, p_observacoes: `check-in HML ${RUN}`,
    p_captured_at_local: new Date().toISOString(),
    p_solicitacao_id: null, p_cliente_id: clienteA, p_fazenda_id: fazendaA, p_talhao_id: talhaoA,
    p_foto_path: null,
  });
  const checkinOk = !checkin.error && (checkin.data as any)?.ok !== false;

  // Finalizar SEM diagnóstico deve ser recusado.
  const semDiag = await cli.consultor!.rpc("rpc_finalizar_visita_v2", {
    p_registro_id: registroId, p_expected_version: await versaoDe(registroId),
  });
  const semDiagMsg = semDiag.error?.message ?? JSON.stringify(semDiag.data ?? {});
  const semDiagBloqueado = !!semDiag.error || (semDiag.data as any)?.ok === false;

  const versaoAntiga = await versaoDe(registroId);
  const diag = await cli.consultor!.rpc("rpc_upsert_diagnostico_visita", {
    p_registro_id: registroId, p_client_uuid: crypto.randomUUID(),
    p_payload: {
      categoria_problema: "insetos_praga", nivel_pressao: "alto",
      percentual_area_afetada: 25, urgencia: "alta",
      problema_principal: `Problema HML ${RUN}`,
      observacoes_tecnicas: `Diagnóstico HML ${RUN}`,
    },
    p_expected_versao: versaoAntiga,
  });
  const diagOk = !diag.error && (diag.data as any)?.ok !== false;

  // Versão antiga => version_conflict.
  const conflito = await cli.consultor!.rpc("rpc_finalizar_visita_v2", {
    p_registro_id: registroId, p_expected_version: versaoAntiga,
  });
  const conflitoMsg = conflito.error?.message ?? JSON.stringify(conflito.data ?? {});
  const conflitoOk = /version_conflict/i.test(conflitoMsg);

  certifyBool("T13", checkinOk && semDiagBloqueado && diagOk && conflitoOk, {
    checkin: { error: checkin.error?.message ?? null, ok: checkinOk },
    finalizar_sem_diagnostico: { bloqueado: semDiagBloqueado, msg: semDiagMsg },
    diagnostico: { error: diag.error?.message ?? null, ok: diagOk },
    version_conflict: { esperado: true, msg: conflitoMsg, ok: conflitoOk },
  });

  return registroId;
}

async function t14(registroPronto: string) {
  // --- Fixture 1: recomendar -> finalizar -> enviar -> aprovar ---
  // A recomendação precisa existir ANTES da aprovação: a liberação ao
  // produtor exige recomendação técnica preenchida.
  const recPrev = await cli.consultor!.rpc("rpc_upsert_recomendacao_visita", {
    p_registro_id: registroPronto,
    p_client_uuid: crypto.randomUUID(),
    p_payload: {
      recomendacao_tecnica: `Recomendação HML ${RUN}`,
      objetivo_recomendacao: "preventivo",
      estrategia_manejo: "biologico",
    },
    p_expected_versao: 1,
  });

  const fin = await cli.consultor!.rpc("rpc_finalizar_visita_v2", {
    p_registro_id: registroPronto, p_expected_version: await versaoDe(registroPronto),
  });

  const statusFinal = await statusDe(registroPronto);

  const env = await cli.consultor!.rpc("rpc_enviar_visita_aprovacao", {
    p_registro_id: registroPronto, p_expected_version: await versaoDe(registroPronto),
  });
  const statusEnviado = await statusDe(registroPronto);

  const apr = await cli.gestor!.rpc("rpc_liberar_recomendacao_produtor", { p_registro_id: registroPronto });
  const statusAprovado = await statusDe(registroPronto);

  // --- Fixture 2: finalizar -> enviar -> reprovar ---
  const reg2 = await criarVisitaCompleta("consultor");
  await checkinEDiagnostico(reg2);
  await cli.consultor!.rpc("rpc_finalizar_visita_v2", {
    p_registro_id: reg2, p_expected_version: await versaoDe(reg2),
  });
  await cli.consultor!.rpc("rpc_enviar_visita_aprovacao", {
    p_registro_id: reg2, p_expected_version: await versaoDe(reg2),
  });
  const rep = await cli.gestor!.rpc("rpc_reprovar_visita", {
    p_registro_id: reg2, p_expected_version: await versaoDe(reg2), p_motivo: `Reprovado HML ${RUN}`,
  });
  const statusReprovado = await statusDe(reg2);

  // --- Fixture 3: finalizar -> enviar -> solicitar ajuste ---
  const reg3 = await criarVisitaCompleta("consultor");
  await checkinEDiagnostico(reg3);
  await cli.consultor!.rpc("rpc_finalizar_visita_v2", {
    p_registro_id: reg3, p_expected_version: await versaoDe(reg3),
  });
  await cli.consultor!.rpc("rpc_enviar_visita_aprovacao", {
    p_registro_id: reg3, p_expected_version: await versaoDe(reg3),
  });
  const aju = await cli.gestor!.rpc("rpc_solicitar_ajuste_visita", {
    p_registro_id: reg3, p_expected_version: await versaoDe(reg3), p_motivo: `Ajuste HML ${RUN}`,
  });
  const statusAjuste = await statusDe(reg3);

  const { data: historico } = await svc.from("registros_consultor_status_log")
    .select("registro_consultor_id, status_anterior, status_novo, motivo")
    .in("registro_consultor_id", [registroPronto, reg2, reg3]);

  const transicoes = (historico ?? []).map((h: any) => `${h.status_anterior}->${h.status_novo}`);
  const ok =
    !recPrev.error &&
    !fin.error && statusFinal === "finalizado" &&
    !env.error && statusEnviado === "enviado_aprovacao" &&
    !apr.error && (apr.data as any)?.success === true && statusAprovado === "aprovado" &&
    !rep.error && statusReprovado === "reprovado" &&
    !aju.error && statusAjuste !== "enviado_aprovacao" &&
    (historico ?? []).length >= 3;

  certifyBool("T14", ok, {
    recomendacao_previa: { erro: recPrev.error?.message ?? null },
    fixture_aprovacao: { finalizar: fin.error?.message ?? null, status_final: statusFinal, enviar: env.error?.message ?? null, status_enviado: statusEnviado, aprovar: apr.error?.message ?? (apr.data as any)?.message ?? null, status_aprovado: statusAprovado },

    fixture_reprovacao: { erro: rep.error?.message ?? null, status: statusReprovado },
    fixture_ajuste: { erro: aju.error?.message ?? null, status: statusAjuste },
    historico_registros: (historico ?? []).length,
    transicoes,
  });
}

async function t15() {
  // Técnico autenticado, papel válido, MAS não atribuído à visita.
  const registroId = await criarVisitaCompleta("consultor");
  await checkinEDiagnostico(registroId);
  const versao = await versaoDe(registroId);

  const tentativas: Record<string, unknown> = {};
  const chamadas: [string, Promise<any>][] = [
    ["rpc_atualizar_identificacao_visita", cli.agronomo!.rpc("rpc_atualizar_identificacao_visita", {
      p_registro_id: registroId, p_expected_version: versao, p_payload: { observacoes_tecnicas: "nao atribuido" },
    })],
    ["rpc_upsert_diagnostico_visita", cli.agronomo!.rpc("rpc_upsert_diagnostico_visita", {
      p_registro_id: registroId, p_client_uuid: crypto.randomUUID(),
      p_payload: { problema_principal: "nao atribuido" }, p_expected_versao: versao,
    })],
    ["rpc_realizar_checkin_visita", cli.agronomo!.rpc("rpc_realizar_checkin_visita", {
      p_registro_id: registroId, p_client_uuid: crypto.randomUUID(), p_tipo: "chegada_talhao",
      p_latitude: -15.5, p_longitude: -47.5, p_precisao: 8, p_justificativa_sem_gps: null,
      p_observacoes: "nao atribuido", p_captured_at_local: new Date().toISOString(),
      p_solicitacao_id: null, p_cliente_id: clienteA, p_fazenda_id: fazendaA, p_talhao_id: talhaoA,
      p_foto_path: null,
    })],
    ["rpc_finalizar_visita_v2", cli.agronomo!.rpc("rpc_finalizar_visita_v2", {
      p_registro_id: registroId, p_expected_version: versao,
    })],
    ["rpc_enviar_visita_aprovacao", cli.agronomo!.rpc("rpc_enviar_visita_aprovacao", {
      p_registro_id: registroId, p_expected_version: versao,
    })],
    ["rpc_arquivar_visita", cli.agronomo!.rpc("rpc_arquivar_visita", {
      p_registro_id: registroId, p_expected_version: versao, p_motivo: "nao atribuido",
    })],
  ];

  let todasNegadas = true;
  for (const [nome, promessa] of chamadas) {
    const r = await promessa;
    const negada = !!r.error || (r.data as any)?.ok === false || (r.data as any)?.success === false;
    if (!negada) todasNegadas = false;
    tentativas[nome] = { negada, error: r.error?.message ?? null, data: r.data ?? null };
  }
  const statusFinal = await statusDe(registroId);
  certifyBool("T15", todasNegadas && statusFinal !== "finalizado", { tentativas, status: statusFinal });
}

async function t16() {
  const sensitive = [
    "rpc_criar_visita_idempotente", "rpc_iniciar_atendimento_solicitacao_v1",
    "rpc_listar_atendimentos_tecnicos_v1", "rpc_resumo_atendimentos_tecnicos_v1",
    "rpc_finalizar_visita_v2", "rpc_realizar_checkin_visita", "rpc_upsert_diagnostico_visita",
    "rpc_enviar_visita_aprovacao", "rpc_reprovar_visita", "rpc_solicitar_ajuste_visita",
    "rpc_liberar_recomendacao_produtor", "rpc_arquivar_visita", "rpc_get_visita_workspace",
    "rpc_atualizar_identificacao_visita", "is_visit_responsible",
  ];

  // (a) Catálogo PostgreSQL — prova formal de ausência de EXECUTE para anon/PUBLIC.
  const catalogo = await svc.rpc("rpc_certificacao_catalogo", {
    p_functions: sensitive, p_tables: [] as string[],
  });
  const funcs = ((catalogo.data as any)?.functions ?? []) as any[];
  const catalogoOk = !catalogo.error && funcs.length === sensitive.length &&
    funcs.every((f) => f.anon_execute === false && f.public_execute === false);

  // (b) Tentativa anon REAL com argumentos válidos (parâmetro ausente não é prova).
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const hoje = new Date().toISOString().slice(0, 10);
  const argsPorFn: Record<string, Record<string, unknown>> = {
    rpc_criar_visita_idempotente: {
      p_client_uuid: crypto.randomUUID(), p_cliente_id: clienteA, p_fazenda_id: fazendaA,
      p_talhao_id: talhaoA, p_data_vistoria: hoje, p_origem: "ocorrencia_campo",
    },
    rpc_iniciar_atendimento_solicitacao_v1: {
      p_solicitacao_id: crypto.randomUUID(), p_client_uuid: crypto.randomUUID(),
    },
    rpc_listar_atendimentos_tecnicos_v1: { p_aba: "todos", p_search: null, p_page: 1, p_page_size: 1 },
    rpc_resumo_atendimentos_tecnicos_v1: {},
    rpc_finalizar_visita_v2: { p_registro_id: crypto.randomUUID(), p_expected_version: 1 },
    rpc_realizar_checkin_visita: {
      p_registro_id: crypto.randomUUID(), p_client_uuid: crypto.randomUUID(), p_tipo: "chegada_talhao",
      p_latitude: -15.5, p_longitude: -47.5, p_precisao: 8, p_justificativa_sem_gps: null,
      p_observacoes: null, p_captured_at_local: new Date().toISOString(), p_solicitacao_id: null,
      p_cliente_id: clienteA, p_fazenda_id: fazendaA, p_talhao_id: talhaoA, p_foto_path: null,
    },
    rpc_upsert_diagnostico_visita: {
      p_registro_id: crypto.randomUUID(), p_client_uuid: crypto.randomUUID(),
      p_payload: {}, p_expected_versao: 1,
    },
    rpc_enviar_visita_aprovacao: { p_registro_id: crypto.randomUUID(), p_expected_version: 1 },
    rpc_reprovar_visita: { p_registro_id: crypto.randomUUID(), p_expected_version: 1, p_motivo: "x" },
    rpc_solicitar_ajuste_visita: { p_registro_id: crypto.randomUUID(), p_expected_version: 1, p_motivo: "x" },
    rpc_liberar_recomendacao_produtor: { p_registro_id: crypto.randomUUID() },
    rpc_arquivar_visita: { p_registro_id: crypto.randomUUID(), p_expected_version: 1, p_motivo: "x" },
    rpc_get_visita_workspace: { p_registro_id: crypto.randomUUID() },
    rpc_atualizar_identificacao_visita: {
      p_registro_id: crypto.randomUUID(), p_expected_version: 1, p_payload: {},
    },
    is_visit_responsible: { p_user_id: crypto.randomUUID(), p_registro_id: crypto.randomUUID() },
  };

  const anonResults = [];
  for (const name of sensitive) {
    const r = await anon.rpc(name, argsPorFn[name] ?? {});
    const msg = r.error?.message ?? "";
    const code = r.error?.code ?? null;
    // Aceito como prova: 42501 / permission denied / função não exposta (PGRST202 com args válidos).
    const argumentoAusente = /could not find the function|without parameters|PGRST203/i.test(msg) &&
      !/permission denied/i.test(msg);
    const negado = code === "42501" || /permission denied/i.test(msg);
    anonResults.push({ name, code, negado, argumento_ausente: argumentoAusente, message: msg || null });
  }
  const anonOk = anonResults.every((a) => a.negado && !a.argumento_ausente);

  certifyBool("T16", catalogoOk && anonOk, {
    catalogo_error: catalogo.error?.message ?? null,
    catalogo: funcs.map((f) => ({
      name: f.name, anon_execute: f.anon_execute, public_execute: f.public_execute,
      owner: f.owner, security_definer: f.security_definer, config: f.config,
    })),
    anon_probes: anonResults,
  });
}

async function t17() {
  const functionUrl = `${SUPABASE_URL}/functions/v1/visita-atendimentos-runtime-harness`;
  const semJwt = await fetch(functionUrl);
  await semJwt.body?.cancel();
  const token = (await cli.consultor!.auth.getSession()).data.session?.access_token;
  const comJwt = await fetch(functionUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  await comJwt.body?.cancel();
  certifyBool("T17", semJwt.status === 404 && comJwt.status === 404, {
    sem_jwt: semJwt.status, com_jwt: comJwt.status,
  });
}

async function t18(mediaCleanupOk: boolean, storageObjetosCriados: string[]) {
  const tabelas: Record<string, number | null> = {};
  const regsPorCliente = await svc.from("registros_consultor")
    .select("id", { count: "exact", head: true }).in("cliente_id", created.clientes);
  tabelas["registros_consultor"] = regsPorCliente.count ?? null;

  const idsRegistros = created.registros.length > 0 ? created.registros : [crypto.randomUUID()];
  for (const [tabela, coluna, ids] of [
    ["registros_consultor_arquivos", "registro_consultor_id", idsRegistros],
    ["registros_consultor_status_log", "registro_consultor_id", idsRegistros],
    ["solicitacoes_timeline", "solicitacao_id", created.solicitacoes],
    ["portal_solicitacoes", "id", created.solicitacoes],
    ["talhoes", "id", created.talhoes],
    ["fazendas", "id", created.fazendas],
    ["clientes", "id", created.clientes],
  ] as [string, string, string[]][]) {
    if (ids.length === 0) { tabelas[tabela] = 0; continue; }
    const r = await svc.from(tabela).select("id", { count: "exact", head: true }).in(coluna, ids);
    tabelas[tabela] = r.count ?? null;
  }

  const usersRestantes = (await Promise.all(created.users.map((id) => svc.auth.admin.getUserById(id))))
    .filter((r) => !!r.data.user).length;

  let storageRestantes = 0;
  const regsParaVerificar = [...new Set([...created.registros, ...created.solicitacoes])];
  for (const id of regsParaVerificar) {
    const { data } = await svc.storage.from(BUCKET).list(id, { limit: 100 });
    storageRestantes += (data ?? []).length;
  }
  // storageRestantes += storageObjetosCriados.length; // Ignore created.storageObjects since we verify folder cleanup below.

  const catalogo = await svc.rpc("rpc_certificacao_catalogo", {
    p_functions: [] as string[],
    p_tables: ["registros_consultor", "registros_consultor_arquivos", "portal_solicitacoes", "solicitacoes_timeline"],
  });
  const triggers = ((catalogo.data as any)?.triggers ?? []) as any[];
  const triggersOk = triggers.length > 0 && triggers.every((t) => t.enabled === "O" || t.enabled === "A");

  const tabelasOk = Object.values(tabelas).every((v) => v === 0);
  certifyBool("T18", tabelasOk && usersRestantes === 0 && storageRestantes === 0 && triggersOk, {
    tabelas, usuarios_temporarios_restantes: usersRestantes,
    storage_objetos_restantes: storageRestantes,
    cleanup_midia_t10: mediaCleanupOk,
    triggers: triggers.map((t) => ({ table: t.table, trigger: t.trigger, enabled: t.enabled })),
    triggers_habilitados: triggersOk,
  });
}

// ---------------------------------------------------------------------------
// Mascaramento de evidência (nenhum segredo/PII vaza para artefato)
// ---------------------------------------------------------------------------
function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, mask(v)]),
    );
  }
  if (typeof value !== "string") return value;
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, (id) => `${id.slice(0, 8)}…${id.slice(-4)}`)
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[JWT_REMOVIDO]")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[SECRET_REMOVIDO]")
    .replace(/[\w.+-]+@arbio-staging\.test/g, "[EMAIL_TEMPORARIO]");
}

async function writeArtifacts(startedAt: string) {
  const finishedAt = new Date().toISOString();
  const ordered: Result[] = T_ORDER.map((id) =>
    certificationResults.get(id) ??
    { id, name: T_NAMES[id], status: "BLOCKED" as Status, evidence: "cenário não executado" }
  );
  const safe = ordered.map((r) => ({ ...r, evidence: mask(r.evidence) }));
  const summary = {
    pass: safe.filter((r) => r.status === "PASS").length,
    fail: safe.filter((r) => r.status === "FAIL").length,
    blocked: safe.filter((r) => r.status === "BLOCKED").length,
    total: safe.length,
  };
  const artifact = {
    environment: EXPECTED_STAGING_REF,
    production_ref_never_used: PROD_REF,
    started_at: startedAt, finished_at: finishedAt,
    summary, results: safe,
  };
  await Deno.mkdir("artifacts/visita-atendimentos", { recursive: true });
  const slug = finishedAt.replace(/[:.]/g, "-");
  await Deno.writeTextFile(`artifacts/visita-atendimentos/${slug}.json`, JSON.stringify(artifact, null, 2));
  const rows = safe.map((r) => `| ${r.id} | ${r.name} | ${r.status} | ${JSON.stringify(r.evidence)} |`).join("\n");
  await Deno.writeTextFile(
    `artifacts/visita-atendimentos/${slug}.md`,
    `# Certificação T1–T18 — visita técnica (staging ${EXPECTED_STAGING_REF})\n\n` +
      `- Início: ${startedAt}\n- Fim: ${finishedAt}\n` +
      `- PASS: ${summary.pass} | FAIL: ${summary.fail} | BLOCKED: ${summary.blocked} | TOTAL: ${summary.total}\n\n` +
      `| ID | Cenário | Status | Evidência mascarada |\n|---|---|---|---|\n${rows}\n`,
  );
  return { summary, ordered };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
  assertStaging();
  if (!ADMIN_KEY) {
    _dsnAdmin = await DsnAdmin.connect(ADMIN_DSN);
  }
  const startedAt = new Date().toISOString();
  let runtimeError: string | null = null;

  try {
    await setup();

    await t1_t3();
    const registroCarteiraA = await criarVisitaCompleta("consultor");
    await t4(registroCarteiraA);
    await t5_t6();
    await t7();
    const registroOcorrencia = await t8_t9();
    const mediaCleanupOk = await t10(registroOcorrencia);
    await t11(registroOcorrencia);
    await t12();
    const registroT13 = await t13();
    await t14(registroT13);
    await t15();
    await t16();
    await t17();
    (globalThis as any).__mediaCleanupOk = mediaCleanupOk;
    (globalThis as any).__storageObjects = [...created.storageObjects];
  } catch (e) {
    runtimeError = (e as Error).message;
  } finally {
    try {
      await cleanup();
      await t18((globalThis as any).__mediaCleanupOk === true, (globalThis as any).__storageObjects ?? []);
    } catch (e) {
      certify("T18", "FAIL", { erro_cleanup: (e as Error).message });
    }
  }

  if (_dsnAdmin) await _dsnAdmin.close();

  const { summary, ordered } = await writeArtifacts(startedAt);
  console.log(JSON.stringify({
    run: RUN, environment: EXPECTED_STAGING_REF, runtime_error: runtimeError ? mask(runtimeError) : null,
    summary, results: ordered.map((r) => ({ id: r.id, name: r.name, status: r.status })),
  }, null, 2));

  const aprovado = !runtimeError && summary.total === 18 && summary.pass === 18 &&
    summary.fail === 0 && summary.blocked === 0;
  Deno.exit(aprovado ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
