/**
 * Fase Fiscal 3.0.2-B — Runner RLS baseado em FIXTURES criadas server-side.
 *
 * Setup/teardown via SERVICE ROLE (apenas em staging isolado). Zero JWT_* ou
 * FIXTURE_* manuais. Guard anti-produção obrigatório em cada etapa.
 *
 * Uso somente em staging isolado. NUNCA em produção.
 */
import type { MatrixCell, OwnershipCell, Role, ViewCell } from "./matrix";
import {
  assertStagingOnly, assertStagingMarker, PROD_PROJECT_REF,
} from "./guard";

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

export interface RunnerConfig {
  pgUrl: string;
  restUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  projectRef: string;
}

export type LoadResult =
  | { kind: "skip"; reason: string }
  | { kind: "config"; cfg: RunnerConfig };

/**
 * Estados:
 *  - nenhuma variável presente ⇒ skip explícito (staging não provisionado)
 *  - qualquer subconjunto presente porém incompleto/inconsistente ⇒ THROW
 *  - conjunto completo e consistente ⇒ RunnerConfig
 */
export function loadRunnerConfigFromEnv(): LoadResult {
  const NAMES = [
    "FISCAL_TEST_ENV",
    "FISCAL_TEST_PROJECT_REF",
    "PGURL_STAGING",
    "PGREST_STAGING",
    "PGREST_ANON_KEY",
    "PGREST_SERVICE_ROLE_KEY",
  ] as const;
  const values = Object.fromEntries(
    NAMES.map((n) => [n, process.env[n]?.trim() ?? ""]),
  ) as Record<(typeof NAMES)[number], string>;

  const presentCount = NAMES.filter((n) => values[n].length > 0).length;
  if (presentCount === 0) {
    return {
      kind: "skip",
      reason:
        "FISCAL_TEST_ENV/FISCAL_TEST_PROJECT_REF/PGURL_STAGING/PGREST_STAGING/PGREST_ANON_KEY/PGREST_SERVICE_ROLE_KEY ausentes — staging não provisionado",
    };
  }
  if (presentCount < NAMES.length) {
    const missing = NAMES.filter((n) => values[n].length === 0);
    throw new Error(
      `[fiscal-runner] configuração parcial detectada — variáveis ausentes: ${missing.join(", ")}. ` +
        `Ou todas ou nenhuma. Nunca executar com conjunto incompleto.`,
    );
  }

  const g = assertStagingOnly({
    pgUrl: values.PGURL_STAGING,
    restUrl: values.PGREST_STAGING,
    envMarker: values.FISCAL_TEST_ENV,
    projectRef: values.FISCAL_TEST_PROJECT_REF,
  });
  if (g.ok !== true) {
    throw new Error(`[fiscal-runner] guard anti-produção falhou: ${(g as { reason: string }).reason}`);
  }
  return {
    kind: "config",
    cfg: {
      pgUrl: values.PGURL_STAGING,
      restUrl: values.PGREST_STAGING,
      anonKey: values.PGREST_ANON_KEY,
      serviceRoleKey: values.PGREST_SERVICE_ROLE_KEY,
      projectRef: values.FISCAL_TEST_PROJECT_REF,
    },
  };
}

// -----------------------------------------------------------------------------
// Results
// -----------------------------------------------------------------------------

export type Observed = "allow" | "deny" | "error";
export interface RunResult {
  cellId: string;
  role: Role;
  target: string;
  operation: string;
  expected: "allow" | "deny";
  observed: Observed;
  detail: string;
}

/** classifyHttp determinístico. 401/403/42501=deny; 404/constraint/network=error. */
export function classifyHttp(status: number, body: string): Observed {
  if (status >= 200 && status < 300) return "allow";
  if (status === 401 || status === 403) return "deny";
  // PostgREST embute SQLSTATE no corpo JSON.
  if (/\b42501\b|"code"\s*:\s*"42501"|permission denied/i.test(body)) return "deny";
  // Tudo o mais é ERRO — 404, 400, 409, 500, 5xx, JSON quebrado, FK, constraint.
  return "error";
}

// -----------------------------------------------------------------------------
// Payload factories — 1 por tabela, todos com colunas NOT NULL obrigatórias.
// -----------------------------------------------------------------------------

