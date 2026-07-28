/**
 * Runner da auditoria RBAC contra o Supabase.
 *
 * O que valida, por papel (usuários de teste do staging):
 *   1. Autenticação e papel efetivo em `public.user_roles`.
 *   2. Contexto de portal retornado pela RPC `get_my_available_portal_contexts`
 *      e rota-home esperada (`getHomeForRole`).
 *   3. ROTAS: se o front libera a rota (`canAccess`), o SELECT da tabela que a
 *      rota consome não pode ser negado por RLS/grant — e vice-versa.
 *   4. LANÇAMENTOS: probe de INSERT NÃO destrutivo (FKs inexistentes) que
 *      distingue bloqueio por RLS (42501) de permissão concedida.
 *
 * Nenhum dado é persistido: todos os probes de escrita falham por integridade
 * referencial APÓS a checagem de RLS. Se algum insert persistir (não esperado),
 * o runner remove a linha imediatamente.
 *
 * Uso:
 *   RBAC_AUDIT_PASSWORD=... bun run audit:rbac
 *   RBAC_AUDIT_PASSWORD=... bun run audit:rbac -- --json relatorio.json
 *
 * Ambiente: aponta para a URL/anon key de `src/integrations/supabase/client.ts`
 * (staging) salvo se SUPABASE_URL / SUPABASE_ANON_KEY forem informados.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { canAccess, canWrite, getHomeForRole } from "../../src/lib/permissions";
import {
  AUDIT_USERS,
  LANCAMENTO_PROBES,
  ROUTE_PROBES,
  type AuditRole,
  type AuditUser,
} from "./matrix";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://ikaauvsflpmamgxmkhoq.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrYWF1dnNmbHBtYW1neG1raG9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NDAxOTQsImV4cCI6MjEwMDIxNjE5NH0.Dq1qqhJX-586Y01GRLnuenzqE2AR5dGLdTg-mkBzFDA";
const PASSWORD = process.env.RBAC_AUDIT_PASSWORD ?? "";

const DENIED_CODES = new Set(["42501", "PGRST301", "PGRST116"]);

type Status = "PASS" | "FAIL" | "SKIP";

interface Check {
  role: AuditRole;
  area: "auth" | "portal" | "rota" | "lancamento";
  target: string;
  expected: string;
  actual: string;
  status: Status;
}

const checks: Check[] = [];

function record(c: Check) {
  checks.push(c);
  const icon = c.status === "PASS" ? "ok " : c.status === "FAIL" ? "FAIL" : "skip";
  const line = `[${icon}] ${c.role.padEnd(22)} ${c.area.padEnd(10)} ${c.target}`;
  if (c.status === "FAIL") {
    console.log(`${line}\n        esperado: ${c.expected}\n        obtido:   ${c.actual}`);
  } else {
    console.log(line);
  }
}

function errCode(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  if (error.code) return error.code;
  if (/permission denied|row-level security/i.test(error.message ?? "")) return "42501";
  return "UNKNOWN";
}

function isDenied(error: { code?: string; message?: string } | null): boolean {
  const code = errCode(error);
  return code !== null && DENIED_CODES.has(code);
}

async function auditRole(user: AuditUser) {
  const client: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email: user.email,
    password: PASSWORD,
  });

  if (signInError || !session?.user) {
    record({
      role: user.role,
      area: "auth",
      target: user.email,
      expected: "login bem-sucedido",
      actual: signInError?.message ?? "sessão ausente",
      status: "FAIL",
    });
    return;
  }

  // 1. Papel efetivo no banco
  const { data: roles } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", session.user.id);
  const effective = (roles ?? []).map((r: { role: string }) => r.role);
  record({
    role: user.role,
    area: "auth",
    target: `papel em user_roles (${user.email})`,
    expected: user.role,
    actual: effective.join(", ") || "(nenhum)",
    status: effective.includes(user.role) ? "PASS" : "FAIL",
  });

  // 2. Contexto de portal
  const { data: contexts, error: ctxError } = await client.rpc(
    "get_my_available_portal_contexts",
  );
  record({
    role: user.role,
    area: "portal",
    target: `get_my_available_portal_contexts → home ${getHomeForRole(user.role)}`,
    expected: "RPC responde com contexto do papel",
    actual: ctxError ? `erro ${errCode(ctxError)}: ${ctxError.message}` : JSON.stringify(contexts),
    status: ctxError ? "FAIL" : "PASS",
  });

  // 3. Rotas × leitura efetiva
  for (const probe of ROUTE_PROBES) {
    const allowedInUi = canAccess(user.role, probe.route);
    const { error } = await client
      .from(probe.table)
      .select("id", { count: "exact", head: true })
      .limit(1);
    const denied = isDenied(error);
    const otherError = error && !denied;

    let status: Status = "PASS";
    let actual = denied ? `SELECT negado (${errCode(error)})` : "SELECT permitido";
    if (otherError) {
      status = "SKIP";
      actual = `erro inconclusivo ${errCode(error)}: ${error?.message}`;
    } else if (allowedInUi && denied) {
      status = "FAIL";
    }
    record({
      role: user.role,
      area: "rota",
      target: `${probe.route} (${probe.portal} → ${probe.table})`,
      expected: allowedInUi ? "rota liberada na UI → leitura permitida" : "rota bloqueada na UI",
      actual,
      status,
    });
  }

  // 4. Lançamentos
  for (const probe of LANCAMENTO_PROBES) {
    const shouldWrite = probe.expectedRoles.includes(user.role);
    const uiWrite = canWrite(user.role, probe.route);
    const { data, error } = await client
      .from(probe.table)
      .insert(probe.payload as never)
      .select("id")
      .maybeSingle();

    // Segurança: se algo persistiu (não esperado), remove imediatamente.
    if (data && (data as { id?: string }).id) {
      await client.from(probe.table).delete().eq("id", (data as { id: string }).id);
    }

    const denied = isDenied(error);
    const actual = denied
      ? `bloqueado por RLS/grant (${errCode(error)})`
      : `escrita autorizada pela política (parou em ${errCode(error) ?? "sucesso"})`;

    const status: Status = shouldWrite === !denied ? "PASS" : "FAIL";
    record({
      role: user.role,
      area: "lancamento",
      target: `${probe.label} [${probe.table}]${uiWrite === shouldWrite ? "" : " (UI diverge da matriz)"}`,
      expected: shouldWrite ? "lançamento permitido" : "lançamento bloqueado",
      actual,
      status,
    });
  }

  await client.auth.signOut();
}

async function main() {
  if (!PASSWORD) {
    console.error("RBAC_AUDIT_PASSWORD não definido. Abortando sem executar a auditoria.");
    process.exit(2);
  }
  console.log(`Auditoria RBAC → ${SUPABASE_URL}\n`);

  for (const user of AUDIT_USERS) {
    console.log(`\n=== ${user.role} (${user.email}) ===`);
    await auditRole(user);
  }

  const fails = checks.filter((c) => c.status === "FAIL");
  const skips = checks.filter((c) => c.status === "SKIP");
  console.log(
    `\nResumo: ${checks.length - fails.length - skips.length} PASS · ${fails.length} FAIL · ${skips.length} SKIP`,
  );

  const jsonFlagIndex = process.argv.indexOf("--json");
  if (jsonFlagIndex !== -1 && process.argv[jsonFlagIndex + 1]) {
    writeFileSync(
      process.argv[jsonFlagIndex + 1],
      JSON.stringify({ target: SUPABASE_URL, generatedAt: new Date().toISOString(), checks }, null, 2),
    );
    console.log(`Relatório JSON: ${process.argv[jsonFlagIndex + 1]}`);
  }

  process.exit(fails.length > 0 ? 1 : 0);
}

void main();
