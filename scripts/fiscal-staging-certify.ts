/**
 * Fase Fiscal 3.10 — ORQUESTRADOR fiscal:staging:certify
 *
 * Objetivo: consolidar os gates fiscais existentes num único pacote reproduzível
 * e fail-safe. Por padrão executa DRY-RUN (imprime plano e checklist). Execução
 * real exige TODAS as variáveis de STAGING + marker + --execute + ref != PROD.
 *
 * REGRAS INEGOCIÁVEIS
 *  - Nunca ecoar valor de secret/JWT/connection string.
 *  - Nunca aplicar SQL/migration ou criar dado sem --execute + guards.
 *  - Nunca tocar produção (navfzbwgwzruipouyfnk) em nenhuma variável.
 *  - Sem provedor fiscal / SDK / URL SEFAZ / certificado.
 *  - Teardown best-effort restrito às fixtures marcadas.
 *
 * Uso:
 *   bunx tsx scripts/fiscal-staging-certify.ts              # dry-run
 *   bunx tsx scripts/fiscal-staging-certify.ts --execute    # execução real
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

export const PROD_PROJECT_REF = "navfzbwgwzruipouyfnk";

export const REQUIRED_ENV_VARS = [
  "FISCAL_TEST_ENV",
  "FISCAL_TEST_PROJECT_REF",
  "PGURL_STAGING",
  "PGREST_STAGING",
  "PGREST_ANON_KEY",
  "PGREST_SERVICE_ROLE_KEY",
] as const;
export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

// -----------------------------------------------------------------------------
// Env / Guards
// -----------------------------------------------------------------------------

export interface LoadedEnv {
  values: Record<RequiredEnvVar, string>;
  presentCount: number;
  missing: RequiredEnvVar[];
}

export function loadEnv(source: Record<string, string | undefined> = process.env): LoadedEnv {
  const values = {} as Record<RequiredEnvVar, string>;
  const missing: RequiredEnvVar[] = [];
  for (const k of REQUIRED_ENV_VARS) {
    const v = (source[k] ?? "").trim();
    values[k] = v;
    if (!v) missing.push(k);
  }
  return { values, presentCount: REQUIRED_ENV_VARS.length - missing.length, missing };
}

export type GuardVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Regras:
 *   - 0 vars → dry-run apto (skip runtime).
 *   - >0 e <N → falha explícita (parcial).
 *   - N vars → verifica marker=STAGING, ref != PROD, hosts contêm ref esperado
 *     e NÃO contêm ref de produção.
 */
export function evaluateGuards(env: LoadedEnv): GuardVerdict & { mode: "dry-run" | "execute-eligible" } {
  if (env.presentCount === 0) return { ok: true, mode: "dry-run" };
  if (env.missing.length > 0) {
    return {
      ok: false,
      mode: "execute-eligible",
      reason: `configuração parcial: ausentes ${env.missing.join(", ")}`,
    };
  }
  const v = env.values;
  if (v.FISCAL_TEST_ENV.toUpperCase() !== "STAGING") {
    return { ok: false, mode: "execute-eligible", reason: "FISCAL_TEST_ENV deve ser 'STAGING'" };
  }
  if (v.FISCAL_TEST_PROJECT_REF === PROD_PROJECT_REF) {
    return { ok: false, mode: "execute-eligible", reason: "FISCAL_TEST_PROJECT_REF aponta produção" };
  }
  const lc = (s: string) => s.toLowerCase();
  const ref = v.FISCAL_TEST_PROJECT_REF.toLowerCase();
  const pg = lc(v.PGURL_STAGING);
  const rest = lc(v.PGREST_STAGING);
  if (pg.includes(PROD_PROJECT_REF) || rest.includes(PROD_PROJECT_REF)) {
    return { ok: false, mode: "execute-eligible", reason: "PGURL/PGREST contêm ref de produção" };
  }
  if (!pg.includes(ref) || !rest.includes(ref)) {
    return { ok: false, mode: "execute-eligible", reason: "PGURL/PGREST não correspondem ao ref esperado" };
  }
  return { ok: true, mode: "execute-eligible" };
}

// -----------------------------------------------------------------------------
// Gates A–J
// -----------------------------------------------------------------------------

export type GateId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";
export interface GateSpec {
  id: GateId;
  name: string;
  description: string;
  /** Comando que seria executado em --execute. Nunca contém secrets. */
  command: string;
  /** Arquivos canônicos consultados. */
  artifacts: string[];
  /** True quando é destrutivo/de escrita — exige --execute + guards. */
  writes: boolean;
}

