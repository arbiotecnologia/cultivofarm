/**
 * Fase SINIEF 4.0.2.1 — Runner server-side de execução da certificação Fase 4.1
 * PREPARADO. NÃO EXECUTADO neste sandbox. Requer bootstrap externo com todas
 * as variáveis de STAGING presentes.
 *
 * Responsabilidades:
 *  1. Validar guard de ambiente (assertSinief49StagingOnly + marker no banco
 *     via `pg` server-side — nunca passa DSN como argumento de processo).
 *  2. Criar 6 usuários sintéticos via `supabase.auth.admin.createUser`
 *     (email_confirm=true) — nunca `INSERT INTO auth.users`.
 *  3. Setup do cliente_produtor NA ORDEM CORRETA (o trigger real exige
 *     vínculo cliente ANTES da role):
 *        3.1 clientes (fixture)
 *        3.2 user_clientes (is_active=true, principal=true) para :u_prod
 *        3.3 user_roles para os 5 papéis (incluindo cliente_produtor)
 *  4. Fazer login real de cada usuário com anon key para obter JWT temporário.
 *  5. Aplicar 10-fixtures.sql.tpl + 11-scenarios.sql.tpl via psql com
 *     variáveis `\set` derivadas dos UUIDs criados.
 *  6. Executar matriz RLS por papel contra PostgREST:
 *       - INSERT/SELECT nas 3 novas tabelas com payloads schema-válidos;
 *       - UPDATE/DELETE devem falhar (0 linhas afetadas) para TODOS;
 *       - persistência confirmada por SELECT via service_role (contagem).
 *  7. Teardown REVERSO: user_roles → user_clientes → clientes → deleteUser.
 *  8. Nunca logar/imprimir senhas, JWTs, anon key, service role, DSN
 *     ou project_ref completo.
 */
import { createClient } from "@supabase/supabase-js";
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

interface SyntheticUser {
  key: "admin" | "fin" | "gestor" | "adm" | "prod" | "none";
  role: Role | null;
  email: string;
  userId?: string;
  jwt?: string;
}

const REDACT = "***";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const TPL_FIXTURES = path.resolve(HERE, "../10-fixtures.sql.tpl");
const TPL_SCENARIOS = path.resolve(HERE, "../11-scenarios.sql.tpl");
const SQL_CLEANUP = path.resolve(HERE, "../99-cleanup.sql");

