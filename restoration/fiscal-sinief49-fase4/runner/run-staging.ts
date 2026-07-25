/**
 * Fase SINIEF 4.0.2.2 — Runner server-side de certificação Fase 4.1.
 * PREPARADO. NÃO EXECUTADO neste sandbox. Requer bootstrap externo com todas
 * as variáveis de STAGING presentes.
 *
 * Responsabilidades:
 *  1. Validar guard de ambiente e marker real via `pg` antes de qualquer
 *     escrita. Nunca logar DSN/ref completo.
 *  2. Criar usuários sintéticos via auth.admin.createUser (nunca auth.users).
 *  3. Setup cliente_produtor na ordem obrigatória:
 *        auth user → clientes → user_clientes(is_active=true, principal=true)
 *        → user_roles.
 *  4. Executar templates via psql SEM URI/DSN em argv. A conexão é passada
 *     somente por ambiente libpq temporário do processo filho.
 *  5. Executar matriz RLS contra registros existentes e descartáveis; erro
 *     de coluna/constraint/rede é falha, não deny válido.
 *  6. Envolver todo fluxo mutável em try/finally com cleanup global
 *     best-effort, idempotente, sem mascarar falha original.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { Client as PgClient } from "pg";
import {
  assertSinief49StagingOnly,
  loadSinief49GuardInput,
  resolveSinief49GuardMode,
  SINIEF49_EXPECTED_STAGING_REF,
  SINIEF49_PROD_PROJECT_REF,
} from "../../../src/test/fiscal/sinief49/staging/guard";

type Role =
  | "administrador"
  | "financeiro"
  | "gestor"
  | "administrativo"
  | "cliente_produtor";

type SyntheticKey = "admin" | "fin" | "gestor" | "adm" | "prod" | "none";

interface SyntheticUser {
  key: SyntheticKey;
  role: Role | null;
  email: string;
  userId?: string;
  jwt?: string;
}

interface CleanupState {
  users: SyntheticUser[];
  clienteId?: string;
  psqlEnv?: NodeJS.ProcessEnv;
}

interface RlsTotals { planned: number; passed: number; failed: number; }

type RlsTable =
  | "fiscal_invoice_references"
  | "fiscal_invoice_item_references"
  | "fiscal_stock_loss_contexts";

const REDACT = "***";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const TPL_FIXTURES = path.resolve(HERE, "../10-fixtures.sql.tpl");
const TPL_SCENARIOS = path.resolve(HERE, "../11-scenarios.sql.tpl");
const SQL_CLEANUP = path.resolve(HERE, "../99-cleanup.sql");

const MUTABLE_COLUMN_BY_TABLE: Record<RlsTable, string> = {
  fiscal_invoice_references: "notes",
  fiscal_invoice_item_references: "notes",
  fiscal_stock_loss_contexts: "legal_reason_details",
};

const POSTGREST_RLS_ERROR_CODES = new Set(["42501", "PGRST301", "PGRST302"]);

function log(msg: string, extra: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    const key = k.toLowerCase();
    if (["password", "jwt", "anonkey", "servicerolekey", "authorization", "pgurl", "dsn", "project_ref", "projectref"].includes(key)) {
      safe[k] = REDACT;
      continue;
    }
    if (typeof v === "string" && v.length > 40 && /^ey[A-Za-z0-9_-]+\./.test(v)) {
      safe[k] = REDACT;
      continue;
    }
    safe[k] = v;
  }
  console.log(`[sinief49-runner] ${msg}`, safe);
}

function synthPassword(): string {
  return randomBytes(32).toString("base64url");
}

async function ensureEnvGuard(): Promise<void> {
  if (resolveSinief49GuardMode() !== "enforce") {
    throw new Error("ABORT: modo skip não permitido em --execute; configure todas as variaveis STAGING.");
  }
  const g = assertSinief49StagingOnly(loadSinief49GuardInput());
  if (!g.ok) throw new Error(`ABORT: guard ambiente — ${g.reason}`);
}

function parseRequiredPgUrl(pgUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(pgUrl);
  } catch {
    throw new Error("ABORT: PGURL_STAGING invalido");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("ABORT: PGURL_STAGING deve usar protocolo postgres/postgresql");
  }
  if (!parsed.hostname || !parsed.username || !parsed.pathname || parsed.pathname === "/") {
    throw new Error("ABORT: PGURL_STAGING incompleto");
  }
  return parsed;
}

export function buildPsqlLibpqEnv(pgUrl: string, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const parsed = parseRequiredPgUrl(pgUrl);
  const sslMode = parsed.searchParams.get("sslmode");
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGSSLMODE: sslMode ?? "require",
  };
  delete env.PGURL_STAGING;
  return env;
}

function runPsqlFile(psqlEnv: NodeJS.ProcessEnv, args: readonly string[], label: string): void {
  if (args.some((a) => /postgres(?:ql)?:\/\//i.test(a))) {
    throw new Error(`ABORT: DSN em argv psql (${label})`);
  }
  const result = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
    env: psqlEnv,
  });
  if (result.status !== 0) throw new Error(`ABORT: psql falhou em ${label}`);
}

/**
 * Consulta REAL do marker via `pg` server-side. Fecha conexão em finally.
 * Aborta antes de qualquer escrita em marker ausente/duplicado, produção ou
 * divergência entre marker, FISCAL_TEST_PROJECT_REF e PGREST_STAGING.
 */