export interface FixtureIds {
  productId: string;
  serviceRef: string;   // service_id nullable — usa source_reference
  customerId: string;
  createdBy: string;    // uuid do usuário sintético "administrador"
  companyCnpj: string;
}

type PayloadKind = "insert" | "update";

export function buildPayload(
  table: string,
  kind: PayloadKind,
  fx: FixtureIds,
): Record<string, unknown> {
  switch (table) {
    case "company_fiscal_settings":
      return kind === "insert"
        ? {
            cnpj: fx.companyCnpj,
            fiscal_environment: "NOT_CONFIGURED",
            fiscal_provider: "NONE",
            configuration_status: "PENDING",
            nfe_enabled: false,
            nfse_enabled: false,
            production_enabled: false,
            created_by: fx.createdBy,
          }
        : { configuration_status: "PENDING" };
    case "product_fiscal_profiles":
      return kind === "insert"
        ? { product_id: fx.productId, profile_status: "DRAFT", created_by: fx.createdBy }
        : { profile_status: "DRAFT" };
    case "service_fiscal_profiles":
      return kind === "insert"
        ? { source_reference: `svc-${cryptoRandom()}`, profile_status: "DRAFT", created_by: fx.createdBy }
        : { profile_status: "DRAFT" };
    case "customer_fiscal_profiles":
      return kind === "insert"
        ? { customer_id: fx.customerId, profile_status: "DRAFT", created_by: fx.createdBy }
        : { profile_status: "DRAFT" };
    case "fiscal_invoices":
      return kind === "insert"
        ? {
            invoice_type: "NFE",
            status: "PENDING",
            created_by: fx.createdBy,
          }
        : { notes: `rls-harness-${cryptoRandom()}` };
    case "fiscal_invoice_items":
      // requer fiscal_invoice_id — chamador deve mesclar.
      return kind === "insert"
        ? { description: "linha-teste", quantity: 1, unit_amount: 1 }
        : { description: `rls-${cryptoRandom()}` };
    case "fiscal_events":
      // Escrita direta é DENY para todos por policy; payload apenas simbólico.
      return kind === "insert"
        ? { event_type: "MANUAL_UPDATED", event_source: "SYSTEM" }
        : { notes: "x" };
    case "fiscal_idempotency_keys":
      return kind === "insert"
        ? { idempotency_key: `k-${cryptoRandom()}` }
        : { last_seen_at: new Date().toISOString() };
    case "fiscal_audit_log":
      return kind === "insert"
        ? { action: "INSERT", table_name: "fiscal_invoices" }
        : { action: "UPDATE" };
    default:
      throw new Error(`[fiscal-runner] payload factory não definido para ${table}`);
  }
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}

// -----------------------------------------------------------------------------
// Setup / teardown server-side (SERVICE ROLE — só staging).
// -----------------------------------------------------------------------------

export const FIXTURE_PREFIX = "FISCAL_TEST_B1_";

export interface StagingSession {
  cfg: RunnerConfig;
  fx: FixtureIds;
  jwts: Record<Role, string>;
  jwtClienteB: string;
  fixtureIds: Record<string, string>;
  clienteA: { userId: string; clienteId: string; invoiceId: string; receivableId: string };
  clienteB: { userId: string; clienteId: string };
  teardown: () => Promise<void>;
}

interface SupabaseAdminLike {
  auth: {
    admin: {
      createUser: (p: { email: string; password: string; email_confirm: boolean }) => Promise<{ data: { user: { id: string } | null } | null; error: { message: string } | null }>;
      deleteUser: (id: string) => Promise<{ error: { message: string } | null }>;
    };
    signInWithPassword: (p: { email: string; password: string }) => Promise<{ data: { session: { access_token: string } | null } | null; error: { message: string } | null }>;
  };
  from: (table: string) => {
    select: (cols: string) => { eq: (c: string, v: unknown) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> } };
  };
}

interface SupabaseModuleLike {
  createClient: (url: string, key: string, opts?: unknown) => SupabaseAdminLike;
}

/** Hook para injeção em testes unitários. Nunca setar em runtime real. */
let supabaseModuleOverride: SupabaseModuleLike | null = null;
export function __setSupabaseModuleForTests(mod: SupabaseModuleLike | null): void {
  supabaseModuleOverride = mod;
}

