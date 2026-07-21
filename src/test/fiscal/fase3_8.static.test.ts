/**
 * Fase Fiscal 3.8 — Testes estáticos e funcionais da barreira server-side.
 *
 * Escopo:
 *  (A) contratos e defaults;
 *  (B) fail-closed exaustivo (cada gate);
 *  (C) produção bloqueada, provider != NONE rejeitado, operação != PREFLIGHT rejeitada;
 *  (D) invariantes: canTransmit=false literal; audit.persisted=false;
 *  (E) sanitização/máscara recursiva;
 *  (F) módulo puro: sem fetch/URL/SDK/cert/token/webhook/service_role;
 *  (G) sem I/O ao banco: sem insert/update/delete/upsert/rpc/functions.invoke;
 *  (H) server-only: nenhum arquivo em src/** importa o módulo;
 *  (I) idempotência/auditoria: apenas contrato — sem geração/persistência;
 *  (J) preservação das fases 3.1–3.7 e das flags fiscais.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  FISCAL_DEFAULTS,
  FISCAL_ENV_VAR_NAMES,
  FISCAL_OPERATIONS,
  FISCAL_PROVIDERS,
  FISCAL_RUNTIME_MODES,
  GATE_CODES,
  PRECHECK_STATUSES,
  AUDIT_EVENT_TYPES,
  PREFLIGHT_ALLOWED_ROLES,
  evaluatePreflight,
  isRoleAllowedForPreflight,
  maskRecursive,
  type PreflightInput,
} from "../../../supabase/functions/_shared/fiscal/preflight";

const MODULE_PATH = resolve(
  __dirname,
  "../../../supabase/functions/_shared/fiscal/preflight.ts",
);
const moduleSrcRaw = readFileSync(MODULE_PATH, "utf8");
/**
 * Fonte sem comentários e sem a regex de identificação de chaves sensíveis
 * (que precisa listar os próprios nomes proibidos para poder mascará-los).
 */
const moduleSrc = moduleSrcRaw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1")
  .replace(/const\s+SENSITIVE_KEY_RX[\s\S]*?;\n/, "");

/** Entrada base "tudo pronto" — para validar que mesmo assim é PRECHECK_ONLY. */
const allTrueInput = (): PreflightInput => ({
  operation: "PREFLIGHT",
  emissionEnabled: true,
  runtimeMode: "HOMOLOGATION",
  provider: "NONE",
  requestedProduction: false,
  evidences: {
    rlsRuntimeCertified: true,
    typesCertified: true,
    backfillCertified: true,
    sqlMaskCertified: true,
    companyReady: true,
    productsReady: true,
    servicesReady: true,
    customersReady: true,
    reconciliationReady: true,
  },
});

/* ────────────────────────────── (A) contratos ────────────────────────────── */

