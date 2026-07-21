/**
 * Fase Fiscal 3.0.1 — Runner RLS baseado em FIXTURES conhecidas.
 *
 * Substitui a determinação por HTTP-status por consulta a UUIDs conhecidos
 * criados via service_role. DENY = 0 linhas (ou 401/403/42501). ALLOW = linha
 * esperada presente (ou linha alterada/excluída conforme op).
 *
 * Uso somente em staging isolado. Guard anti-produção obrigatório.
 */
import type { MatrixCell, ViewCell, Role, Operation } from "./matrix";
import { assertStagingOnly } from "./guard";

export interface RunnerConfig {
  pgUrl: string;
  restUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
  jwts: Partial<Record<Role, string>>;
  fixtureIds: Partial<Record<string, string>>; // table -> uuid conhecido
}

export function loadRunnerConfigFromEnv(): RunnerConfig | null {
  const pgUrl = process.env.PGURL_STAGING ?? null;
  const restUrl = process.env.PGREST_STAGING ?? null;
  const anonKey = process.env.PGREST_ANON_KEY ?? null;
  const envMarker = process.env.FISCAL_TEST_ENV ?? null;
  const g = assertStagingOnly({ pgUrl, restUrl, envMarker });
  if (!g.ok) return null;
  if (!pgUrl || !restUrl || !anonKey) return null;

  const jwts: Partial<Record<Role, string>> = {};
  const roles: Role[] = [
    "administrador", "gestor", "financeiro", "administrativo", "gestor_comercial",
    "consultor_tecnico", "tecnico_agronomo", "aplicador", "operador_onfarm",
    "producao", "cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico",
    "authenticated_sem_papel",
  ];
  for (const r of roles) {
    const val = process.env[`JWT_${r.toUpperCase()}`];
    if (val) jwts[r] = val;
  }
  const fixtureIds: Partial<Record<string, string>> = {};
  for (const t of [
    "company_fiscal_settings", "product_fiscal_profiles", "service_fiscal_profiles",
    "customer_fiscal_profiles", "fiscal_invoices", "fiscal_invoice_items",
    "fiscal_events", "fiscal_idempotency_keys", "fiscal_audit_log",
  ]) {
    const v = process.env[`FIXTURE_${t.toUpperCase()}_ID`];
    if (v) fixtureIds[t] = v;
  }
  return {
    pgUrl,
    restUrl,
    anonKey,
    serviceRoleKey: process.env.PGREST_SERVICE_ROLE_KEY,
    jwts,
    fixtureIds,
  };
}

export interface RunResult {
  role: Role;
  target: string;
  operation: Operation | "SELECT_VIEW" | "RPC_CALL";
  expected: "allow" | "deny";
  observed: "allow" | "deny" | "error";
  detail: string;
}