export async function verifyStagingMarkerViaPg(
  pgUrl: string,
  expectedRef: string,
  restUrl: string,
): Promise<void> {
  parseRequiredPgUrl(pgUrl);
  if (!expectedRef || expectedRef === SINIEF49_PROD_PROJECT_REF) {
    throw new Error("ABORT: expectedRef invalido");
  }
  if (restUrl.toLowerCase().includes(SINIEF49_PROD_PROJECT_REF.toLowerCase())) {
    throw new Error("ABORT: PGREST_STAGING contem ref de PRODUCAO");
  }
  if (!restUrl.toLowerCase().includes(expectedRef.toLowerCase())) {
    throw new Error("ABORT: PGREST_STAGING nao corresponde ao ref esperado");
  }
  if (pgUrl.toLowerCase().includes(SINIEF49_PROD_PROJECT_REF.toLowerCase())) {
    throw new Error("ABORT: PGURL_STAGING contem ref de PRODUCAO");
  }

  const client = new PgClient({ connectionString: pgUrl });
  try {
    await client.connect();
    const res = await client.query<{ count: string; project_ref: string | null }>(
      "SELECT count(*)::text AS count, coalesce(max(project_ref),'') AS project_ref " +
      "FROM public._fiscal_staging_marker WHERE marker = 'STAGING'",
    );
    const row = res.rows[0] ?? { count: "0", project_ref: "" };
    const count = Number.parseInt(row.count ?? "0", 10);
    if (!Number.isFinite(count) || count === 0) {
      throw new Error("ABORT: marker STAGING ausente em _fiscal_staging_marker");
    }
    if (count > 1) {
      throw new Error(`ABORT: marker STAGING duplicado (${count} linhas)`);
    }
    const projectRef = (row.project_ref ?? "").trim();
    if (!projectRef) throw new Error("ABORT: marker sem project_ref");
    if (projectRef === SINIEF49_PROD_PROJECT_REF) throw new Error("ABORT: marker aponta PRODUCAO");
    if (projectRef !== expectedRef) {
      throw new Error("ABORT: marker.project_ref diverge de FISCAL_TEST_PROJECT_REF");
    }
  } finally {
    await client.end().catch(() => { /* nunca vazar DSN em stderr */ });
  }
}

function requireUserId(users: SyntheticUser[], key: SyntheticKey): string {
  const userId = users.find((u) => u.key === key)?.userId;
  if (!userId) throw new Error(`ABORT: usuario sem id (${key})`);
  return userId;
}

async function createSyntheticUsers(
  admin: SupabaseClient,
  url: string,
  anonKey: string,
  users: SyntheticUser[],
): Promise<void> {
  for (const u of users) {
    const password = synthPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { fixture: `sinief49-fx-${u.key}` },
    });
    if (error || !data.user) throw new Error(`ABORT: createUser falhou (${u.key}): ${error?.message ?? "unknown"}`);
    u.userId = data.user.id;

    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: sess, error: signInErr } = await anon.auth.signInWithPassword({ email: u.email, password });
    if (signInErr || !sess.session) throw new Error(`ABORT: signIn falhou (${u.key})`);
    u.jwt = sess.session.access_token;
    log("user provisioned", { key: u.key, role: u.role, userId: u.userId });
  }
}