describe("Fase 3.8 · (A) Contratos e defaults", () => {
  test("operações canônicas = ['PREFLIGHT']", () => {
    expect([...FISCAL_OPERATIONS]).toEqual(["PREFLIGHT"]);
  });
  test("runtime modes = ['DISABLED','HOMOLOGATION']", () => {
    expect([...FISCAL_RUNTIME_MODES].sort()).toEqual(["DISABLED", "HOMOLOGATION"]);
  });
  test("providers = ['NONE'] apenas", () => {
    expect([...FISCAL_PROVIDERS]).toEqual(["NONE"]);
  });
  test("statuses = ['PRECHECK_ONLY','BLOCKED']", () => {
    expect([...PRECHECK_STATUSES].sort()).toEqual(["BLOCKED", "PRECHECK_ONLY"]);
  });
  test("audit events = ['PRECHECK_EXECUTED']", () => {
    expect([...AUDIT_EVENT_TYPES]).toEqual(["PRECHECK_EXECUTED"]);
  });
  test("gate codes cobrem todos os bloqueadores exigidos", () => {
    const required = [
      "EMISSION_FLAG_DISABLED", "RUNTIME_MODE_INVALID", "PROVIDER_NOT_NONE",
      "PRODUCTION_REQUESTED", "RLS_RUNTIME_NOT_CERTIFIED", "TYPES_NOT_CERTIFIED",
      "BACKFILL_NOT_CERTIFIED", "SQL_MASK_NOT_CERTIFIED",
      "COMPANY_NOT_READY", "PRODUCTS_NOT_READY", "SERVICES_NOT_READY",
      "CUSTOMERS_NOT_READY", "RECONCILIATION_NOT_READY",
      "OPERATION_NOT_SUPPORTED",
    ];
    for (const g of required) expect(GATE_CODES).toContain(g);
  });
  test("defaults canônicos: DISABLED / NONE / false", () => {
    expect(FISCAL_DEFAULTS.runtimeMode).toBe("DISABLED");
    expect(FISCAL_DEFAULTS.provider).toBe("NONE");
    expect(FISCAL_DEFAULTS.emissionEnabled).toBe(false);
  });
  test("env var names são só nomes, sem valores", () => {
    expect(FISCAL_ENV_VAR_NAMES.FISCAL_RUNTIME_MODE).toBe("FISCAL_RUNTIME_MODE");
    expect(FISCAL_ENV_VAR_NAMES.FISCAL_PROVIDER).toBe("FISCAL_PROVIDER");
    expect(FISCAL_ENV_VAR_NAMES.FISCAL_EMISSION_ENABLED).toBe("FISCAL_EMISSION_ENABLED");
  });
  test("flags do app: emission continua false", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
  });
});

/* ────────────────────────────── (B) fail-closed ──────────────────────────── */

describe("Fase 3.8 · (B) Fail-closed por gate", () => {
  test("entrada totalmente vazia → BLOCKED com todos os gates false (exceto op)", () => {
    const res = evaluatePreflight({
      operation: "PREFLIGHT",
      emissionEnabled: undefined,
      runtimeMode: undefined,
      provider: undefined,
      requestedProduction: undefined,
      evidences: {},
    });
    expect(res.status).toBe("BLOCKED");
    expect(res.canTransmit).toBe(false);
    const okCodes = res.gates.filter((g) => g.ok).map((g) => g.code);
    // Só a operação e a checagem "produção não solicitada" ficam OK aqui.
    expect(okCodes.sort()).toEqual(["OPERATION_NOT_SUPPORTED", "PRODUCTION_REQUESTED"]);
  });

  const evidenceKeys = [
    ["rlsRuntimeCertified", "RLS_RUNTIME_NOT_CERTIFIED"],
    ["typesCertified", "TYPES_NOT_CERTIFIED"],
    ["backfillCertified", "BACKFILL_NOT_CERTIFIED"],
    ["sqlMaskCertified", "SQL_MASK_NOT_CERTIFIED"],
    ["companyReady", "COMPANY_NOT_READY"],
    ["productsReady", "PRODUCTS_NOT_READY"],
    ["servicesReady", "SERVICES_NOT_READY"],
    ["customersReady", "CUSTOMERS_NOT_READY"],
    ["reconciliationReady", "RECONCILIATION_NOT_READY"],
  ] as const;

  test.each(evidenceKeys)("evidência %s ausente/false bloqueia %s", (key, code) => {
    for (const bad of [undefined, null, false, "true" as unknown as boolean, 1 as unknown as boolean]) {
      const input = allTrueInput();
      (input.evidences as Record<string, unknown>)[key] = bad;
      const res = evaluatePreflight(input);
      expect(res.status).toBe("BLOCKED");
      const g = res.gates.find((x) => x.code === code)!;
      expect(g.ok).toBe(false);
    }
  });

  test("emissionEnabled deve ser explicitamente true", () => {
    for (const bad of [undefined, null, false, "true" as unknown as boolean, 1 as unknown as boolean]) {
      const input = allTrueInput();
      input.emissionEnabled = bad;
      const res = evaluatePreflight(input);
      expect(res.status).toBe("BLOCKED");
      expect(res.gates.find((g) => g.code === "EMISSION_FLAG_DISABLED")!.ok).toBe(false);
    }
  });

  test("runtimeMode desconhecido bloqueia (fail-closed)", () => {
    for (const bad of ["PRODUCTION", "prod", "", null, undefined, "UNKNOWN"]) {
      const input = allTrueInput();
      input.runtimeMode = bad as PreflightInput["runtimeMode"];
      const res = evaluatePreflight(input);
      expect(res.status).toBe("BLOCKED");
      expect(res.runtimeMode === "HOMOLOGATION" || res.runtimeMode === "DISABLED" || res.runtimeMode === "UNKNOWN").toBe(true);
      expect(res.gates.find((g) => g.code === "RUNTIME_MODE_INVALID")!.ok).toBe(false);
    }
  });
});