async function loadSupabaseModule(): Promise<SupabaseModuleLike> {
  if (supabaseModuleOverride) return supabaseModuleOverride;
  const modName = "@supabase/supabase-js";
  const mod = (await import(/* @vite-ignore */ modName)) as unknown as SupabaseModuleLike;
  return mod;
}

/** Gerador de senha aleatória — mantida apenas em memória local. */
async function randomPassword(): Promise<string> {
  const nodeCrypto = await import("node:crypto");
  return nodeCrypto.randomBytes(16).toString("hex");
}

/** UUID v4 gerado em runtime — never hardcoded. */
async function newUuid(): Promise<string> {
  const nodeCrypto = await import("node:crypto");
  return nodeCrypto.randomUUID();
}

/**
 * Requisição REST via SERVICE ROLE. Wrapper deliberadamente minimalista para
 * concentrar cleanup e evitar depender do supabase-js em toda operação.
 */
async function restAdmin(
  cfg: RunnerConfig, method: string, path: string, body?: unknown,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${cfg.restUrl}/${path}`, {
    method,
    headers: {
      apikey: cfg.serviceRoleKey,
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

/**
 * Cria usuários sintéticos, vincula clientes/roles conforme necessário, cria
 * fixtures descartáveis, obtém JWTs e devolve handle com teardown idempotente.
 *
 * Pré-condições:
 *  - marker STAGING + project_ref conferem com cfg.projectRef;
 *  - service_role apontando ao staging isolado;
 *  - execução sequencial (sem paralelismo em fixtures).
 *
 * Nunca loga: senha, JWT, service role, anon key, e-mail sintético, URL de PG.
 */
export async function setupStaging(cfg: RunnerConfig): Promise<StagingSession> {
  if (cfg.projectRef === PROD_PROJECT_REF) {
    throw new Error("ABORT: cfg aponta para produção");
  }
  const mod = await loadSupabaseModule();
  const admin = mod.createClient(hostFromRest(cfg.restUrl), cfg.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = mod.createClient(hostFromRest(cfg.restUrl), cfg.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Marker check em runtime (defesa em profundidade).
  const markerRes = await admin.from("_fiscal_staging_marker").select("marker, project_ref").eq("marker", "STAGING").limit(1);
  const rows = (Array.isArray(markerRes.data) ? markerRes.data : []) as Array<{ marker: unknown; project_ref: unknown }>;
  const g = await assertStagingMarker(async () => ({ rows }), cfg.projectRef);
  if (g.ok !== true) throw new Error(`[fiscal-runner] marker inválido: ${(g as { reason: string }).reason}`);

  const createdUserIds: string[] = [];
  const createdReceivables: string[] = [];
  const createdInvoices: string[] = [];
  const createdInvoiceItems: string[] = [];
  const createdIdemp: string[] = [];
  const createdCustomerProfiles: string[] = [];
  const createdServiceProfiles: string[] = [];
  const createdProductProfiles: string[] = [];
  const createdCompanySettings: string[] = [];
  const createdClientes: string[] = [];
  const createdProdutos: string[] = [];

  async function makeUser(role: Role): Promise<{ userId: string; jwt: string }> {
    const email = `${FIXTURE_PREFIX}${role}_${(await newUuid()).slice(0, 8)}@fiscal-test.invalid`.toLowerCase();
    const password = await randomPassword();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data?.user) throw new Error(`createUser ${role}: ${error?.message ?? "sem user"}`);
    const userId = data.user.id;
    createdUserIds.push(userId);
    // profile
    await restAdmin(cfg, "POST", "profiles", { user_id: userId, nome: `${FIXTURE_PREFIX}${role}`, email });
    // sign in — token nunca logado
    const signin = await anon.auth.signInWithPassword({ email, password });
    if (signin.error || !signin.data?.session) {
      throw new Error(`signIn ${role}: ${signin.error?.message ?? "sem sessão"}`);
    }
    return { userId, jwt: signin.data.session.access_token };
  }

  // 13 papéis autenticados (todos exceto anon; cliente_produtor é criado abaixo com A + B)
  const jwts = {} as Record<Role, string>;
  const nonProducerRoles: Role[] = [
    "administrador", "gestor", "financeiro", "administrativo", "gestor_comercial",
    "consultor_tecnico", "tecnico_agronomo", "aplicador", "operador_onfarm",
    "producao", "parceiro_b2b", "parceiro_b2b_tecnico", "authenticated_sem_papel",
  ];

  const adminUserIds: Record<string, string> = {};
  for (const role of nonProducerRoles) {
    const { userId, jwt } = await makeUser(role);
    jwts[role] = jwt;
    adminUserIds[role] = userId;
    if (role !== "authenticated_sem_papel") {
      await restAdmin(cfg, "POST", "user_roles", { user_id: userId, role });
    }
  }

  // cliente_produtor A + B — exigem vínculo user_clientes ANTES do role.
  async function makeProducer(tag: "A" | "B"): Promise<{ userId: string; clienteId: string; jwt: string }> {
    const { userId, jwt } = await makeUser("cliente_produtor");
    const clienteId = await newUuid();
    await restAdmin(cfg, "POST", "clientes", {
      id: clienteId,
      nome: `${FIXTURE_PREFIX}cliente_${tag}`,
      tipo_cliente: "produtor",
    });
    createdClientes.push(clienteId);
    await restAdmin(cfg, "POST", "user_clientes", { user_id: userId, cliente_id: clienteId });
    await restAdmin(cfg, "POST", "user_roles", { user_id: userId, role: "cliente_produtor" });
    return { userId, clienteId, jwt };
  }
  const prodA = await makeProducer("A");
  const prodB = await makeProducer("B");
  jwts.cliente_produtor = prodA.jwt;
  const jwtClienteB = prodB.jwt;
  jwts.anon = cfg.anonKey;

  // Fixtures fiscais
  const createdBy = adminUserIds.administrador;
  const productId = await newUuid();
  await restAdmin(cfg, "POST", "produtos", { id: productId, nome: `${FIXTURE_PREFIX}produto`, tipo: "insumo" });
  createdProdutos.push(productId);

  const companyCnpj = `${FIXTURE_PREFIX}CNPJ`;
  const fx: FixtureIds = {
    productId,
    serviceRef: `${FIXTURE_PREFIX}svc-${(await newUuid()).slice(0, 8)}`,
    customerId: prodA.clienteId,
    createdBy,
    companyCnpj,
  };

  async function insertReturningId(table: string, payload: Record<string, unknown>, sink: string[]): Promise<string> {
    const r = await restAdmin(cfg, "POST", table, payload);
    if (r.status < 200 || r.status >= 300) throw new Error(`insert ${table}: HTTP ${r.status} ${r.text}`);
    const arr = safeJson(r.text);
    const id = Array.isArray(arr) && arr.length > 0 ? (arr[0] as { id?: string }).id : undefined;
    if (!id) throw new Error(`insert ${table}: sem id retornado`);
    sink.push(id);
    return id;
  }

  const fixtureIds: Record<string, string> = {};
  fixtureIds.company_fiscal_settings = await insertReturningId(
    "company_fiscal_settings", buildPayload("company_fiscal_settings", "insert", fx), createdCompanySettings,
  );
  fixtureIds.product_fiscal_profiles = await insertReturningId(
    "product_fiscal_profiles", buildPayload("product_fiscal_profiles", "insert", fx), createdProductProfiles,
  );
  fixtureIds.service_fiscal_profiles = await insertReturningId(
    "service_fiscal_profiles", buildPayload("service_fiscal_profiles", "insert", fx), createdServiceProfiles,
  );
  fixtureIds.customer_fiscal_profiles = await insertReturningId(
    "customer_fiscal_profiles", buildPayload("customer_fiscal_profiles", "insert", fx), createdCustomerProfiles,
  );

  const receivableId = await newUuid();
  await restAdmin(cfg, "POST", "accounts_receivable", {
    id: receivableId,
    customer_id: prodA.clienteId,
    total_amount: 1,
    reference: `${FIXTURE_PREFIX}ar`,
  });
  createdReceivables.push(receivableId);

  const invoicePayload = {
    ...buildPayload("fiscal_invoices", "insert", fx),
    receivable_id: receivableId,
  } as Record<string, unknown>;
  fixtureIds.fiscal_invoices = await insertReturningId("fiscal_invoices", invoicePayload, createdInvoices);

  fixtureIds.fiscal_invoice_items = await insertReturningId(
    "fiscal_invoice_items",
    { ...buildPayload("fiscal_invoice_items", "insert", fx), fiscal_invoice_id: fixtureIds.fiscal_invoices, item_sequence: 1 },
    createdInvoiceItems,
  );
  fixtureIds.fiscal_idempotency_keys = await insertReturningId(
    "fiscal_idempotency_keys",
    { ...buildPayload("fiscal_idempotency_keys", "insert", fx), fiscal_invoice_id: fixtureIds.fiscal_invoices },
    createdIdemp,
  );

  // Fixture "descartável" para DELETE (uma por tabela mutável).
  const disposableTables = [
    "product_fiscal_profiles", "service_fiscal_profiles", "customer_fiscal_profiles",
    "company_fiscal_settings", "fiscal_invoices", "fiscal_invoice_items", "fiscal_idempotency_keys",
  ];
  for (const t of disposableTables) {
    const payload = { ...buildPayload(t, "insert", fx) } as Record<string, unknown>;
    if (t === "fiscal_invoice_items") { payload.fiscal_invoice_id = fixtureIds.fiscal_invoices; payload.item_sequence = 2; }
    if (t === "fiscal_invoices") payload.receivable_id = receivableId;
    if (t === "fiscal_idempotency_keys") { payload.idempotency_key = `${FIXTURE_PREFIX}disp-${(await newUuid()).slice(0, 8)}`; payload.fiscal_invoice_id = fixtureIds.fiscal_invoices; }
    if (t === "company_fiscal_settings") payload.cnpj = `${FIXTURE_PREFIX}CNPJ_DISP`;
    if (t === "service_fiscal_profiles") payload.source_reference = `${FIXTURE_PREFIX}svc-disp-${(await newUuid()).slice(0, 8)}`;
    try {
      const r = await restAdmin(cfg, "POST", t, payload);
      const arr = safeJson(r.text);
      const id = Array.isArray(arr) && arr.length > 0 ? (arr[0] as { id?: string }).id : undefined;
      if (id) {
        fixtureIds[`${t}__disposable`] = id;
        if (t === "product_fiscal_profiles") createdProductProfiles.push(id);
        else if (t === "service_fiscal_profiles") createdServiceProfiles.push(id);
        else if (t === "customer_fiscal_profiles") createdCustomerProfiles.push(id);
        else if (t === "company_fiscal_settings") createdCompanySettings.push(id);
        else if (t === "fiscal_invoices") createdInvoices.push(id);
        else if (t === "fiscal_invoice_items") createdInvoiceItems.push(id);
        else if (t === "fiscal_idempotency_keys") createdIdemp.push(id);
      }
    } catch {
      // Se DELETE-target falhar (ex.: singleton company), teste vira "error" — comportamento desejado.
    }
  }
  // fiscal_events e fiscal_audit_log: escrita direta é DENY por design, não criamos disposable.
  fixtureIds.fiscal_events = fixtureIds.fiscal_invoices;   // dummy, DELETE nunca deve passar
  fixtureIds.fiscal_audit_log = fixtureIds.fiscal_invoices;

  async function teardown(): Promise<void> {
    const safeDel = async (table: string, ids: string[]): Promise<void> => {
      for (const id of ids) {
        await restAdmin(cfg, "DELETE", `${table}?id=eq.${id}`).catch(() => undefined);
      }
    };
    await restAdmin(cfg, "DELETE", `fiscal_audit_log?table_name=like.${FIXTURE_PREFIX}*`).catch(() => undefined);
    await restAdmin(cfg, "DELETE", `fiscal_events?fiscal_invoice_id=in.(${createdInvoices.join(",") || "00000000-0000-0000-0000-000000000000"})`).catch(() => undefined);
    await safeDel("fiscal_invoice_items", createdInvoiceItems);
    await safeDel("fiscal_idempotency_keys", createdIdemp);
    await safeDel("fiscal_invoices", createdInvoices);
    await safeDel("customer_fiscal_profiles", createdCustomerProfiles);
    await safeDel("service_fiscal_profiles", createdServiceProfiles);
    await safeDel("product_fiscal_profiles", createdProductProfiles);
    await safeDel("company_fiscal_settings", createdCompanySettings);
    await safeDel("accounts_receivable", createdReceivables);
    for (const uid of createdUserIds) {
      await restAdmin(cfg, "DELETE", `user_roles?user_id=eq.${uid}`).catch(() => undefined);
      await restAdmin(cfg, "DELETE", `user_clientes?user_id=eq.${uid}`).catch(() => undefined);
      await restAdmin(cfg, "DELETE", `profiles?user_id=eq.${uid}`).catch(() => undefined);
    }
    await safeDel("clientes", createdClientes);
    await safeDel("produtos", createdProdutos);
    for (const uid of createdUserIds) {
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
  }

  return {
    cfg, fx, jwts, jwtClienteB, fixtureIds,
    clienteA: { userId: prodA.userId, clienteId: prodA.clienteId, invoiceId: fixtureIds.fiscal_invoices, receivableId },
    clienteB: { userId: prodB.userId, clienteId: prodB.clienteId },
    teardown,
  };
}

function hostFromRest(restUrl: string): string {
  // restUrl termina com /rest/v1 — devolve host para o createClient.
  return restUrl.replace(/\/rest\/v1\/?$/, "");
}

// -----------------------------------------------------------------------------
// Execução por célula
// -----------------------------------------------------------------------------

function headersFor(cfg: RunnerConfig, jwt: string): Record<string, string> {
  return {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  };
}

/** SELECT por UUID conhecido. Deny = 0 linhas OU 401/403/42501. */
export async function runCellRest(
  session: StagingSession, cell: MatrixCell,
): Promise<RunResult> {
  const jwt = cell.role === "anon" ? session.cfg.anonKey : session.jwts[cell.role];
  if (!jwt) {
    return baseResult(cell, "error", `JWT ausente para ${cell.role}`);
  }
  const fixtureId = session.fixtureIds[cell.table];
  if (!fixtureId) return baseResult(cell, "error", `fixtureId ausente para ${cell.table}`);
  const headers = headersFor(session.cfg, jwt);

  try {
    if (cell.operation === "SELECT") {
      const res = await fetch(
        `${session.cfg.restUrl}/${cell.table}?id=eq.${fixtureId}&select=id`,
        { headers },
      );
      const body = await res.text();
      if (res.status === 401 || res.status === 403) return baseResult(cell, "deny", `HTTP ${res.status}`);
      if (res.ok) {
        const rows = safeJson(body);
        if (!Array.isArray(rows)) return baseResult(cell, "error", "JSON inválido");
        return baseResult(cell, rows.length > 0 ? "allow" : "deny", `HTTP 200 rows=${rows.length}`);
      }
      return baseResult(cell, classifyHttp(res.status, body), `HTTP ${res.status}`);
    }
    if (cell.operation === "INSERT") {
      const payload = buildPayload(cell.table, "insert", session.fx);
      if (cell.table === "fiscal_invoice_items") {
        (payload as Record<string, unknown>).fiscal_invoice_id = session.clienteA.invoiceId;
      }
      const res = await fetch(`${session.cfg.restUrl}/${cell.table}`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      const body = await res.text();
      const observed = classifyHttp(res.status, body);
      // Se allow, cleanup do registro inserido.
      if (observed === "allow") {
        const inserted = safeJson(body);
        const ids = Array.isArray(inserted)
          ? inserted.map((r) => (r as { id?: string })?.id).filter(Boolean)
          : [];
        for (const id of ids) {
          await fetch(`${session.cfg.restUrl}/${cell.table}?id=eq.${id}`, {
            method: "DELETE",
            headers: headersFor(session.cfg, session.cfg.serviceRoleKey),
          }).catch(() => undefined);
        }
      }
      return baseResult(cell, observed, `HTTP ${res.status}`);
    }
    if (cell.operation === "UPDATE") {
      const payload = buildPayload(cell.table, "update", session.fx);
      const res = await fetch(
        `${session.cfg.restUrl}/${cell.table}?id=eq.${fixtureId}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.text();
      if (res.status === 401 || res.status === 403) return baseResult(cell, "deny", `HTTP ${res.status}`);
      if (!res.ok) return baseResult(cell, classifyHttp(res.status, body), `HTTP ${res.status}`);
      const rows = safeJson(body);
      if (!Array.isArray(rows)) return baseResult(cell, "error", "JSON inválido");
      // allow exige exatamente 1 linha alterada e persistência.
      return baseResult(cell, rows.length === 1 ? "allow" : "deny", `HTTP 200 rows=${rows.length}`);
    }
    // DELETE — usa fixture descartável dedicada; nunca UUID zerado.
    const disposableId = session.fixtureIds[`${cell.table}__disposable`];
    if (!disposableId) return baseResult(cell, "error", `fixture descartável ausente p/ DELETE em ${cell.table}`);
    const res = await fetch(
      `${session.cfg.restUrl}/${cell.table}?id=eq.${disposableId}`,
      {
        method: "DELETE",
        headers: { ...headers, Prefer: "return=representation" },
      },
    );
    const body = await res.text();
    if (res.status === 401 || res.status === 403) return baseResult(cell, "deny", `HTTP ${res.status}`);
    if (!res.ok) return baseResult(cell, classifyHttp(res.status, body), `HTTP ${res.status}`);
    const rows = safeJson(body);
    if (!Array.isArray(rows)) return baseResult(cell, "error", "JSON inválido");
    return baseResult(cell, rows.length === 1 ? "allow" : "deny", `HTTP 200 removed=${rows.length}`);
  } catch (err) {
    return baseResult(cell, "error", `fetch: ${(err as Error).message}`);
  }
}