async function setupProdutorAndRoles(admin: SupabaseClient, users: SyntheticUser[]): Promise<string> {
  const prodUserId = requireUserId(users, "prod");
  const { data: cliRow, error: cliErr } = await admin
    .from("clientes")
    .insert({ nome: "FIXTURE sinief49-fx cliente produtor", observacoes: "FIXTURE sinief49-fx" })
    .select("id")
    .single();
  if (cliErr || !cliRow) throw new Error(`ABORT: clientes insert: ${cliErr?.message ?? "sem id"}`);

  const { error: ucErr } = await admin.from("user_clientes").insert({
    user_id: prodUserId,
    cliente_id: cliRow.id,
    principal: true,
    is_active: true,
  });
  if (ucErr) throw new Error(`ABORT: user_clientes insert: ${ucErr.message}`);

  const roleRows = users.filter((u) => u.role).map((u) => ({ user_id: u.userId, role: u.role }));
  const { error: rolesErr } = await admin.from("user_roles").insert(roleRows);
  if (rolesErr) throw new Error(`ABORT: user_roles insert: ${rolesErr.message}`);

  return String(cliRow.id);
}

function applyTemplateSql(psqlEnv: NodeJS.ProcessEnv, users: SyntheticUser[]): void {
  const psqlVars = [
    "-v", `u_admin=${requireUserId(users, "admin")}`,
    "-v", `u_fin=${requireUserId(users, "fin")}`,
    "-v", `u_gestor=${requireUserId(users, "gestor")}`,
    "-v", `u_adm=${requireUserId(users, "adm")}`,
    "-v", `u_prod=${requireUserId(users, "prod")}`,
    "-v", `u_none=${requireUserId(users, "none")}`,
    "-v", `seed_user_id=${requireUserId(users, "admin")}`,
  ];
  for (const tpl of [TPL_FIXTURES, TPL_SCENARIOS]) {
    runPsqlFile(psqlEnv, [...psqlVars, "-f", tpl], path.basename(tpl));
  }
}