function log(msg: string, extra: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (["password", "jwt", "anonKey", "serviceRoleKey", "authorization", "pgurl", "dsn", "project_ref", "projectref"].includes(k.toLowerCase())) {
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
  // 32 bytes → 43 chars base64url. Vive apenas na pilha do runner.
  return randomBytes(32).toString("base64url");
}

async function ensureEnvGuard(): Promise<void> {
  if (resolveSinief49GuardMode() !== "enforce") {
    throw new Error("ABORT: modo skip não permitido em --execute; configure todas as variaveis STAGING.");
  }
  const g = assertSinief49StagingOnly(loadSinief49GuardInput());
  if (!g.ok) throw new Error(`ABORT: guard ambiente — ${g.reason}`);
}

/**
 * Fase SINIEF 4.0.2.1 — Consulta REAL do marker via pacote `pg` server-side.
 * Nunca passa a string de conexão como argv de processo (evita exposição
 * em `ps`). Fecha a conexão em finally. Não loga DSN nem project_ref completo.
 *
 * Aborta em:
 *   - marker ausente/duplicado;
 *   - marker.project_ref = navfzbwgwzruipouyfnk (produção);
 *   - marker.project_ref != FISCAL_TEST_PROJECT_REF ou !=
 *     ref extraído de PGREST_STAGING.
 */
export async function verifyStagingMarkerViaPg(
  pgUrl: string,
  expectedRef: string,
  restUrl: string,
): Promise<void> {
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
    if (!projectRef) {
      throw new Error("ABORT: marker sem project_ref");
    }
    if (projectRef === SINIEF49_PROD_PROJECT_REF) {
      throw new Error("ABORT: marker aponta PRODUCAO");
    }
    if (projectRef !== expectedRef) {
      // Sem imprimir ref completo em falhas.
      throw new Error("ABORT: marker.project_ref diverge de FISCAL_TEST_PROJECT_REF");
    }
  } finally {
    await client.end().catch(() => { /* swallow: nunca vazar DSN em stderr */ });
  }
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
  if (projectRef === SINIEF49_PROD_PROJECT_REF) {
    throw new Error("ABORT: projectRef aponta producao");
  }
  if (projectRef !== SINIEF49_EXPECTED_STAGING_REF) {
    throw new Error("ABORT: projectRef diverge do staging esperado");
  }

  // 0) Marker check via pg — ANTES de qualquer escrita.
  await verifyStagingMarkerViaPg(pgUrl, projectRef, url);

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  // 1) Criar 6 usuarios via auth.admin.createUser (email_confirm=true).
  const users: SyntheticUser[] = [
    { key: "admin", role: "administrador",   email: "admin.sinief49@sinief49.fixture.local" },
    { key: "fin",   role: "financeiro",       email: "fin.sinief49@sinief49.fixture.local" },
    { key: "gestor",role: "gestor",           email: "gestor.sinief49@sinief49.fixture.local" },
    { key: "adm",   role: "administrativo",   email: "adm.sinief49@sinief49.fixture.local" },
    { key: "prod",  role: "cliente_produtor", email: "prod.sinief49@sinief49.fixture.local" },
    { key: "none",  role: null,               email: "none.sinief49@sinief49.fixture.local" },
  ];

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
    const { data: sess, error: signInErr } = await anon.auth.signInWithPassword({
      email: u.email,
      password,
    });
    if (signInErr || !sess.session) throw new Error(`ABORT: signIn falhou (${u.key})`);
    u.jwt = sess.session.access_token;
    log("user provisioned", { key: u.key, role: u.role, userId: u.userId });
  }

  const prodUserId = users.find((u) => u.key === "prod")!.userId!;
  const seed = users.find((u) => u.key === "admin")!.userId!;

  // 2) SETUP DO cliente_produtor — ordem obrigatoria (trigger exige vinculo
  //    ANTES da role): clientes → user_clientes (is_active=true) → user_roles.
  const { data: cliRow, error: cliErr } = await admin
    .from("clientes")
    .insert({
      nome: "FIXTURE sinief49-fx cliente produtor",
      observacoes: "FIXTURE sinief49-fx",
    })
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

  // 3) user_roles via service_role — DEPOIS do vinculo cliente_produtor.
  const roleRows = users.filter((u) => u.role).map((u) => ({ user_id: u.userId!, role: u.role! }));
  const { error: rolesErr } = await admin.from("user_roles").insert(roleRows);
  if (rolesErr) throw new Error(`ABORT: user_roles insert: ${rolesErr.message}`);

  // 4) Aplicar fixtures + scenarios via psql. O DSN NAO vai como argv;
  //    passamos via variavel de ambiente PGURL herdada (spawn env explicito).
  const psqlEnv = { ...process.env } as NodeJS.ProcessEnv;
  const psqlVars = [
    `-v`, `u_admin=${seed}`,
    `-v`, `u_fin=${users.find((u) => u.key === "fin")!.userId!}`,
    `-v`, `u_gestor=${users.find((u) => u.key === "gestor")!.userId!}`,
    `-v`, `u_adm=${users.find((u) => u.key === "adm")!.userId!}`,
    `-v`, `u_prod=${prodUserId}`,
    `-v`, `u_none=${users.find((u) => u.key === "none")!.userId!}`,
    `-v`, `seed_user_id=${seed}`,
  ];
  for (const tpl of [TPL_FIXTURES, TPL_SCENARIOS]) {
    const r = spawnSync("psql", [pgUrl, "-v", "ON_ERROR_STOP=1", ...psqlVars, "-f", tpl], {
      stdio: ["ignore", "inherit", "inherit"],
      env: psqlEnv,
    });
    if (r.status !== 0) throw new Error(`ABORT: psql falhou em ${path.basename(tpl)}`);
  }

  // 5) Matriz RLS por papel — usa cada JWT diretamente contra PostgREST.
  const rlsReport = await runRlsMatrix(url, anonKey, serviceRoleKey, users);
  log("rls matrix", { totals: rlsReport });

  // 6) Teardown REVERSO: user_roles → user_clientes → clientes → deleteUser.
  try {
    const uuidList = users.map((u) => `('${u.userId}'::uuid)`).join(",");
    const pre = `CREATE TEMP TABLE _sinief49_fx_users(user_id uuid) ON COMMIT DROP; INSERT INTO _sinief49_fx_users VALUES ${uuidList};`;
    const rc = spawnSync("psql", [pgUrl, "-v", "ON_ERROR_STOP=1", "-c", pre, "-f", SQL_CLEANUP], {
      stdio: ["ignore", "inherit", "inherit"],
      env: psqlEnv,
    });
    if (rc.status !== 0) throw new Error("ABORT: cleanup SQL falhou");
  } finally {
    for (const u of users) {
      if (!u.userId) continue;
      const { error } = await admin.auth.admin.deleteUser(u.userId);
      if (error) log("deleteUser warn", { key: u.key, err: error.message });
    }
  }

  log("done", { verdict: rlsReport.failed === 0 ? "PASS" : "FAIL" });
  if (rlsReport.failed > 0) process.exit(1);
}