function baseResult(cell: MatrixCell, observed: Observed, detail: string): RunResult {
  return {
    cellId: `${cell.table}.${cell.operation}.${cell.role}`,
    role: cell.role,
    target: cell.table,
    operation: cell.operation,
    expected: cell.expected,
    observed,
    detail,
  };
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text || "[]"); } catch { return null; }
}

// -----------------------------------------------------------------------------
// Views
// -----------------------------------------------------------------------------

export async function runViewCell(session: StagingSession, cell: ViewCell): Promise<RunResult> {
  const jwt = cell.role === "anon" ? session.cfg.anonKey : session.jwts[cell.role];
  if (!jwt) {
    return {
      cellId: `${cell.view}.SELECT.${cell.role}`, role: cell.role, target: cell.view,
      operation: "SELECT_VIEW", expected: cell.expected, observed: "error",
      detail: `JWT ausente para ${cell.role}`,
    };
  }
  const res = await fetch(`${session.cfg.restUrl}/${cell.view}?limit=1`, {
    headers: { apikey: session.cfg.anonKey, Authorization: `Bearer ${jwt}` },
  });
  const body = await res.text();
  let observed: Observed;
  if (res.status === 401 || res.status === 403) observed = "deny";
  else if (res.ok) {
    const rows = safeJson(body);
    if (!Array.isArray(rows)) observed = "error";
    else observed = rows.length > 0 ? "allow" : "deny";
  } else observed = classifyHttp(res.status, body);
  return {
    cellId: `${cell.view}.SELECT.${cell.role}`, role: cell.role, target: cell.view,
    operation: "SELECT_VIEW", expected: cell.expected, observed, detail: `HTTP ${res.status}`,
  };
}

