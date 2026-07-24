/**
 * Fase SINIEF 4.0 — Testes estáticos do guard anti-produção STAGING-ONLY.
 */
import { describe, test, expect } from "vitest";
import {
  SINIEF49_EXPECTED_STAGING_REF,
  SINIEF49_PROD_PROJECT_REF,
  assertSinief49StagingMarker,
  assertSinief49StagingOnly,
  loadSinief49GuardInput,
  resolveSinief49GuardMode,
} from "./guard";

const OK_ENV = {
  FISCAL_TEST_ENV: "STAGING",
  FISCAL_TEST_PROJECT_REF: SINIEF49_EXPECTED_STAGING_REF,
  PGURL_STAGING: `postgresql://user:pass@db.${SINIEF49_EXPECTED_STAGING_REF}.supabase.co:5432/postgres`,
  PGREST_STAGING: `https://${SINIEF49_EXPECTED_STAGING_REF}.supabase.co`,
};

describe("SINIEF 49 · guard staging-only", () => {
  test("aceita configuração correta apontando ao staging esperado", () => {
    expect(assertSinief49StagingOnly(loadSinief49GuardInput(OK_ENV))).toEqual({ ok: true });
  });

  test("rejeita FISCAL_TEST_ENV != STAGING", () => {
    const r = assertSinief49StagingOnly(loadSinief49GuardInput({ ...OK_ENV, FISCAL_TEST_ENV: "prod" }));
    expect(r.ok).toBe(false);
  });

  test("rejeita ref de produção em qualquer variável", () => {
    const rRef = assertSinief49StagingOnly(loadSinief49GuardInput({
      ...OK_ENV, FISCAL_TEST_PROJECT_REF: SINIEF49_PROD_PROJECT_REF,
    }));
    expect(rRef.ok).toBe(false);
    const rUrl = assertSinief49StagingOnly(loadSinief49GuardInput({
      ...OK_ENV,
      PGURL_STAGING: `postgresql://u:p@db.${SINIEF49_PROD_PROJECT_REF}.supabase.co/postgres`,
    }));
    expect(rUrl.ok).toBe(false);
    expect(rUrl.ok === false && rUrl.reason).toMatch(/PRODUÇÃO/);
  });

  test("rejeita ref diferente do staging esperado (AR-Bio-TEMP)", () => {
    const r = assertSinief49StagingOnly(loadSinief49GuardInput({
      ...OK_ENV, FISCAL_TEST_PROJECT_REF: "outro1234outro1234ab",
    }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/diverge do staging esperado/);
  });

  test("rejeita URLs que não contêm o ref esperado", () => {
    const r = assertSinief49StagingOnly(loadSinief49GuardInput({
      ...OK_ENV, PGREST_STAGING: "https://foo.supabase.co",
    }));
    expect(r.ok).toBe(false);
  });

  test("configuração parcial (uma variável ausente) falha", () => {
    const r = assertSinief49StagingOnly(loadSinief49GuardInput({ ...OK_ENV, PGURL_STAGING: "" }));
    expect(r.ok).toBe(false);
  });

  test("ausência total → modo skip (permitido em testes locais)", () => {
    expect(resolveSinief49GuardMode({})).toBe("skip");
    expect(resolveSinief49GuardMode(OK_ENV)).toBe("enforce");
    expect(resolveSinief49GuardMode({ FISCAL_TEST_ENV: "STAGING" })).toBe("enforce");
  });

  test("marker: aceita linha correta", async () => {
    const r = await assertSinief49StagingMarker(async () => ({
      rows: [{ marker: "STAGING", project_ref: SINIEF49_EXPECTED_STAGING_REF }],
    }));
    expect(r).toEqual({ ok: true });
  });

  test("marker: rejeita ausência, ref divergente e expectedRef inválido", async () => {
    const empty = await assertSinief49StagingMarker(async () => ({ rows: [] }));
    expect(empty.ok).toBe(false);
    const wrong = await assertSinief49StagingMarker(async () => ({
      rows: [{ marker: "STAGING", project_ref: "outro" }],
    }));
    expect(wrong.ok).toBe(false);
    const prod = await assertSinief49StagingMarker(async () => ({ rows: [] }), SINIEF49_PROD_PROJECT_REF);
    expect(prod.ok).toBe(false);
  });

  test("marker: propaga erro da query como falha estruturada", async () => {
    const r = await assertSinief49StagingMarker(async () => {
      throw new Error("conexão recusada");
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/conexão recusada/);
  });
});
