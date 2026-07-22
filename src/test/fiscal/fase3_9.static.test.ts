/**
 * Fase Fiscal 3.9 — Testes estáticos do entrypoint `fiscal-preflight`.
 *
 * Escopo (todos os itens do brief 3.9 §7):
 *  (A) Existência, forma e método único.
 *  (B) CORS: allowlist por env, default deny, sem `*`.
 *  (C) Autenticação: exige Bearer JWT; usa anon key + Authorization; sem service_role.
 *  (D) Autorização: usa PREFLIGHT_ALLOWED_ROLES canônicos; nunca aceita role do body.
 *  (E) Leituras: apenas as 5 views de prontidão, com head/count.
 *  (F) Fail-closed: gates externos jamais promovidos pelo cliente; resposta é
 *      sempre PRECHECK_ONLY/canTransmit=false, provider=NONE, production=false.
 *  (G) Zero-write: nenhum insert/update/delete/upsert/rpc de escrita/functions.invoke;
 *      nenhum fetch/URL/SDK de provedor; nenhum certificado/token/webhook.
 *  (H) Server-only: nenhum arquivo em src/** importa o entrypoint.
 *  (I) Preservação: flags 3.1–3.7 continuam false; barreira 3.8 intocada.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  PREFLIGHT_ALLOWED_ROLES,
  evaluatePreflight,
} from "../../../supabase/functions/_shared/fiscal/preflight";

const ROOT = resolve(__dirname, "../../..");
const ENTRY_PATH = resolve(ROOT, "supabase/functions/fiscal-preflight/index.ts");
const SHARED_PATH = resolve(ROOT, "supabase/functions/_shared/fiscal/preflight.ts");
const entrySrcRaw = readFileSync(ENTRY_PATH, "utf8");
const entrySrc = entrySrcRaw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ────────────────────────── (A) Existência/forma ────────────────────────── */

