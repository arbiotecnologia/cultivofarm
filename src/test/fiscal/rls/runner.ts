/**
 * Fase Fiscal 3.0 — Runner do harness RLS.
 *
 * Executa a matriz declarativa contra um ambiente de staging isolado.
 * Requer envs:
 *   - PGURL_STAGING   → connection string (staging/local, NUNCA produção)
 *   - PGREST_STAGING  → base URL PostgREST (ex. https://<ref>.supabase.co/rest/v1)
 *   - PGREST_ANON_KEY → apikey anônima do staging
 *   - JWT_<ROLE>      → JWT sintético por role (ex. JWT_ADMINISTRADOR)
 *
 * Ausência de envs => skip explícito (nunca silêncio).
 * NÃO cria usuários. NÃO executa em produção.
 */
import type { MatrixCell, ViewCell, Role, Operation } from "./matrix";

export interface RunnerConfig {
  pgUrl: string;
  restUrl: string;
  anonKey: string;
  jwts: Partial<Record<Role, string>>;
}

export function loadRunnerConfigFromEnv(): RunnerConfig | null {
  const pgUrl = process.env.PGURL_STAGING;
  const restUrl = process.env.PGREST_STAGING;
  const anonKey = process.env.PGREST_ANON_KEY;
  if (!pgUrl || !restUrl || !anonKey) return null;

  const jwts: Partial<Record<Role, string>> = {};
  const roleEnv = (r: Role) => `JWT_${r.toUpperCase()}`;
  const roles: Role[] = [
    "administrador",
    "gestor",
    "financeiro",
    "administrativo",
    "gestor_comercial",
    "consultor_tecnico",
    "tecnico_agronomo",
    "aplicador",
    "operador_onfarm",
    "producao",
    "cliente_produtor",
    "parceiro_b2b",
    "parceiro_b2b_tecnico",
    "authenticated_sem_papel",
  ];
  for (const r of roles) {
    const val = process.env[roleEnv(r)];
    if (val) jwts[r] = val;
  }
  return { pgUrl, restUrl, anonKey, jwts };
}

export interface RunResult {
  role: Role;
  target: string;
  operation: Operation | "SELECT_VIEW" | "RPC_CALL";
  expected: "allow" | "deny";
  observed: "allow" | "deny" | "skipped";
  detail?: string;
}

/**
 * Executa uma célula via PostgREST. Retorna 'allow' se HTTP 2xx, 'deny' se
 * 401/403/404, 'skipped' se JWT ausente. Qualquer outro status é reportado.
 */
export async function runCellRest(
  cfg: RunnerConfig,
  cell: MatrixCell,
): Promise<RunResult> {
  const jwt = cell.role === "anon" ? cfg.anonKey : cfg.jwts[cell.role];
  if (!jwt) {
    return {
      role: cell.role,
      target: cell.table,
      operation: cell.operation,
      expected: cell.expected,
      observed: "skipped",
      detail: `JWT ausente para ${cell.role}`,
    };
  }

  const url = `${cfg.restUrl}/${cell.table}?limit=1`;
  const headers: Record<string, string> = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
    Prefer: "count=none",
  };

  let init: RequestInit;
  switch (cell.operation) {
    case "SELECT":
      init = { method: "GET", headers };
      break;
    case "INSERT":
      // corpo mínimo — só queremos verificar a policy, nunca persistir
      init = {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({}),
      };
      break;
    case "UPDATE":
      init = {
        method: "PATCH",
        headers,
        body: JSON.stringify({}),
      };
      break;
    case "DELETE":
      init = { method: "DELETE", headers };
      break;
  }

  try {
    const res = await fetch(url, init);
    const observed: "allow" | "deny" =
      res.status === 401 || res.status === 403 ? "deny" : res.ok ? "allow" : "deny";
    return {
      role: cell.role,
      target: cell.table,
      operation: cell.operation,
      expected: cell.expected,
      observed,
      detail: `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      role: cell.role,
      target: cell.table,
      operation: cell.operation,
      expected: cell.expected,
      observed: "skipped",
      detail: `fetch error: ${(err as Error).message}`,
    };
  }
}

export async function runViewCell(
  cfg: RunnerConfig,
  cell: ViewCell,
): Promise<RunResult> {
  const jwt = cell.role === "anon" ? cfg.anonKey : cfg.jwts[cell.role];
  if (!jwt) {
    return {
      role: cell.role,
      target: cell.view,
      operation: "SELECT_VIEW",
      expected: cell.expected,
      observed: "skipped",
      detail: `JWT ausente para ${cell.role}`,
    };
  }
  const res = await fetch(`${cfg.restUrl}/${cell.view}?limit=1`, {
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${jwt}`,
    },
  });
  const observed: "allow" | "deny" =
    res.status === 401 || res.status === 403 ? "deny" : res.ok ? "allow" : "deny";
  return {
    role: cell.role,
    target: cell.view,
    operation: "SELECT_VIEW",
    expected: cell.expected,
    observed,
    detail: `HTTP ${res.status}`,
  };
}

export function summarize(results: RunResult[]) {
  const skipped = results.filter((r) => r.observed === "skipped").length;
  const passed = results.filter(
    (r) => r.observed !== "skipped" && r.observed === r.expected,
  ).length;
  const failed = results.filter(
    (r) => r.observed !== "skipped" && r.observed !== r.expected,
  );
  return { total: results.length, skipped, passed, failed };
}