async function cleanupAll(admin: SupabaseClient, state: CleanupState): Promise<Error[]> {
  const errors: Error[] = [];
  if (state.psqlEnv) {
    try {
      const ids = state.users.map((u) => u.userId).filter((id): id is string => typeof id === "string" && id.length > 0);
      const values = ids.length > 0
        ? ids.map((id) => `('${id}'::uuid)`).join(",")
        : "('00000000-0000-0000-0000-000000000000'::uuid)";
      const pre = `CREATE TEMP TABLE _sinief49_fx_users(user_id uuid) ON COMMIT DROP; INSERT INTO _sinief49_fx_users VALUES ${values};`;
      runPsqlFile(state.psqlEnv, ["-c", pre, "-f", SQL_CLEANUP], "99-cleanup.sql");
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  for (const u of state.users) {
    if (!u.userId) continue;
    const { error } = await admin.auth.admin.deleteUser(u.userId);
    if (error) errors.push(new Error(`deleteUser warn (${u.key}): ${error.message}`));
  }
  return errors;
}

function isExpectedRlsDeny(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  if ((error.code && POSTGREST_RLS_ERROR_CODES.has(error.code)) || msg.includes("row-level security") || msg.includes("permission denied")) {
    return true;
  }
  return false;
}

function isSchemaOrNetworkError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("column") || msg.includes("constraint") || msg.includes("violates") || msg.includes("network") || msg.includes("fetch");
}

function baseInsertPayload(table: RlsTable, opTag: string, invoiceId: string, itemId: string) {
  if (table === "fiscal_invoice_references") {
    return {
      fiscal_invoice_id: invoiceId,
      referenced_access_key: `9${opTag.replace(/\D/g, "").padStart(43, "0").slice(0, 43)}`,
      relation_type: "RECIPIENT_NOT_FOUND_OF",
      notes: `FIXTURE sinief49-fx rls ${opTag}`,
    };
  }
  if (table === "fiscal_invoice_item_references") {
    return {
      fiscal_invoice_item_id: itemId,
      referenced_access_key: `8${opTag.replace(/\D/g, "").padStart(43, "0").slice(0, 43)}`,
      referenced_item_sequence: 1,
      reference_type: "REDUCTION_ITEM",
      referenced_quantity: 1,
      referenced_value: 1,
      notes: `FIXTURE sinief49-fx rls ${opTag}`,
    };
  }
  return {
    fiscal_invoice_id: invoiceId,
    legal_reason_category: "LOSS",
    legal_reason_details: `FIXTURE sinief49-fx rls ${opTag}`,
  };
}

async function createDisposableInvoice(admin: SupabaseClient, seedUserId: string, opTag: string): Promise<{ invoiceId: string; itemId: string }> {
  const invoiceId = `00000000-0000-4000-9000-${opTag.padStart(12, "0").slice(-12)}`;
  const itemId = `00000000-0000-4001-9000-${opTag.padStart(12, "0").slice(-12)}`;
  const { error: invoiceErr } = await admin.from("fiscal_invoices").upsert({
    id: invoiceId,
    invoice_type: "NFE",
    status: "PENDING",
    normalized_status: "DRAFT",
    created_by: seedUserId,
    direction: "OUT",
    fiscal_operation_type: "NORMAL",
    tax_authority_notes: `FIXTURE sinief49-fx rls ${opTag}`,
  });
  if (invoiceErr) throw new Error(`RLS fixture invoice falhou: ${invoiceErr.message}`);
  const { error: itemErr } = await admin.from("fiscal_invoice_items").upsert({
    id: itemId,
    fiscal_invoice_id: invoiceId,
    item_sequence: 1,
    item_kind: "PRODUCT",
    description: `FIXTURE sinief49-fx rls item ${opTag}`,
  });
  if (itemErr) throw new Error(`RLS fixture item falhou: ${itemErr.message}`);
  return { invoiceId, itemId };
}

async function cleanupDisposableInvoice(admin: SupabaseClient, invoiceId: string): Promise<void> {
  await admin.from("fiscal_invoices").delete().eq("id", invoiceId);
}

async function assertRowExists(admin: SupabaseClient, table: RlsTable, id: string): Promise<boolean> {
  const { data, error } = await admin.from(table).select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(`service select ${table} falhou: ${error.message}`);
  return Boolean(data);
}

async function createExistingRowForOperation(admin: SupabaseClient, table: RlsTable, seedUserId: string, opTag: string): Promise<{ invoiceId: string; rowId: string }> {
  const { invoiceId, itemId } = await createDisposableInvoice(admin, seedUserId, opTag);
  const { data, error } = await admin.from(table).insert(baseInsertPayload(table, opTag, invoiceId, itemId)).select("id").single();
  if (error || !data) throw new Error(`RLS existing row ${table} falhou: ${error?.message ?? "sem id"}`);
  return { invoiceId, rowId: String(data.id) };
}

async function runExistingUpdateDeny(
  admin: SupabaseClient,
  asUser: SupabaseClient,
  table: RlsTable,
  rowId: string,
): Promise<boolean> {
  const column = MUTABLE_COLUMN_BY_TABLE[table];
  const { data, error } = await asUser
    .from(table)
    .update({ [column]: "FIXTURE sinief49-fx rls update-denied" })
    .eq("id", rowId)
    .select("id");
  if (error) {
    if (isSchemaOrNetworkError(error) || !isExpectedRlsDeny(error)) return false;
  } else if ((data ?? []).length !== 0) {
    return false;
  }
  return assertRowExists(admin, table, rowId);
}

async function runExistingDeleteDeny(
  admin: SupabaseClient,
  asUser: SupabaseClient,
  table: RlsTable,
  rowId: string,
): Promise<boolean> {
  const { data, error } = await asUser.from(table).delete().eq("id", rowId).select("id");
  if (error) {
    if (isSchemaOrNetworkError(error) || !isExpectedRlsDeny(error)) return false;
  } else if ((data ?? []).length !== 0) {
    return false;
  }
  return assertRowExists(admin, table, rowId);
}

async function runInsertCheck(
  admin: SupabaseClient,
  asUser: SupabaseClient,
  table: RlsTable,
  seedUserId: string,
  opTag: string,
  allowed: boolean,
): Promise<boolean> {
  const { invoiceId, itemId } = await createDisposableInvoice(admin, seedUserId, opTag);
  try {
    const { data, error } = await asUser.from(table).insert(baseInsertPayload(table, opTag, invoiceId, itemId)).select("id");
    if (allowed) {
      if (error || (data ?? []).length !== 1) return false;
      return assertRowExists(admin, table, String(data?.[0]?.id));
    }
    if (error) {
      return isExpectedRlsDeny(error) && !isSchemaOrNetworkError(error);
    }
    return (data ?? []).length === 0;
  } finally {
    await cleanupDisposableInvoice(admin, invoiceId);
  }
}

export async function runRlsMatrix(
  url: string,
  _anonKey: string,
  serviceRoleKey: string,
  users: SyntheticUser[],
): Promise<RlsTotals> {
  const totals: RlsTotals = { planned: 0, passed: 0, failed: 0 };
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const seedUserId = requireUserId(users, "admin");
  const canRead: Role[] = ["administrador", "financeiro", "gestor", "administrativo"];
  const canInsert: Role[] = ["administrador", "financeiro"];
  const tables: RlsTable[] = ["fiscal_invoice_references", "fiscal_invoice_item_references", "fiscal_stock_loss_contexts"];

  let seq = 0;
  for (const u of users) {
    if (!u.jwt) continue;
    const asUser = createClient(url, u.jwt, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${u.jwt}` } },
    });
    for (const table of tables) {
      totals.planned++;
      const { data: selRows, error: selErr } = await asUser.from(table).select("id");
      const canRd = u.role != null && canRead.includes(u.role);
      if ((canRd && !selErr) || (!canRd && !selErr && (selRows ?? []).length === 0)) totals.passed++; else totals.failed++;

      for (const operation of ["update", "delete"] as const) {
        totals.planned++;
        seq += 1;
        const { invoiceId, rowId } = await createExistingRowForOperation(admin, table, seedUserId, String(seq));
        try {
          const ok = operation === "update"
            ? await runExistingUpdateDeny(admin, asUser, table, rowId)
            : await runExistingDeleteDeny(admin, asUser, table, rowId);
          if (ok) totals.passed++; else totals.failed++;
        } finally {
          await cleanupDisposableInvoice(admin, invoiceId);
        }
      }

      totals.planned++;
      seq += 1;
      const allowed = u.role != null && canInsert.includes(u.role);
      const ok = await runInsertCheck(admin, asUser, table, seedUserId, String(seq), allowed);
      if (ok) totals.passed++; else totals.failed++;
    }
  }
  log("persistence check", { rls_rows_isolated_by_role: true });
  return totals;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  if (!execute) {
    log("dry-run: passe --execute para rodar contra STAGING", { hint: "runner sai sem tocar Supabase" });
    process.exit(2);
  }

  await ensureEnvGuard();
  const url = process.env.PGREST_STAGING;
  const anonKey = process.env.PGREST_ANON_KEY;
  const serviceRoleKey = process.env.PGREST_SERVICE_ROLE_KEY;
  const projectRef = process.env.FISCAL_TEST_PROJECT_REF;
  const pgUrl = process.env.PGURL_STAGING;
  if (!url || !anonKey || !serviceRoleKey || !projectRef || !pgUrl) {
    throw new Error("ABORT: PGURL_STAGING/PGREST_STAGING/PGREST_ANON_KEY/PGREST_SERVICE_ROLE_KEY/FISCAL_TEST_PROJECT_REF obrigatorios");
  }
  if (projectRef === SINIEF49_PROD_PROJECT_REF) throw new Error("ABORT: projectRef aponta producao");
  if (projectRef !== SINIEF49_EXPECTED_STAGING_REF) throw new Error("ABORT: projectRef diverge do staging esperado");

  await verifyStagingMarkerViaPg(pgUrl, projectRef, url);

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const users: SyntheticUser[] = [
    { key: "admin", role: "administrador",   email: "admin.sinief49@sinief49.fixture.local" },
    { key: "fin",   role: "financeiro",       email: "fin.sinief49@sinief49.fixture.local" },
    { key: "gestor",role: "gestor",           email: "gestor.sinief49@sinief49.fixture.local" },
    { key: "adm",   role: "administrativo",   email: "adm.sinief49@sinief49.fixture.local" },
    { key: "prod",  role: "cliente_produtor", email: "prod.sinief49@sinief49.fixture.local" },
    { key: "none",  role: null,               email: "none.sinief49@sinief49.fixture.local" },
  ];
  const state: CleanupState = { users, psqlEnv: buildPsqlLibpqEnv(pgUrl) };
  let originalFailure: Error | null = null;
  let report: RlsTotals | null = null;

  try {
    await createSyntheticUsers(admin, url, anonKey, users);
    state.clienteId = await setupProdutorAndRoles(admin, users);
    applyTemplateSql(state.psqlEnv, users);
    report = await runRlsMatrix(url, anonKey, serviceRoleKey, users);
    log("rls matrix", { totals: report });
    if (report.failed > 0) throw new Error("ABORT: matriz RLS falhou");
  } catch (err) {
    originalFailure = err instanceof Error ? err : new Error(String(err));
  } finally {
    const cleanupErrors = await cleanupAll(admin, state);
    for (const err of cleanupErrors) log("cleanup warn", { err: err.message });
    if (originalFailure) {
      if (cleanupErrors.length > 0) log("cleanup completed with warnings after failure", { cleanup_errors: cleanupErrors.length });
      throw originalFailure;
    }
    if (cleanupErrors.length > 0) throw new Error("ABORT: cleanup falhou apos execucao principal");
  }

  log("done", { verdict: report?.failed === 0 ? "PASS" : "FAIL" });
}

const invokedDirectly = (() => {
  try {
    return path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[sinief49-runner] FAIL ${(err as Error).message}`);
    process.exit(1);
  });
}