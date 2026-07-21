/**
 * Fase Fiscal 3.0.2-B.1 — Estados de configuração do harness.
 * Cobre: ausência total (skip), parcial (throw), completo (config).
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { loadRunnerConfigFromEnv } from "./runner";

const NAMES = [
  "FISCAL_TEST_ENV",
  "FISCAL_TEST_PROJECT_REF",
  "PGURL_STAGING",
  "PGREST_STAGING",
  "PGREST_ANON_KEY",
  "PGREST_SERVICE_ROLE_KEY",
] as const;

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const n of NAMES) {
    original[n] = process.env[n];
    delete process.env[n];
  }
});
afterEach(() => {
  for (const n of NAMES) {
    if (original[n] === undefined) delete process.env[n];
    else process.env[n] = original[n];
  }
});

describe("loadRunnerConfigFromEnv", () => {
  test("ausência total ⇒ skip explícito", () => {
    const r = loadRunnerConfigFromEnv();
    expect(r.kind).toBe("skip");
  });

  test("configuração parcial ⇒ throw (nunca skip silencioso)", () => {
    process.env.FISCAL_TEST_ENV = "STAGING";
    process.env.FISCAL_TEST_PROJECT_REF = "abc123stagingref";
    // faltam as demais
    expect(() => loadRunnerConfigFromEnv()).toThrow(/configuração parcial/);
  });

  test("configuração completa mas ref = PROD ⇒ throw (guard anti-produção)", () => {
    process.env.FISCAL_TEST_ENV = "STAGING";
    process.env.FISCAL_TEST_PROJECT_REF = "navfzbwgwzruipouyfnk";
    process.env.PGURL_STAGING = "postgres://x:y@db.navfzbwgwzruipouyfnk.supabase.co/postgres";
    process.env.PGREST_STAGING = "https://navfzbwgwzruipouyfnk.supabase.co/rest/v1";
    process.env.PGREST_ANON_KEY = "anon";
    process.env.PGREST_SERVICE_ROLE_KEY = "svc";
    expect(() => loadRunnerConfigFromEnv()).toThrow(/PRODUÇÃO|guard/i);
  });

  test("configuração completa e coerente ⇒ config", () => {
    const ref = "ikaauvsflpmamgxmkhoq";
    process.env.FISCAL_TEST_ENV = "STAGING";
    process.env.FISCAL_TEST_PROJECT_REF = ref;
    process.env.PGURL_STAGING = `postgres://x:y@db.${ref}.supabase.co/postgres`;
    process.env.PGREST_STAGING = `https://${ref}.supabase.co/rest/v1`;
    process.env.PGREST_ANON_KEY = "anon";
    process.env.PGREST_SERVICE_ROLE_KEY = "svc";
    const r = loadRunnerConfigFromEnv();
    expect(r.kind).toBe("config");
    if (r.kind === "config") {
      expect(r.cfg.projectRef).toBe(ref);
    }
  });
});