/* ────────── (C) produção / provider / operação ────────── */

describe("Fase 3.8 · (C) Produção, provider e operação", () => {
  test("requestedProduction=true sempre bloqueia", () => {
    const input = allTrueInput();
    input.requestedProduction = true;
    const res = evaluatePreflight(input);
    expect(res.status).toBe("BLOCKED");
    expect(res.gates.find((g) => g.code === "PRODUCTION_REQUESTED")!.ok).toBe(false);
  });

  test.each(["FOCUSNFE", "WEBMANIA", "SEFAZ", "nfe.io", "custom", "", null, undefined])(
    "provider=%s (não-NONE) é rejeitado",
    (p) => {
      const input = allTrueInput();
      input.provider = p as PreflightInput["provider"];
      const res = evaluatePreflight(input);
      expect(res.status).toBe("BLOCKED");
      expect(res.provider === "NONE" || res.provider === "UNKNOWN").toBe(true);
      expect(res.gates.find((g) => g.code === "PROVIDER_NOT_NONE")!.ok).toBe(p === "NONE");
    },
  );

  test.each(["EMIT", "CANCEL", "VOID", "QUERY_PROVIDER", "TRANSMIT", "", "preflight"])(
    "operação %s é rejeitada",
    (op) => {
      const input = allTrueInput();
      input.operation = op;
      const res = evaluatePreflight(input);
      expect(res.operation).toBe("UNSUPPORTED");
      expect(res.status).toBe("BLOCKED");
      expect(res.gates.find((g) => g.code === "OPERATION_NOT_SUPPORTED")!.ok).toBe(false);
    },
  );
});

/* ────────── (D) Invariantes ────────── */

describe("Fase 3.8 · (D) Invariantes de saída", () => {
  test("tudo true → PRECHECK_ONLY, mas canTransmit=false", () => {
    const res = evaluatePreflight(allTrueInput());
    expect(res.status).toBe("PRECHECK_ONLY");
    expect(res.canTransmit).toBe(false);
    expect(res.operation).toBe("PREFLIGHT");
    expect(res.runtimeMode).toBe("HOMOLOGATION");
    expect(res.provider).toBe("NONE");
    expect(res.gates.every((g) => g.ok)).toBe(true);
  });
  test("audit sempre reporta persisted=false e event=PRECHECK_EXECUTED", () => {
    const a = evaluatePreflight(allTrueInput()).audit;
    const b = evaluatePreflight({
      operation: "EMIT", emissionEnabled: undefined, runtimeMode: undefined,
      provider: undefined, requestedProduction: undefined, evidences: {},
    }).audit;
    for (const x of [a, b]) {
      expect(x.event).toBe("PRECHECK_EXECUTED");
      expect(x.persisted).toBe(false);
    }
  });
  test("canTransmit é literalmente false em qualquer input", () => {
    for (let i = 0; i < 32; i++) {
      const input = allTrueInput();
      // aleatoriamente derruba uma evidência
      const keys = Object.keys(input.evidences) as (keyof typeof input.evidences)[];
      const k = keys[i % keys.length];
      input.evidences[k] = i % 2 === 0 ? false : (undefined as unknown as boolean);
      expect(evaluatePreflight(input).canTransmit).toBe(false);
    }
  });
});