// -----------------------------------------------------------------------------
// Ownership
// -----------------------------------------------------------------------------

export async function runOwnershipCell(
  session: StagingSession, cell: OwnershipCell,
): Promise<RunResult> {
  // "own" ⇒ usa JWT do clienteA e busca invoice do clienteA (deve retornar 1).
  // "other" ⇒ usa JWT do clienteB e busca invoice do clienteA (deve retornar 0).
  const jwt = cell.scope === "own"
    ? session.jwts.cliente_produtor
    : session.jwts.cliente_produtor; // ambos "cliente_produtor" — B substitui A no wrapper
  const targetId = session.clienteA.invoiceId;
  const res = await fetch(
    `${session.cfg.restUrl}/${cell.table}?id=eq.${targetId}&select=id`,
    { headers: { apikey: session.cfg.anonKey, Authorization: `Bearer ${jwt}` } },
  );
  const body = await res.text();
  if (!res.ok && res.status !== 401 && res.status !== 403) {
    return {
      cellId: `own.${cell.label}`, role: cell.role, target: cell.table,
      operation: "SELECT_OWN", expected: cell.expectedRows === 1 ? "allow" : "deny",
      observed: "error", detail: `HTTP ${res.status}`,
    };
  }
  const rows = safeJson(body);
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const observed: Observed = rowCount === cell.expectedRows ? "allow" : "deny";
  return {
    cellId: `own.${cell.label}`, role: cell.role, target: cell.table,
    operation: "SELECT_OWN", expected: "allow",
    observed, detail: `rows=${rowCount} esperado=${cell.expectedRows}`,
  };
}

