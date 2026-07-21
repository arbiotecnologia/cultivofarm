/**
 * Fase Fiscal 3.10 — Testes estáticos do pacote de certificação.
 *
 * Alvo: garantir que o orquestrador é fail-safe, sem provedor, sem service_role
 * exposto, com sanitização de secrets, ordem correta de gates e comandos
 * destrutivos protegidos por --execute.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..", "..");
const CERTIFY = resolve(ROOT, "scripts/fiscal-staging-certify.ts");
const DEPLOY = resolve(ROOT, "scripts/fiscal-staging-deploy-preflight.sh");

describe("Fase 3.10 — arquivos do pacote", () => {
  test("orquestrador existe", () => {
    expect(existsSync(CERTIFY)).toBe(true);
  });
  test("deploy separado existe", () => {
    expect(existsSync(DEPLOY)).toBe(true);
  });
});

describe("Fase 3.10 — invariantes do orquestrador", () => {
  const src = readFileSync(CERTIFY, "utf8");

  test("declara PROD_PROJECT_REF canônico", () => {
    expect(src).toContain('PROD_PROJECT_REF = "navfzbwgwzruipouyfnk"');
  });

  test("gates A..J presentes em ordem", () => {
    const order = ["A","B","C","D","E","F","G","H","I","J"];
    let last = -1;
    for (const id of order) {
      const idx = src.indexOf(`id: "${id}"`);
      expect(idx, `gate ${id} ausente`).toBeGreaterThan(last);
      last = idx;
    }
  });

  test("não referencia provedor/SEFAZ/certificado como uso real", () => {
    // Ignora comentários de proibição — foco em URLs/imports/arquivos.
    expect(src).not.toMatch(/\bfocusnfe\.com|nfe\.fazenda\.[a-z]|nfe\.sefaz\.[a-z]|\.pfx\b|BEGIN\s+CERTIFICATE/i);
  });

  test("dry-run é o padrão (execute exige flag explícita)", () => {
    expect(src).toMatch(/argv\.includes\("--execute"\)/);
  });

  test("sanitize cobre JWT/pgurl/service_role tokens", () => {
    expect(src).toMatch(/ey\[A-Za-z0-9_-\]/);
    expect(src).toMatch(/postgres\(\?:ql\)\?:\\\/\\\//);
    expect(src).toMatch(/sb_secret_/);
  });

  test("nunca imprime valores de env sensíveis", () => {
    // Não pode existir console.log direto de process.env.*
    expect(src).not.toMatch(/console\.log\([^)]*process\.env\./);
    expect(src).not.toMatch(/console\.error\([^)]*process\.env\./);
  });

  test("dry-run classifica como PREPARADO", () => {
    expect(src).toMatch(/if \(mode === "dry-run"\) return "PREPARADO"/);
  });

  test("APTO exige teardown (J) passado", () => {
    expect(src).toMatch(/g\.id === "J"/);
  });
});

describe("Fase 3.10 — invariantes do deploy separado", () => {
  const src = readFileSync(DEPLOY, "utf8");
  test("exige STAGING e --confirm", () => {
    expect(src).toContain('FISCAL_TEST_ENV != STAGING');
    expect(src).toContain('--confirm');
  });
  test("bloqueia produção", () => {
    expect(src).toContain('navfzbwgwzruipouyfnk');
    expect(src).toMatch(/aponta produção/);
  });
  test("não invoca provedor externo", () => {
    expect(src).not.toMatch(/curl|wget|focusnfe|sefaz/i);
  });
});

describe("Fase 3.10 — regressão de fases anteriores", () => {
  test("preflight fail-closed ainda vigente", () => {
    const p = resolve(ROOT, "supabase/functions/fiscal-preflight/index.ts");
    const src = readFileSync(p, "utf8");
    expect(src).toMatch(/canTransmit:\s*false/);
    expect(src).toMatch(/provider:\s*["']NONE["']/);
  });
  test("shared preflight ainda existe", () => {
    const p = resolve(ROOT, "supabase/functions/_shared/fiscal/preflight.ts");
    expect(existsSync(p)).toBe(true);
  });
});
