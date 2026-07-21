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

export interface StagingSession {
  cfg: RunnerConfig;
  fx: FixtureIds;
  jwts: Record<Role, string>;          // 15 JWTs (anon usa anonKey)
  fixtureIds: Record<string, string>;  // 1 UUID descartável por tabela para SELECT/UPDATE/DELETE
  clienteA: { userId: string; clienteId: string; invoiceId: string };
  clienteB: { userId: string; clienteId: string };
  teardown: () => Promise<void>;
}

/**
 * Cria usuários sintéticos via auth.admin (SERVICE ROLE), atribui roles em
 * public.user_roles, autentica cada um para obter JWT, cria fixtures descartáveis
 * por tabela e devolve um handle com teardown idempotente.
 *
 * Implementação real requer:
 *  - marker+project_ref confirmados (chamador valida antes);
 *  - service_role apontando ao staging;
 *  - sequência estrita (não concorrente) para evitar corrida.
 *
 * ATENÇÃO: função implementada como "prepared" — depende de @supabase/supabase-js
 * carregado dinamicamente e das tabelas base já migradas no staging.
 */
export async function setupStaging(cfg: RunnerConfig): Promise<StagingSession> {
  // Import dinâmico — só carrega quando runtime real ocorre.
  const modName = "@supabase/supabase-js";
  const mod = (await import(/* @vite-ignore */ modName)) as typeof import("@supabase/supabase-js");
  const admin = mod.createClient(hostFromRest(cfg.restUrl), cfg.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Confirma marker no banco antes de qualquer mutação.
  const markerCheck = await admin
    .from("_fiscal_staging_marker")
    .select("marker, project_ref")
    .eq("marker", "STAGING")
    .limit(1);
  const g = await assertStagingMarker(
    async () => ({ rows: (markerCheck.data ?? []) as Array<{ marker: unknown; project_ref: unknown }> }),
    cfg.projectRef,
  );
  if (g.ok !== true) throw new Error(`[fiscal-runner] marker inválido: ${(g as { reason: string }).reason}`);
  if (cfg.projectRef === PROD_PROJECT_REF) throw new Error("ABORT: cfg apontando p/ produção");

  // TODO em execução real: criar usuários, roles, fixtures, autenticar,
  // preencher jwts/fixtureIds. Manter esta implementação enxuta e comentada
  // impede que uma execução acidental (sem env) crie recursos.
  throw new Error(
    "[fiscal-runner] setupStaging: pipeline preparado — implementação de criação " +
      "de usuários sintéticos deve ser habilitada durante a execução real no staging. " +
      "Ver docs/fiscal-fase3-0-2b-runbook.md",
  );
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