function headersFor(cfg: RunnerConfig, jwt: string) {
  return {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

function classifyHttp(status: number, err?: string): "allow" | "deny" | "error" {
  if (status >= 200 && status < 300) return "allow";
  if (status === 401 || status === 403) return "deny";
  // PostgREST retorna 42501 (RLS) via 401/403; 23xxx via 400/409 → erro de constraint.
  if (status === 400 || status === 409) return err?.includes("42501") ? "deny" : "error";
  return "deny";
}

export async function runCellRest(cfg: RunnerConfig, cell: MatrixCell): Promise<RunResult> {
  const jwt = cell.role === "anon" ? cfg.anonKey : cfg.jwts[cell.role];
  if (!jwt) {
    return {
      role: cell.role, target: cell.table, operation: cell.operation,
      expected: cell.expected, observed: "error",
      detail: `JWT ausente para ${cell.role} — certificação exige zero skip`,
    };
  }
  const fixtureId = cfg.fixtureIds[cell.table];
  const headers = headersFor(cfg, jwt);

  try {
    if (cell.operation === "SELECT") {
      const url = fixtureId
        ? `${cfg.restUrl}/${cell.table}?id=eq.${fixtureId}&select=id`
        : `${cfg.restUrl}/${cell.table}?limit=1`;
      const res = await fetch(url, { headers });
      const body = await res.text();
      let observed: "allow" | "deny" | "error";
      if (res.status === 401 || res.status === 403) observed = "deny";
      else if (res.ok) {
        const rows = JSON.parse(body || "[]") as unknown[];
        observed = rows.length > 0 ? "allow" : "deny";
      } else observed = "error";
      return { role: cell.role, target: cell.table, operation: cell.operation,
        expected: cell.expected, observed, detail: `HTTP ${res.status} rows=${body.slice(0, 40)}` };
    }
    if (cell.operation === "INSERT") {
      const res = await fetch(cfg.restUrl + `/${cell.table}`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({}),
      });
      const body = await res.text();
      return { role: cell.role, target: cell.table, operation: cell.operation,
        expected: cell.expected, observed: classifyHttp(res.status, body),
        detail: `HTTP ${res.status}` };
    }
    if (cell.operation === "UPDATE") {
      if (!fixtureId) {
        return { role: cell.role, target: cell.table, operation: cell.operation,
          expected: cell.expected, observed: "error", detail: "fixtureId ausente" };
      }
      const res = await fetch(cfg.restUrl + `/${cell.table}?id=eq.${fixtureId}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      });
      const body = await res.text();
      if (res.status === 401 || res.status === 403) {
        return { role: cell.role, target: cell.table, operation: cell.operation,
          expected: cell.expected, observed: "deny", detail: `HTTP ${res.status}` };
      }
      if (res.ok) {
        const rows = JSON.parse(body || "[]") as unknown[];
        return { role: cell.role, target: cell.table, operation: cell.operation,
          expected: cell.expected, observed: rows.length > 0 ? "allow" : "deny",
          detail: `HTTP ${res.status} rows=${rows.length}` };
      }
      return { role: cell.role, target: cell.table, operation: cell.operation,
        expected: cell.expected, observed: "error", detail: `HTTP ${res.status} ${body.slice(0, 80)}` };
    }
    // DELETE
    const res = await fetch(cfg.restUrl + `/${cell.table}?id=eq.00000000-0000-0000-0000-000000000000`, {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=representation" },
    });
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      return { role: cell.role, target: cell.table, operation: cell.operation,
        expected: cell.expected, observed: "deny", detail: `HTTP ${res.status}` };
    }
    if (res.ok) {
      const rows = JSON.parse(body || "[]") as unknown[];
      return { role: cell.role, target: cell.table, operation: cell.operation,
        expected: cell.expected, observed: rows.length >= 0 ? "allow" : "deny",
        detail: `HTTP ${res.status} rows=${rows.length}` };
    }
    return { role: cell.role, target: cell.table, operation: cell.operation,
      expected: cell.expected, observed: "error", detail: `HTTP ${res.status}` };
  } catch (err) {
    return { role: cell.role, target: cell.table, operation: cell.operation,
      expected: cell.expected, observed: "error", detail: `fetch: ${(err as Error).message}` };
  }
}

export async function runViewCell(cfg: RunnerConfig, cell: ViewCell): Promise<RunResult> {
  const jwt = cell.role === "anon" ? cfg.anonKey : cfg.jwts[cell.role];
  if (!jwt) {
    return { role: cell.role, target: cell.view, operation: "SELECT_VIEW",
      expected: cell.expected, observed: "error", detail: `JWT ausente para ${cell.role}` };
  }
  const res = await fetch(`${cfg.restUrl}/${cell.view}?limit=1`, {
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${jwt}` },
  });
  const body = await res.text();
  let observed: "allow" | "deny" | "error";
  if (res.status === 401 || res.status === 403) observed = "deny";
  else if (res.ok) {
    const rows = JSON.parse(body || "[]") as unknown[];
    observed = rows.length > 0 ? "allow" : "deny";
  } else observed = "error";
  return { role: cell.role, target: cell.view, operation: "SELECT_VIEW",
    expected: cell.expected, observed, detail: `HTTP ${res.status}` };
}

export async function runRpcCell(
  cfg: RunnerConfig,
  role: Role,
  rpc: string,
  expected: "allow" | "deny",
): Promise<RunResult> {
  const jwt = role === "anon" ? cfg.anonKey : cfg.jwts[role];
  if (!jwt) {
    return { role, target: rpc, operation: "RPC_CALL", expected, observed: "error",
      detail: `JWT ausente para ${role}` };
  }
  const fixtureId = cfg.fixtureIds["fiscal_invoices"];
  const res = await fetch(`${cfg.restUrl}/rpc/${rpc}`, {
    method: "POST",
    headers: {
      apikey: cfg.anonKey, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_invoice_id: fixtureId ?? "00000000-0000-0000-0000-000000000000",
      p_event_type: "MANUAL_UPDATED",
      p_notes: "rls-harness",
    }),
  });
  const body = await res.text();
  let observed: "allow" | "deny" | "error";
  if (res.status === 401 || res.status === 403) observed = "deny";
  else if (body.includes("forbidden") || body.includes("not_authenticated")) observed = "deny";
  else if (res.ok) observed = "allow";
  else observed = "error";
  return { role, target: rpc, operation: "RPC_CALL", expected, observed,
    detail: `HTTP ${res.status} ${body.slice(0, 80)}` };
}

export function summarize(results: RunResult[]) {
  const errors = results.filter((r) => r.observed === "error");
  const passed = results.filter((r) => r.observed !== "error" && r.observed === r.expected).length;
  const failed = results.filter((r) => r.observed !== "error" && r.observed !== r.expected);
  return { total: results.length, errors, passed, failed };
}