export const GATES: readonly GateSpec[] = [
  {
    id: "A",
    name: "anti-produção + marker",
    description: "Confere env, ref != PROD, hosts, marker _fiscal_staging_marker.",
    command: "internal:evaluateGuards + psql marker check",
    artifacts: ["src/test/fiscal/rls/guard.ts"],
    writes: false,
  },
  {
    id: "B",
    name: "migrations: list + checksum + dry-run",
    description: "Lista supabase/migrations/2026072*_fiscal_*.sql e calcula sha256.",
    command: "internal:checksumFiscalMigrations",
    artifacts: [
      "supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql",
      "supabase/migrations/20260721010000_fiscal_fase2_1_hardening.sql",
      "supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql",
    ],
    writes: false,
  },
  {
    id: "C",
    name: "aplicar migrations fiscais canônicas",
    description: "Só em --execute. Delegado a restoration/backfill-fiscal-fase3/03-apply.sh.",
    command: "bash restoration/backfill-fiscal-fase3/03-apply.sh",
    artifacts: ["restoration/backfill-fiscal-fase3/03-apply.sh"],
    writes: true,
  },
  {
    id: "D",
    name: "types.ts oficial + verificador",
    description: "Executa verify-fiscal-types.ts contra o arquivo canônico.",
    command: "bunx tsx scripts/verify-fiscal-types.ts",
    artifacts: ["scripts/verify-fiscal-types.ts", "src/integrations/supabase/types.ts"],
    writes: false,
  },
  {
    id: "E",
    name: "mask_sensitive_jsonb runtime",
    description: "Executa mask.sql.test.ts contra PGURL_STAGING.",
    command: "bunx vitest run src/test/fiscal/rls/mask.sql.test.ts",
    artifacts: ["src/test/fiscal/rls/mask.sql.test.ts"],
    writes: false,
  },
  {
    id: "F",
    name: "backfill sintético",
    description: "prepare + baseline + verify em ambiente descartável.",
    command: "psql $PGURL_STAGING -f restoration/backfill-fiscal-fase3/01-prepare.sql",
    artifacts: [
      "restoration/backfill-fiscal-fase3/01-prepare.sql",
      "restoration/backfill-fiscal-fase3/02-baseline.sql",
      "restoration/backfill-fiscal-fase3/04-verify.sql",
    ],
    writes: true,
  },
  {
    id: "G",
    name: "setup de usuários sintéticos",
    description: "SERVICE_ROLE cria auth.users sintéticos apenas em staging.",
    command: "internal:setupSyntheticUsers",
    artifacts: ["src/test/fiscal/rls/runner.ts"],
    writes: true,
  },
  {
    id: "H",
    name: "matriz RLS completa (630 asserts)",
    description: "harness.test.ts corre a matriz inteira; skip=falha.",
    command: "bunx vitest run src/test/fiscal/rls/harness.test.ts",
    artifacts: ["src/test/fiscal/rls/matrix.ts", "src/test/fiscal/rls/harness.test.ts"],
    writes: false,
  },
  {
    id: "I",
    name: "smoke fiscal-preflight (apenas se implantado)",
    description: "Fetch autenticado. Espera canTransmit:false, provider:NONE, production:false.",
    command: "internal:preflightSmoke",
    artifacts: ["supabase/functions/fiscal-preflight/index.ts"],
    writes: false,
  },
  {
    id: "J",
    name: "teardown + relatório",
    description: "Cleanup restrito às fixtures marcadas + emissão do relatório sanitizado.",
    command: "psql $PGURL_STAGING -f restoration/backfill-fiscal-fase3/99-cleanup.sql",
    artifacts: ["restoration/backfill-fiscal-fase3/99-cleanup.sql"],
    writes: true,
  },
] as const;

// -----------------------------------------------------------------------------
// Sanitization
// -----------------------------------------------------------------------------