// -----------------------------------------------------------------------------
// RPC rpc_fiscal_event_manual — cobertura ampliada.
// -----------------------------------------------------------------------------

export async function runRpcCell(
  session: StagingSession, role: Role, expected: "allow" | "deny",
): Promise<RunResult[]> {
  const jwt = role === "anon" ? session.cfg.anonKey : session.jwts[role];
  const base = { role, target: "rpc_fiscal_event_manual", expected };
  const results: RunResult[] = [];

  // Caso principal: invoice válida + event_type válido + notes curtas.
  results.push(await callRpc(session, jwt, {
    p_invoice_id: session.clienteA.invoiceId,
    p_event_type: "MANUAL_UPDATED",
    p_notes: "harness-primary",
  }, `${base.target}.primary.${role}`, expected, role, "RPC_CALL_PRIMARY"));

  // Casos negativos — devem SEMPRE falhar (error/deny), independente do role.
  results.push(await callRpc(session, jwt, {
    p_invoice_id: "00000000-0000-0000-0000-000000000000",
    p_event_type: "MANUAL_UPDATED",
    p_notes: null,
  }, `${base.target}.invoice_missing.${role}`, "deny", role, "RPC_INVOICE_MISSING"));

  results.push(await callRpc(session, jwt, {
    p_invoice_id: session.clienteA.invoiceId,
    p_event_type: "!!invalid!!",
    p_notes: null,
  }, `${base.target}.event_invalid.${role}`, "deny", role, "RPC_EVENT_INVALID"));

  results.push(await callRpc(session, jwt, {
    p_invoice_id: session.clienteA.invoiceId,
    p_event_type: "MANUAL_UPDATED",
    p_notes: "x".repeat(2001),
  }, `${base.target}.notes_overflow.${role}`, "deny", role, "RPC_NOTES_OVERFLOW"));

  return results;
}

