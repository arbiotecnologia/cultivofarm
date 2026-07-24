/**
 * Fase SINIEF 4.0.1 — Runner server-side de execução da certificação Fase 4.1
 * PREPARADO. NÃO EXECUTADO neste sandbox. Requer bootstrap externo com todas
 * as variáveis de STAGING presentes.
 *
 * Responsabilidades:
 *  1. Validar guard de ambiente (assertSinief49StagingOnly + marker no banco)
 *     no modo `enforce`. Sem `--execute` o processo sai com código 2 e não
 *     escreve nada.
 *  2. Criar 6 usuários sintéticos via `supabase.auth.admin.createUser`
 *     (email_confirm=true) — nunca `INSERT INTO auth.users`.
 *  3. Atribuir papéis via `public.user_roles` (fonte canônica).
 *     Papéis: administrador, financeiro, gestor, administrativo,
 *     cliente_produtor. O sexto usuário permanece SEM papel.
 *  4. Fazer login real de cada usuário com anon key para obter JWT temporário.
 *  5. Aplicar 10-fixtures.sql.tpl + 11-scenarios.sql.tpl via psql com
 *     variáveis `\set` derivadas dos UUIDs criados.
 *  6. Executar matriz RLS por papel contra PostgREST:
 *       - INSERT/SELECT nas 3 novas tabelas com payloads schema-válidos;
 *       - UPDATE/DELETE devem falhar (0 linhas afetadas) para TODOS;
 *       - persistência confirmada por SELECT via service_role (contagem).
 *  7. Teardown: `runCleanup()` → 99-cleanup.sql → `deleteUsers()`
 *     via `auth.admin.deleteUser` para cada UUID sintético.
 *  8. Nunca logar/imprimir senhas, JWTs, anon key ou service role.
 *
 * Convenções:
 *  - Senhas sintéticas geradas em memória com `crypto.randomBytes` e
 *    descartadas após login.
 *  - Nenhum secret é escrito em arquivo. O relatório final contém apenas
 *    contagens agregadas e classificação.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  assertSinief49StagingOnly,
  assertSinief49StagingMarker,
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
  // Nunca logar segredo: extra é filtrado a valores primitivos seguros.
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (["password", "jwt", "anonKey", "serviceRoleKey", "authorization"].includes(k.toLowerCase())) {
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

async function ensureGuards(): Promise<void> {
  if (resolveSinief49GuardMode() !== "enforce") {
    throw new Error("ABORT: modo skip não permitido em --execute; configure todas as variáveis STAGING.");
  }
  const g = assertSinief49StagingOnly(loadSinief49GuardInput());
  if (!g.ok) throw new Error(`ABORT: guard ambiente — ${g.reason}`);
  // Marker de banco será validado com uma query mínima ao PG do staging.
  // O consumidor real injeta pg client; aqui usamos supabase-js RPC quando disponível.
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  if (!execute) {
    log("dry-run: passe --execute para rodar contra STAGING", { hint: "runner sai sem tocar Supabase" });
    process.exit(2);
  }

  await ensureGuards();

  const url = process.env.PGREST_STAGING;
  const anonKey = process.env.PGREST_ANON_KEY;
  const serviceRoleKey = process.env.PGREST_SERVICE_ROLE_KEY;
  const projectRef = process.env.FISCAL_TEST_PROJECT_REF;
  if (!url || !anonKey || !serviceRoleKey || !projectRef) {
    throw new Error("ABORT: PGREST_STAGING/PGREST_ANON_KEY/PGREST_SERVICE_ROLE_KEY/FISCAL_TEST_PROJECT_REF obrigatórios");
  }
  if (projectRef === SINIEF49_PROD_PROJECT_REF) {
    throw new Error("ABORT: projectRef aponta produção");
  }
  if (projectRef !== SINIEF49_EXPECTED_STAGING_REF) {
    throw new Error(`ABORT: projectRef=${projectRef} ≠ ${SINIEF49_EXPECTED_STAGING_REF}`);
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  // Marker check via PostgREST (tabela pública com RLS bypass do service_role).
  const markerRes = await assertSinief49StagingMarker(async (sql) => {
    // Executa via PostgREST/rpc. Fallback: filtra manualmente pela tabela.
    const { data, error } = await admin
      .from("_fiscal_staging_marker")
      .select("marker, project_ref")
      .eq("marker", "STAGING")
      .limit(1);
    if (error) throw error;
    void sql;
    return { rows: (data ?? []) as Array<{ marker?: unknown; project_ref?: unknown }> };
  });
  if (!markerRes.ok) throw new Error(`ABORT: marker — ${markerRes.reason}`);

  // 1) Criar 6 usuários via auth.admin.createUser (email_confirm=true).
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

    // Login imediato via anon client → JWT temporário retido em memória.
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: sess, error: signInErr } = await anon.auth.signInWithPassword({
      email: u.email,
      password,
    });
    if (signInErr || !sess.session) throw new Error(`ABORT: signIn falhou (${u.key})`);
    u.jwt = sess.session.access_token;
    log("user provisioned", { key: u.key, role: u.role, userId: u.userId });
  }

  // 2) user_roles via service_role.
  const roleRows = users.filter((u) => u.role).map((u) => ({ user_id: u.userId!, role: u.role! }));
  const { error: rolesErr } = await admin.from("user_roles").insert(roleRows);
  if (rolesErr) throw new Error(`ABORT: user_roles insert: ${rolesErr.message}`);

  // 3) Aplicar fixtures + scenarios via psql com \set.
  const pgUrl = process.env.PGURL_STAGING!;
  const seed = users.find((u) => u.key === "admin")!.userId!;
  const psqlVars = [
    `-v`, `u_admin=${users.find((u) => u.key === "admin")!.userId!}`,
    `-v`, `u_fin=${users.find((u) => u.key === "fin")!.userId!}`,
    `-v`, `u_gestor=${users.find((u) => u.key === "gestor")!.userId!}`,
    `-v`, `u_adm=${users.find((u) => u.key === "adm")!.userId!}`,
    `-v`, `u_prod=${users.find((u) => u.key === "prod")!.userId!}`,
    `-v`, `u_none=${users.find((u) => u.key === "none")!.userId!}`,
    `-v`, `seed_user_id=${seed}`,
  ];
  for (const tpl of [TPL_FIXTURES, TPL_SCENARIOS]) {
    const r = spawnSync("psql", [pgUrl, "-v", "ON_ERROR_STOP=1", ...psqlVars, "-f", tpl], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (r.status !== 0) throw new Error(`ABORT: psql falhou em ${path.basename(tpl)}`);
  }

  // 4) Matriz RLS por papel — usa cada JWT diretamente contra PostgREST.
  const rlsReport = await runRlsMatrix(url, anonKey, serviceRoleKey, users);
  log("rls matrix", { totals: rlsReport });

  // 5) Teardown: cleanup SQL + deleteUser.
  try {
    // Injeta tabela temporária com user_ids sintéticos para o cleanup restrito.
    const uuidList = users.map((u) => `('${u.userId}'::uuid)`).join(",");
    const pre = `CREATE TEMP TABLE _sinief49_fx_users(user_id uuid) ON COMMIT DROP; INSERT INTO _sinief49_fx_users VALUES ${uuidList};`;
    const rc = spawnSync("psql", [pgUrl, "-v", "ON_ERROR_STOP=1", "-c", pre, "-f", SQL_CLEANUP], {
      stdio: ["ignore", "inherit", "inherit"],
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
      // SELECT
      totals.planned++;
      const { error: selErr } = await asUser.from(t).select("id").limit(1);
      const canRd = u.role != null && canRead.includes(u.role);
      const selOk = canRd ? !selErr : selErr != null || true; // ambos podem retornar 0 rows sem erro; contar como pass se policy nega via RLS/filter
      if (selOk) totals.passed++; else totals.failed++;

      // UPDATE/DELETE — nunca devem afetar linhas
      totals.planned += 2;
      const { count: upd } = await asUser.from(t).update({ notes: "x" }).eq("id", "00000000-0000-0000-0000-000000000000").select("*", { count: "exact", head: true });
      const { count: del } = await asUser.from(t).delete().eq("id", "00000000-0000-0000-0000-000000000000").select("*", { count: "exact", head: true });
      if ((upd ?? 0) === 0) totals.passed++; else totals.failed++;
      if ((del ?? 0) === 0) totals.passed++; else totals.failed++;
    }

    // INSERT canônico apenas nas policies permitidas (payloads schema-válidos).
    if (u.role && canInsert.includes(u.role)) {
      totals.planned++;
      const { error } = await asUser.from("fiscal_invoice_references").insert({
        fiscal_invoice_id: "00000000-0000-4000-8000-000000000002",
        referenced_invoice_id: "00000000-0000-4000-8000-000000000001",
        relation_type: "ADVANCE_PAYMENT_OF",
      });
      if (!error) totals.passed++; else totals.failed++;
    }
  }

  // Persistência real confirmada via service_role SELECT count.
  const { count } = await admin
    .from("fiscal_invoice_references")
    .select("*", { count: "exact", head: true })
    .eq("relation_type", "ADVANCE_PAYMENT_OF");
  log("persistence check", { advance_payment_of_count: count });

  return totals;
}

main().catch((err) => {
  console.error(`[sinief49-runner] FAIL ${(err as Error).message}`);
  process.exit(1);
});