const SECRET_PATTERNS: RegExp[] = [
  /ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,   // JWT
  /sb_secret_[A-Za-z0-9]{16,}/g,
  /sbp_[a-f0-9]{20,}/g,
  /sbs_[A-Za-z0-9]{16,}/g,
  /postgres(?:ql)?:\/\/[^\s"']*:[^\s"'@]+@[^\s"']+/gi,               // pg url com senha
  /\bpassword\s*[:=]\s*[^\s"',}]+/gi,
];

/** Substitui secrets por [REDACTED]. Nunca retorna o valor original. */
export function sanitize(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

export function sanitizeReport<T>(obj: T): T {
  return JSON.parse(sanitize(JSON.stringify(obj))) as T;
}

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------

export type GateStatus = "planned" | "executed" | "passed" | "failed" | "skipped";
export interface GateReport {
  id: GateId;
  name: string;
  status: GateStatus;
  durationMs: number;
  detail: string;
  writes: boolean;
}

export type Classification = "PREPARADO" | "APTO" | "INAPTO";

export interface CertifyReport {
  version: "3.10";
  mode: "dry-run" | "execute";
  projectRefSuffix: string;   // últimos 4 chars, para triagem — nunca completo
  startedAt: string;
  finishedAt: string;
  guards: { ok: boolean; reason?: string };
  gates: GateReport[];
  totals: {
    planned: number;
    executed: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  checksums: Record<string, string>;
  classification: Classification;
  notes: string[];
}

export function classify(mode: "dry-run" | "execute", gates: GateReport[]): Classification {
  if (mode === "dry-run") return "PREPARADO";
  const failed = gates.filter((g) => g.status === "failed").length;
  const skipped = gates.filter((g) => g.status === "skipped").length;
  if (failed > 0 || skipped > 0) return "INAPTO";
  // Teardown (J) deve ter passado.
  const j = gates.find((g) => g.id === "J");
  if (!j || j.status !== "passed") return "INAPTO";
  return "APTO";
}

export function computeTotals(gates: GateReport[]) {
  return {
    planned: gates.length,
    executed: gates.filter((g) => g.status !== "planned").length,
    passed: gates.filter((g) => g.status === "passed").length,
    failed: gates.filter((g) => g.status === "failed").length,
    skipped: gates.filter((g) => g.status === "skipped").length,
  };
}

// -----------------------------------------------------------------------------
// Dry-run
// -----------------------------------------------------------------------------

export function buildDryRunReport(env: LoadedEnv, verdict: GuardVerdict): CertifyReport {
  const now = new Date().toISOString();
  const gates: GateReport[] = GATES.map((g) => ({
    id: g.id,
    name: g.name,
    status: "planned",
    durationMs: 0,
    detail: g.description,
    writes: g.writes,
  }));
  const notes: string[] = [
    "DRY-RUN — nenhuma migration/SQL foi aplicado.",
    "Variáveis presentes: " + env.presentCount + "/" + REQUIRED_ENV_VARS.length,
  ];
  if (env.missing.length > 0) {
    notes.push("Variáveis ausentes: " + env.missing.join(", "));
  }
  notes.push("Execução real exige --execute + todas as variáveis + marker + ref!=" + PROD_PROJECT_REF + ".");
  return {
    version: "3.10",
    mode: "dry-run",
    projectRefSuffix: env.values.FISCAL_TEST_PROJECT_REF
      ? "***" + env.values.FISCAL_TEST_PROJECT_REF.slice(-4)
      : "***",
    startedAt: now,
    finishedAt: now,
    guards: verdict.ok ? { ok: true } : { ok: false, reason: (verdict as { reason: string }).reason },
    gates,
    totals: computeTotals(gates),
    checksums: {},
    classification: "PREPARADO",
    notes,
  };
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

export interface CliArgs {
  execute: boolean;
  outDir: string;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  return {
    execute: argv.includes("--execute"),
    outDir: (() => {
      const i = argv.indexOf("--out");
      if (i >= 0 && argv[i + 1]) return String(argv[i + 1]);
      return "restoration/fiscal-fase3-10";
    })(),
  };
}

/** Executa um comando sem imprimir env sensível. Retorna exit code. */
async function runCmd(cmd: string, args: string[]): Promise<{ code: number; stdoutTail: string }> {
  return new Promise((resolveP) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); if (buf.length > 8000) buf = buf.slice(-8000); });
    child.stderr.on("data", (d) => { buf += String(d); if (buf.length > 8000) buf = buf.slice(-8000); });
    child.on("close", (code) => resolveP({ code: code ?? -1, stdoutTail: sanitize(buf.slice(-2000)) }));
  });
}

function writeReport(report: CertifyReport, outDir: string): { jsonPath: string; mdPath: string } {
  const dir = resolve(process.cwd(), outDir);
  mkdirSync(dir, { recursive: true });
  const jsonPath = resolve(dir, "certify-report.json");
  const mdPath = resolve(dir, "certify-report.md");
  writeFileSync(jsonPath, JSON.stringify(sanitizeReport(report), null, 2));
  writeFileSync(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath };
}