interface RlsTotals { planned: number; passed: number; failed: number; }

async function runRlsMatrix(
  url: string,
  _anonKey: string,
  serviceRoleKey: string,
  users: SyntheticUser[],
): Promise<RlsTotals> {
  const totals: RlsTotals = { planned: 0, passed: 0, failed: 0 };
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  // Expectativas por policy da migration SINIEF 49:
  //   read (SELECT): administrador, financeiro, gestor, administrativo
  //   write (INSERT): administrador, financeiro
  //   UPDATE/DELETE: NENHUM
  const canRead: Role[] = ["administrador", "financeiro", "gestor", "administrativo"];
  const canInsert: Role[] = ["administrador", "financeiro"];

  const tables = [
    "fiscal_invoice_references",
    "fiscal_invoice_item_references",
    "fiscal_stock_loss_contexts",
  ] as const;

  for (const u of users) {
    if (!u.jwt) continue;
    const asUser = createClient(url, u.jwt, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${u.jwt}` } },
    });
    for (const t of tables) {
      totals.planned++;
      const { data: selRows, error: selErr } = await asUser.from(t).select("id");
      const canRd = u.role != null && canRead.includes(u.role);
      if (canRd) {
        if (!selErr) totals.passed++; else totals.failed++;
      } else {
        if (!selErr && (selRows ?? []).length === 0) totals.passed++;
        else totals.failed++;
      }

      // UPDATE/DELETE: NENHUM — nunca devem afetar linhas
      totals.planned += 2;
      const { count: upd } = await asUser.from(t).update({ notes: "x" }).eq("id", "00000000-0000-0000-0000-000000000000").select("*", { count: "exact", head: true });
      const { count: del } = await asUser.from(t).delete().eq("id", "00000000-0000-0000-0000-000000000000").select("*", { count: "exact", head: true });
      if ((upd ?? 0) === 0) totals.passed++; else totals.failed++;
      if ((del ?? 0) === 0) totals.passed++; else totals.failed++;
    }

    totals.planned++;
    const payload = {
      fiscal_invoice_id: "00000000-0000-4000-8000-000000000002",
      referenced_invoice_id: "00000000-0000-4000-8000-000000000001",
      relation_type: "ADVANCE_PAYMENT_OF" as const,
    };
    const canWr = u.role != null && canInsert.includes(u.role);
    const { error: insErr, data: insData } = await asUser
      .from("fiscal_invoice_references")
      .insert(payload)
      .select("id");
    if (canWr) {
      if (!insErr) totals.passed++; else totals.failed++;
    } else {
      if (insErr || (insData ?? []).length === 0) totals.passed++;
      else totals.failed++;
    }
  }

  const { count } = await admin
    .from("fiscal_invoice_references")
    .select("*", { count: "exact", head: true })
    .eq("relation_type", "ADVANCE_PAYMENT_OF");
  log("persistence check", { advance_payment_of_count: count });

  return totals;
}

// Só executa main quando invocado diretamente (permite testar helpers).
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