async function callRpc(
  session: StagingSession, jwt: string, payload: Record<string, unknown>,
  cellId: string, expected: "allow" | "deny", role: Role, operation: string,
): Promise<RunResult> {
  const res = await fetch(`${session.cfg.restUrl}/rpc/rpc_fiscal_event_manual`, {
    method: "POST",
    headers: {
      apikey: session.cfg.anonKey, Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  let observed: Observed;
  if (res.status === 401 || res.status === 403) observed = "deny";
  else if (/\b42501\b|permission denied/i.test(body)) observed = "deny";
  else if (res.ok) {
    const returned = safeJson(body);
    // Retorno deve ser UUID em string.
    const uuid = typeof returned === "string" ? returned : null;
    if (uuid && /^[0-9a-f-]{36}$/i.test(uuid)) {
      observed = "allow";
      // Best-effort cleanup: apagar evento criado via service role.
      await fetch(
        `${session.cfg.restUrl}/fiscal_events?id=eq.${uuid}`,
        { method: "DELETE", headers: headersFor(session.cfg, session.cfg.serviceRoleKey) },
      ).catch(() => undefined);
    } else observed = "error";
  } else observed = classifyHttp(res.status, body);
  return {
    cellId, role, target: "rpc_fiscal_event_manual", operation,
    expected, observed, detail: `HTTP ${res.status}`,
  };
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

export interface Summary {
  planned: number;
  executed: number;
  passed: number;
  failed: RunResult[];
  errors: RunResult[];
  skipped: number;
}

export function summarize(results: RunResult[], planned: number): Summary {
  const errors = results.filter((r) => r.observed === "error");
  const passed = results.filter((r) => r.observed !== "error" && r.observed === r.expected).length;
  const failed = results.filter((r) => r.observed !== "error" && r.observed !== r.expected);
  return {
    planned,
    executed: results.length,
    passed,
    failed,
    errors,
    skipped: planned - results.length,
  };
}