/* ────────── (E) Máscara / sanitização ────────── */

describe("Fase 3.8 · (E) Máscara recursiva", () => {
  test("redige chaves sensíveis", () => {
    const m = maskRecursive({
      cnpj: "12345678000199",
      cpf: "11122233344",
      access_key: "NFE...",
      token: "abc",
      certificado: "-----BEGIN",
      password: "x",
      senha: "y",
      inner: { xml: "<xml/>", ok: true, jwt: "z" },
      list: [{ chave: "k" }, "safe"],
      normal: 1,
    }) as Record<string, unknown>;
    for (const k of ["cnpj","cpf","access_key","token","certificado","password","senha"]) {
      expect(m[k]).toBe("[REDACTED]");
    }
    expect((m.inner as Record<string, unknown>).xml).toBe("[REDACTED]");
    expect((m.inner as Record<string, unknown>).jwt).toBe("[REDACTED]");
    expect((m.inner as Record<string, unknown>).ok).toBe(true);
    expect(Array.isArray(m.list)).toBe(true);
    expect(((m.list as unknown[])[0] as Record<string, unknown>).chave).toBe("[REDACTED]");
    expect((m.list as unknown[])[1]).toBe("safe");
    expect(m.normal).toBe(1);
  });
  test("limita strings longas", () => {
    expect(maskRecursive("x".repeat(300))).toBe("[REDACTED:LEN]");
  });
  test("corta profundidade", () => {
    // objeto profundo — não estoura, mas devolve marker.
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 10; i++) deep = { n: deep };
    const r = maskRecursive(deep);
    expect(JSON.stringify(r)).toContain("REDACTED:DEPTH");
  });
  test("evaluatePreflight aplica máscara em metadata", () => {
    const res = evaluatePreflight({
      ...allTrueInput(),
      metadata: { cnpj: "1", nested: { token: "t", ok: true } },
    });
    expect((res.metadata as Record<string, unknown>).cnpj).toBe("[REDACTED]");
    const nested = (res.metadata as Record<string, unknown>).nested as Record<string, unknown>;
    expect(nested.token).toBe("[REDACTED]");
    expect(nested.ok).toBe(true);
  });
  test("metadata ausente vira {}", () => {
    const res = evaluatePreflight(allTrueInput());
    expect(res.metadata).toEqual({});
  });
});

/* ────────── (F/G) Estático: sem provedor/URL/SDK/DB/etc. ────────── */