export function renderMarkdown(r: CertifyReport): string {
  const lines: string[] = [];
  lines.push("# Fiscal Staging Certify — Fase 3.10");
  lines.push("");
  lines.push(`- Modo: **${r.mode}**`);
  lines.push(`- Classificação: **${r.classification}**`);
  lines.push(`- Ref (sufixo): \`${r.projectRefSuffix}\``);
  lines.push(`- Guards: ${r.guards.ok ? "OK" : "FALHA — " + (r.guards.reason ?? "")}`);
  lines.push(`- Totais: planned=${r.totals.planned} executed=${r.totals.executed} passed=${r.totals.passed} failed=${r.totals.failed} skipped=${r.totals.skipped}`);
  lines.push("");
  lines.push("## Gates");
  for (const g of r.gates) {
    lines.push(`- **${g.id}** ${g.name} — ${g.status} (${g.durationMs}ms) — writes=${g.writes}`);
    lines.push(`  - ${sanitize(g.detail)}`);
  }
  if (r.notes.length) {
    lines.push("");
    lines.push("## Notas");
    for (const n of r.notes) lines.push(`- ${sanitize(n)}`);
  }
  return lines.join("\n") + "\n";
}

/** Bloqueia execução real em ambiente inseguro. */
export function guardExecute(env: LoadedEnv): GuardVerdict {
  if (env.presentCount < REQUIRED_ENV_VARS.length) {
    return { ok: false, reason: "--execute exige todas as variáveis de STAGING presentes" };
  }
  const g = evaluateGuards(env);
  if (!g.ok) return { ok: false, reason: (g as { reason: string }).reason };
  return { ok: true };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const verdict = evaluateGuards(env);

  if (!args.execute) {
    const report = buildDryRunReport(env, verdict);
    const { jsonPath, mdPath } = writeReport(report, args.outDir);
    // Imprime SOMENTE caminhos e classificação, jamais valores.
    // eslint-disable-next-line no-console
    console.log(`[fiscal-certify] mode=dry-run classification=${report.classification}`);
    // eslint-disable-next-line no-console
    console.log(`[fiscal-certify] report json=${jsonPath}`);
    // eslint-disable-next-line no-console
    console.log(`[fiscal-certify] report md=${mdPath}`);
    return 0;
  }

  // --execute
  const exec = guardExecute(env);
  if (!exec.ok) {
    const report = buildDryRunReport(env, verdict);
    report.mode = "execute";
    report.classification = "INAPTO";
    report.notes.unshift("Guard anti-produção bloqueou --execute: " + (exec as { reason: string }).reason);
    const { jsonPath } = writeReport(report, args.outDir);
    // eslint-disable-next-line no-console
    console.error(`[fiscal-certify] BLOQUEADO — ver ${jsonPath}`);
    return 2;
  }

  // Execução real fica sob controle de quem detém o ambiente. Este orquestrador
  // NÃO envia deploy nem migrations sem que os artefatos canônicos existam.
  // Aqui apenas invocamos os gates estáticos (D) e delegamos os demais.
  const gates: GateReport[] = [];
  const started = Date.now();
  for (const g of GATES) {
    const s = Date.now();
    let status: GateStatus = "planned";
    let detail = g.description;
    try {
      if (g.id === "D") {
        const r = await runCmd("bunx", ["tsx", "scripts/verify-fiscal-types.ts"]);
        status = r.code === 0 ? "passed" : "failed";
        detail = `exit=${r.code}\n${r.stdoutTail}`;
      } else {
        // Todos os demais requerem infra externa (psql/vitest com env). Marca
        // como "skipped" quando não delegados pelo operador via env explícita
        // adicional — o operador deve rodar cada gate individualmente. Skip
        // aqui é INAPTO por design.
        status = "skipped";
        detail = "Gate delegado ao operador em staging; execute cmd: " + g.command;
      }
    } catch (err) {
      status = "failed";
      detail = sanitize(String((err as Error).message));
    }
    gates.push({
      id: g.id,
      name: g.name,
      status,
      durationMs: Date.now() - s,
      detail,
      writes: g.writes,
    });
  }
  const finished = Date.now();
  const report: CertifyReport = {
    version: "3.10",
    mode: "execute",
    projectRefSuffix: "***" + env.values.FISCAL_TEST_PROJECT_REF.slice(-4),
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    guards: { ok: true },
    gates,
    totals: computeTotals(gates),
    checksums: {},
    classification: classify("execute", gates),
    notes: ["Execução parcial: gates B/C/E/F/G/H/I/J são delegados ao operador."],
  };
  const { jsonPath } = writeReport(report, args.outDir);
  // eslint-disable-next-line no-console
  console.log(`[fiscal-certify] mode=execute classification=${report.classification} report=${jsonPath}`);
  return report.classification === "APTO" ? 0 : 1;
}

// Executa apenas se chamado como binário (não durante import em testes).
const isMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /fiscal-staging-certify\.ts$/.test(process.argv[1]);
if (isMain) {
  main().then((c) => process.exit(c)).catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[fiscal-certify] erro fatal:", sanitize(String((e as Error).message)));
    process.exit(1);
  });
}

// Helpers exportados para permitir integração com hashes de migrations
export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
