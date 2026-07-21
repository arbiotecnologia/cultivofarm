/**
 * Fase Fiscal 3.10 — Testes de unidade do orquestrador.
 *
 * Cobre: dry-run sem env, env parcial, ref de produção, marker/hosts,
 * classificação PREPARADO/APTO/INAPTO, sanitização, ordem/fail-fast.
 */
import { describe, test, expect } from "vitest";
import {
  loadEnv,
  evaluateGuards,
  guardExecute,
  buildDryRunReport,
  classify,
  computeTotals,
  sanitize,
  sanitizeReport,
  parseArgs,
  GATES,
  PROD_PROJECT_REF,
  REQUIRED_ENV_VARS,
  type GateReport,
} from "../../../scripts/fiscal-staging-certify";

const STAGING_REF = "abcdefghijklmnop";
function fullEnv(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    FISCAL_TEST_ENV: "STAGING",
    FISCAL_TEST_PROJECT_REF: STAGING_REF,
    PGURL_STAGING: `postgresql://postgres:xxx@db.${STAGING_REF}.supabase.co:5432/postgres`,
    PGREST_STAGING: `https://${STAGING_REF}.supabase.co/rest/v1`,
    PGREST_ANON_KEY: "anon-key-value",
    PGREST_SERVICE_ROLE_KEY: "service-role-value",
    ...overrides,
  };
}

describe("loadEnv", () => {
  test("nenhuma variável ⇒ presentCount=0", () => {
    const e = loadEnv({});
    expect(e.presentCount).toBe(0);
    expect(e.missing).toHaveLength(REQUIRED_ENV_VARS.length);
  });
  test("parcial detectado", () => {
    const e = loadEnv({ FISCAL_TEST_ENV: "STAGING" });
    expect(e.presentCount).toBe(1);
    expect(e.missing).toContain("PGURL_STAGING");
  });
  test("todas presentes", () => {
    const e = loadEnv(fullEnv());
    expect(e.presentCount).toBe(REQUIRED_ENV_VARS.length);
    expect(e.missing).toEqual([]);
  });
});

describe("evaluateGuards", () => {
  test("zero env ⇒ dry-run ok", () => {
    const v = evaluateGuards(loadEnv({}));
    expect(v.ok).toBe(true);
    expect(v.mode).toBe("dry-run");
  });
  test("parcial ⇒ falha explícita", () => {
    const v = evaluateGuards(loadEnv({ FISCAL_TEST_ENV: "STAGING" }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/configuração parcial/);
  });
  test("FISCAL_TEST_ENV != STAGING ⇒ falha", () => {
    const v = evaluateGuards(loadEnv(fullEnv({ FISCAL_TEST_ENV: "prod" })));
    expect(v.ok).toBe(false);
  });
  test("ref de produção em FISCAL_TEST_PROJECT_REF ⇒ falha", () => {
    const v = evaluateGuards(loadEnv(fullEnv({ FISCAL_TEST_PROJECT_REF: PROD_PROJECT_REF })));
    expect(v.ok).toBe(false);
  });
  test("PGURL contendo ref de produção ⇒ falha", () => {
    const v = evaluateGuards(
      loadEnv(fullEnv({
        PGURL_STAGING: `postgresql://x:y@db.${PROD_PROJECT_REF}.supabase.co:5432/postgres`,
      })),
    );
    expect(v.ok).toBe(false);
  });
  test("PGREST divergente do ref ⇒ falha", () => {
    const v = evaluateGuards(loadEnv(fullEnv({ PGREST_STAGING: "https://outro.supabase.co/rest/v1" })));
    expect(v.ok).toBe(false);
  });
  test("todos alinhados ⇒ ok", () => {
    const v = evaluateGuards(loadEnv(fullEnv()));
    expect(v.ok).toBe(true);
    expect(v.mode).toBe("execute-eligible");
  });
});

describe("guardExecute", () => {
  test("bloqueia --execute sem todas as variáveis", () => {
    const g = guardExecute(loadEnv({}));
    expect(g.ok).toBe(false);
  });
  test("bloqueia --execute com ref de produção", () => {
    const g = guardExecute(loadEnv(fullEnv({ FISCAL_TEST_PROJECT_REF: PROD_PROJECT_REF })));
    expect(g.ok).toBe(false);
  });
  test("permite --execute quando tudo alinha", () => {
    expect(guardExecute(loadEnv(fullEnv())).ok).toBe(true);
  });
});

describe("parseArgs", () => {
  test("sem args ⇒ dry-run", () => {
    expect(parseArgs([]).execute).toBe(false);
  });
  test("--execute ativa modo execute", () => {
    expect(parseArgs(["--execute"]).execute).toBe(true);
  });
  test("--out redireciona saída", () => {
    expect(parseArgs(["--out", "tmp/x"]).outDir).toBe("tmp/x");
  });
});

describe("GATES", () => {
  test("ordem A..J", () => {
    expect(GATES.map((g) => g.id)).toEqual(["A","B","C","D","E","F","G","H","I","J"]);
  });
  test("gates destrutivos declarados", () => {
    const writesIds = GATES.filter((g) => g.writes).map((g) => g.id);
    expect(writesIds).toEqual(expect.arrayContaining(["C", "F", "G", "J"]));
  });
  test("nenhum gate faz referência a provedor externo", () => {
    for (const g of GATES) {
      const blob = g.command + " " + g.description + " " + g.artifacts.join(" ");
      expect(blob).not.toMatch(/focus|sefaz|nfe\.fazenda|\.pfx/i);
    }
  });
});

describe("sanitize", () => {
  test("redige JWT triplo", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(sanitize(`token=${jwt}`)).toBe("token=[REDACTED]");
  });
  test("redige postgres URL com senha", () => {
    const s = "postgresql://postgres:senha123@db.abc.supabase.co:5432/postgres";
    expect(sanitize(s)).toBe("[REDACTED]");
  });
  test("redige sb_secret_ / sbp_", () => {
    expect(sanitize("sb_secret_abcdefghijklmnop1234567890")).toBe("[REDACTED]");
    expect(sanitize("sbp_" + "a".repeat(40))).toBe("[REDACTED]");
  });
  test("redige password=... em texto livre", () => {
    expect(sanitize("password=Bio#2026")).toContain("[REDACTED]");
  });
});