describe("Fase 3.8 · (F/G) Restrições estáticas do módulo puro", () => {
  test("sem fetch / URL de rede", () => {
    expect(moduleSrc).not.toMatch(/\bfetch\s*\(/);
    expect(moduleSrc).not.toMatch(/https?:\/\//);
  });
  test("sem SDK / clients / createClient / esm.sh / npm:", () => {
    expect(moduleSrc).not.toMatch(/createClient\b/);
    expect(moduleSrc).not.toMatch(/esm\.sh/);
    expect(moduleSrc).not.toMatch(/\bnpm:/);
    expect(moduleSrc).not.toMatch(/@supabase\//);
  });
  test("sem provedor/certificado/token/webhook (identificadores)", () => {
    const banned = [
      "sefaz", "focusnfe", "webmania", "nfe.io", "envia_nfe",
      "certificate", "pfx", "\\.p12", "webhook",
      "service_role", "SERVICE_ROLE",
    ];
    for (const rx of banned) {
      expect(new RegExp(rx, "i").test(moduleSrc)).toBe(false);
    }
  });
  test("sem acesso a Deno.env / process.env", () => {
    expect(moduleSrc).not.toMatch(/Deno\.env/);
    expect(moduleSrc).not.toMatch(/process\.env/);
  });
  test("sem operações de banco / mutação / RPC", () => {
    for (const rx of [/\.insert\(/, /\.update\(/, /\.delete\(/, /\.upsert\(/, /\.rpc\(/, /functions\s*\.\s*invoke\(/, /\.from\(/]) {
      expect(moduleSrc).not.toMatch(rx);
    }
  });
  test("sem geração de idempotency key nem inserção de fiscal_events", () => {
    expect(moduleSrc).not.toMatch(/randomUUID|uuidv4|crypto\.subtle/);
    expect(moduleSrc).not.toMatch(/fiscal_events/);
  });
  test("sem operações proibidas nesta fase (EMIT/CANCEL/VOID/QUERY_PROVIDER) como valores exportados", () => {
    for (const bad of ["EMIT", "CANCEL", "VOID", "QUERY_PROVIDER"]) {
      expect(FISCAL_OPERATIONS as readonly string[]).not.toContain(bad);
    }
  });
});

/* ────────── (H) server-only ────────── */

describe("Fase 3.8 · (H) Server-only — nenhum import em src/**", () => {
  const SRC = resolve(__dirname, "../../../src");
  function walk(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, acc);
      else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
    }
    return acc;
  }
  const files = walk(SRC);
  test("nenhum arquivo em src importa o módulo server-only", () => {
    const offenders: string[] = [];
    for (const f of files) {
      // Ignora a própria suíte de testes de contratação da fase.
      if (/[\\/]src[\\/]test[\\/]/.test(f)) continue;
      const s = readFileSync(f, "utf8");
      if (/supabase\/functions\/_shared\/fiscal\/preflight/.test(s)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

/* ────────── (I) Contrato de auth/roles ────────── */

describe("Fase 3.8 · (I) Autorização (contrato)", () => {
  test.each(["administrador", "gestor", "financeiro"])("%s permitido", (r) => {
    expect(isRoleAllowedForPreflight(r)).toBe(true);
  });
  test.each([
    "consultor_tecnico", "aplicador", "operador_onfarm", "cliente_produtor",
    "administrativo", "tecnico_agronomo", "producao", "gestor_comercial",
    "parceiro_b2b", "parceiro_b2b_tecnico", "", null, undefined,
  ])("%s rejeitado", (r) => {
    expect(isRoleAllowedForPreflight(r as string | null | undefined)).toBe(false);
  });
  test("papéis permitidos são exatamente três", () => {
    expect([...PREFLIGHT_ALLOWED_ROLES].sort()).toEqual(["administrador", "financeiro", "gestor"]);
  });
});

/* ────────── (J) Preservação ────────── */

describe("Fase 3.8 · (J) Preservação das fases anteriores", () => {
  test.each([
    "src/pages/configuracoes/FiscalEmpresa.tsx",
    "src/pages/configuracoes/FiscalProdutos.tsx",
    "src/pages/configuracoes/FiscalServicos.tsx",
    "src/pages/configuracoes/FiscalClientes.tsx",
    "src/pages/fiscal/FiscalDocumentos.tsx",
    "src/pages/fiscal/FiscalReconciliacao.tsx",
    "src/pages/fiscal/FiscalProntidao.tsx",
    "src/hooks/useFiscalReadiness.ts",
    "src/lib/fiscal/readinessValidation.ts",
  ])("arquivo %s continua existindo", (rel) => {
    expect(existsSync(resolve(__dirname, "../../../", rel))).toBe(true);
  });
  test("entrypoint 3.9 (fiscal-preflight) não importa provedor/service_role", () => {
    const p = resolve(__dirname, "../../../supabase/functions/fiscal-preflight/index.ts");
    if (!existsSync(p)) return;
    const srcNoComments = readFileSync(p, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(srcNoComments).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(srcNoComments).not.toMatch(/service_role/i);
    expect(srcNoComments).not.toMatch(/sefaz|focusnfe|webmania|nfe\.io/i);
  });
  test("README documenta decisão de entrypoint", () => {
    const r = readFileSync(
      resolve(__dirname, "../../../supabase/functions/_shared/fiscal/README.md"),
      "utf8",
    );
    expect(r).toMatch(/sem deploy/i);
    expect(r).toMatch(/fail-closed/i);
  });
});