describe("Fase 3.9 · (A) Entrypoint existe e é HTTP-only", () => {
  test("arquivo entrypoint existe", () => {
    expect(existsSync(ENTRY_PATH)).toBe(true);
  });
  test("compartilhado 3.8 intocado (existe e evaluatePreflight funciona)", () => {
    expect(existsSync(SHARED_PATH)).toBe(true);
    const res = evaluatePreflight({
      operation: "PREFLIGHT",
      emissionEnabled: false,
      runtimeMode: "DISABLED",
      provider: "NONE",
      requestedProduction: false,
      evidences: {},
    });
    expect(res.canTransmit).toBe(false);
  });
  test("usa Deno.serve — não expõe outros handlers", () => {
    expect(entrySrc).toMatch(/Deno\.serve\s*\(/);
  });
  test("aceita apenas POST + OPTIONS; rejeita outros métodos com 405", () => {
    expect(entrySrc).toMatch(/req\.method\s*!==?\s*["']POST["']/);
    expect(entrySrc).toMatch(/method_not_allowed/);
    expect(entrySrc).toMatch(/OPTIONS/);
  });
  test("contrato tem versão fixa", () => {
    expect(entrySrc).toMatch(/fiscal-preflight\/1\.0\.0/);
  });
});

/* ─────────────────────────────── (B) CORS ───────────────────────────────── */

describe("Fase 3.9 · (B) CORS seguro", () => {
  test("não usa Access-Control-Allow-Origin: *", () => {
    expect(entrySrc).not.toMatch(/Access-Control-Allow-Origin["']\s*:\s*["']\*/);
    // "*" só aparece em contexto de select("*", …), não em ACAO.
  });
  test("lê a allowlist via env FISCAL_ALLOWED_ORIGINS", () => {
    expect(entrySrc).toMatch(/FISCAL_ALLOWED_ORIGINS/);
  });
  test("default = allowlist vazia → nega origem de browser", () => {
    // parseAllowlist retorna [] quando env vazia; e branch de isBrowserOriginAllowed
    // rejeita quando origin ∉ allowlist.
    expect(entrySrc).toMatch(/origin_not_allowed/);
  });
  test("Vary: Origin presente para evitar cache cross-origin incorreto", () => {
    expect(entrySrc).toMatch(/Vary["']?\s*:\s*["']Origin/);
  });
  test("OPTIONS retorna 204 sem body", () => {
    expect(entrySrc).toMatch(/status:\s*204/);
    expect(entrySrc).toMatch(/new Response\(\s*null,\s*\{\s*status:\s*204/);
  });
});

/* ─────────────────────── (C) Auth / anon-key / RLS ──────────────────────── */

describe("Fase 3.9 · (C) Autenticação e RLS", () => {
  test("exige Authorization: Bearer <jwt>", () => {
    expect(entrySrc).toMatch(/Authorization/);
    expect(entrySrc).toMatch(/Bearer /);
    expect(entrySrc).toMatch(/unauthorized/);
  });
  test("constrói client com SUPABASE_URL + SUPABASE_ANON_KEY e repassa Authorization", () => {
    expect(entrySrc).toMatch(/Deno\.env\.get\(["']SUPABASE_URL["']\)/);
    expect(entrySrc).toMatch(/Deno\.env\.get\(["']SUPABASE_ANON_KEY["']\)/);
    expect(entrySrc).toMatch(/global:\s*\{\s*headers:\s*\{\s*Authorization/);
  });
  test("NÃO referencia SUPABASE_SERVICE_ROLE_KEY nem service_role", () => {
    expect(entrySrc).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(entrySrc).not.toMatch(/service_role/i);
  });
  test("valida usuário com auth.getUser()", () => {
    expect(entrySrc).toMatch(/auth\.getUser\(\)/);
  });
});

/* ─────────────────────────── (D) Autorização ────────────────────────────── */

describe("Fase 3.9 · (D) Autorização canônica", () => {
  test("usa PREFLIGHT_ALLOWED_ROLES importado do módulo 3.8", () => {
    expect(entrySrc).toMatch(/PREFLIGHT_ALLOWED_ROLES/);
    expect([...PREFLIGHT_ALLOWED_ROLES].sort()).toEqual(
      ["administrador", "financeiro", "gestor"].sort(),
    );
  });
  test("verifica role via RPC has_role(_user_id,_role) — nunca via body", () => {
    expect(entrySrc).toMatch(/\.rpc\(\s*["']has_role["']/);
    // Nada de body.role / req.body.role / input.role
    expect(entrySrc).not.toMatch(/body\s*\.\s*role/);
    expect(entrySrc).not.toMatch(/input\s*\.\s*role\b/);
    expect(entrySrc).not.toMatch(/["']role["']\s*:\s*(body|input|req)/);
  });
  test("rota bloqueada retorna 403 sanitizado", () => {
    expect(entrySrc).toMatch(/forbidden/);
    expect(entrySrc).toMatch(/json\(\s*403/);
  });
});

/* ──────────────────────────── (E) Leituras ──────────────────────────────── */

describe("Fase 3.9 · (E) Leitura restrita às 5 views de prontidão", () => {
  const expectedViews = [
    "v_fiscal_company_readiness",
    "v_product_fiscal_readiness",
    "v_service_fiscal_readiness",
    "v_customer_fiscal_readiness",
    "v_fiscal_document_reconciliation_pending",
  ];
  test.each(expectedViews)("view %s é consultada", (v) => {
    expect(entrySrc).toContain(v);
  });
  test("nenhuma outra view/tabela fiscal é consultada", () => {
    const froms = [...entrySrc.matchAll(/\.from\(\s*["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    for (const f of froms) {
      expect(expectedViews).toContain(f);
    }
  });
  test("usa count exact + head:true para agregação sem exposição de linhas", () => {
    expect(entrySrc).toMatch(/count:\s*["']exact["']/);
    expect(entrySrc).toMatch(/head:\s*true/);
  });
  test("nenhuma leitura de certificados/tokens/provider/snapshots", () => {
    for (const rx of [
      /certificad/i,
      /\bpfx\b/i,
      /\.p12\b/i,
      /provider_payload/i,
      /provider_snapshot/i,
      /webhook/i,
      /access_token/i,
    ]) {
      expect(entrySrc).not.toMatch(rx);
    }
  });
});

/* ─────────────────────── (F) Invariantes de resposta ────────────────────── */

describe("Fase 3.9 · (F) Resposta é sempre PRECHECK_ONLY/canTransmit=false", () => {
  test("passa emissionEnabled=false, runtimeMode=DISABLED, provider=NONE, requestedProduction=false ao avaliador", () => {
    expect(entrySrc).toMatch(/emissionEnabled:\s*false/);
    expect(entrySrc).toMatch(/runtimeMode:\s*["']DISABLED["']/);
    expect(entrySrc).toMatch(/provider:\s*["']NONE["']/);
    expect(entrySrc).toMatch(/requestedProduction:\s*false/);
  });
  test("marca gates externos como false literal — cliente não pode promover", () => {
    for (const key of [
      "rlsRuntimeCertified",
      "typesCertified",
      "backfillCertified",
      "sqlMaskCertified",
    ]) {
      expect(entrySrc).toMatch(new RegExp(`${key}:\\s*false`));
    }
  });
  test("resposta HTTP força canTransmit:false, provider:'NONE', production:false", () => {
    expect(entrySrc).toMatch(/canTransmit:\s*false\s+as\s+const/);
    expect(entrySrc).toMatch(/provider:\s*["']NONE["']\s+as\s+const/);
    expect(entrySrc).toMatch(/production:\s*false\s+as\s+const/);
    expect(entrySrc).toMatch(/operation:\s*["']PREFLIGHT["']\s+as\s+const/);
  });
  test("resposta inclui correlation_id e timestamp", () => {
    expect(entrySrc).toMatch(/correlation_id/);
    expect(entrySrc).toMatch(/toISOString\(\)/);
  });
});

/* ──────────────────────── (G) Zero-write / zero-provider ────────────────── */

describe("Fase 3.9 · (G) Nenhuma escrita, provedor, cert, token ou webhook", () => {
  test("sem operações de escrita no banco", () => {
    for (const rx of [
      /\.insert\(/,
      /\.update\(/,
      /\.delete\(/,
      /\.upsert\(/,
      /functions\s*\.\s*invoke\(/,
    ]) {
      expect(entrySrc).not.toMatch(rx);
    }
  });
  test("única RPC permitida = has_role (leitura security-definer)", () => {
    const rpcs = [...entrySrc.matchAll(/\.rpc\(\s*["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    expect(rpcs.length).toBeGreaterThan(0);
    for (const r of rpcs) expect(r).toBe("has_role");
  });
  test("sem URL/HTTP externo além do próprio SDK do supabase-js", () => {
    // Único endpoint remoto tolerado é o import do SDK (`esm.sh/@supabase/supabase-js`).
    const urls = [...entrySrc.matchAll(/https?:\/\/[^\s"'`]+/g)].map((m) => m[0]);
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\/esm\.sh\/@supabase\/supabase-js/);
    }
  });
  test("sem provedores fiscais / termos proibidos", () => {
    for (const rx of [
      /sefaz/i,
      /focusnfe/i,
      /webmania/i,
      /nfe\.io/i,
      /envia_nfe/i,
      /transmit(ir|te)/i,
      /cancelar_nfe/i,
      /inutilizar/i,
      /consultar_nfe/i,
    ]) {
      expect(entrySrc).not.toMatch(rx);
    }
  });
  test("sem write direto de fiscal_events / audit / idempotência", () => {
    expect(entrySrc).not.toMatch(/fiscal_events/);
    expect(entrySrc).not.toMatch(/idempotency/i);
    expect(entrySrc).not.toMatch(/audit_log/i);
  });
});

/* ──────────────────────────── (H) Server-only ───────────────────────────── */

describe("Fase 3.9 · (H) Server-only — nenhum import em src/**", () => {
  const SRC = resolve(ROOT, "src");
  function walk(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, acc);
      else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
    }
    return acc;
  }
  // Excluímos arquivos de teste — eles legitimamente citam o caminho em strings.
  const files = walk(SRC).filter((f) => !/[\\/]test[\\/]/.test(f));
  test("nenhum arquivo de produção em src/** importa o entrypoint", () => {
    const offenders: string[] = [];
    // Apenas linhas `import ... from` ou `require(...)` contam.
    const importRx = /(?:import[^;]*from\s*|require\(\s*)["']([^"']*fiscal-preflight[^"']*)["']/;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (importRx.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

/* ────────────────────────── (I) Preservação de flags ────────────────────── */

describe("Fase 3.9 · (I) Trava de emissão e escrita fiscal", () => {
  // Fase 3.16 liberou flags de UI de preparação (perfis, workflow, prontidão).
  // Aqui garantimos apenas que a EMISSÃO e as escritas sensíveis continuam OFF.
  test.each([
    "fiscalEmissionEnabled",
    "fiscalDocumentManualEventRpc",
    "fiscalReconciliationWrite",
  ])("%s continua false por default", (name) => {
    const flags = FEATURE_FLAGS as Record<string, boolean>;
    if (name in flags) expect(flags[name]).toBe(false);
  });
});