describe("sanitizeReport", () => {
  test("aplica redação recursivamente", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const r = sanitizeReport({ nested: { token: jwt } });
    expect(r.nested.token).toBe("[REDACTED]");
  });
});

describe("buildDryRunReport", () => {
  test("dry-run sem env ⇒ PREPARADO, gates planned", () => {
    const env = loadEnv({});
    const rep = buildDryRunReport(env, evaluateGuards(env));
    expect(rep.classification).toBe("PREPARADO");
    expect(rep.mode).toBe("dry-run");
    expect(rep.totals.planned).toBe(10);
    expect(rep.totals.executed).toBe(0);
    expect(rep.gates.every((g) => g.status === "planned")).toBe(true);
  });
  test("nunca inclui ref completo, apenas sufixo mascarado", () => {
    const rep = buildDryRunReport(loadEnv(fullEnv()), evaluateGuards(loadEnv(fullEnv())));
    expect(rep.projectRefSuffix).not.toContain(STAGING_REF);
    expect(rep.projectRefSuffix.startsWith("***")).toBe(true);
  });
});

describe("classify", () => {
  const g = (id: string, status: GateReport["status"]): GateReport => ({
    id: id as GateReport["id"], name: id, status, durationMs: 0, detail: "", writes: false,
  });
  test("dry-run ⇒ PREPARADO mesmo com tudo passando", () => {
    const gates = ["A","B","C","D","E","F","G","H","I","J"].map((i) => g(i, "passed"));
    expect(classify("dry-run", gates)).toBe("PREPARADO");
  });
  test("execute com skip ⇒ INAPTO", () => {
    const gates = ["A","B","C","D","E","F","G","H","I","J"].map((i, idx) => g(i, idx === 4 ? "skipped" : "passed"));
    expect(classify("execute", gates)).toBe("INAPTO");
  });
  test("execute com falha ⇒ INAPTO", () => {
    const gates = ["A","B","C","D","E","F","G","H","I","J"].map((i, idx) => g(i, idx === 2 ? "failed" : "passed"));
    expect(classify("execute", gates)).toBe("INAPTO");
  });
  test("execute com teardown skip ⇒ INAPTO", () => {
    const gates = ["A","B","C","D","E","F","G","H","I","J"].map((i) => g(i, i === "J" ? "skipped" : "passed"));
    expect(classify("execute", gates)).toBe("INAPTO");
  });
  test("execute com todos passed e J passed ⇒ APTO", () => {
    const gates = ["A","B","C","D","E","F","G","H","I","J"].map((i) => g(i, "passed"));
    expect(classify("execute", gates)).toBe("APTO");
  });
});

describe("computeTotals", () => {
  test("conta status corretamente", () => {
    const gates: GateReport[] = [
      { id: "A", name: "", status: "passed", durationMs: 0, detail: "", writes: false },
      { id: "B", name: "", status: "failed", durationMs: 0, detail: "", writes: false },
      { id: "C", name: "", status: "skipped", durationMs: 0, detail: "", writes: false },
      { id: "D", name: "", status: "planned", durationMs: 0, detail: "", writes: false },
    ];
    const t = computeTotals(gates);
    expect(t).toEqual({ planned: 4, executed: 3, passed: 1, failed: 1, skipped: 1 });
  });
});
