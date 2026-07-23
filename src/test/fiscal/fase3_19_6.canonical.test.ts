/**
 * Fase 3.19.6 — Hardening da validação NFS-e.
 * Garante separação tipo/cast, btrim nos códigos e boolean isolado.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CANONICAL = resolve(
  __dirname,
  "../../..",
  "supabase/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql",
);
const sql = readFileSync(CANONICAL, "utf8");

// Isola o corpo de _fiscal_rtc_assert_payload.
const fnStart = sql.indexOf(
  "CREATE OR REPLACE FUNCTION public._fiscal_rtc_assert_payload",
);
const fnEnd = sql.indexOf("END; $F$;", fnStart);
const body = sql.slice(fnStart, fnEnd);

describe("Fase 3.19.6 — vAjusteBC: tipo separado do cast", () => {
  test("primeiro checa jsonb_typeof = 'number' sozinho, sem OR com cast", () => {
    // Bloco isolado: IF jsonb_typeof(af->'vAjusteBC') <> 'number' THEN RAISE
    expect(body).toMatch(
      /IF\s+jsonb_typeof\(af->'vAjusteBC'\)\s*<>\s*'number'\s+THEN\s*\n\s*RAISE EXCEPTION 'FISCAL_RTC_NFSE_INVALID_VALUE:vAjusteBC'/,
    );
  });

  test("cast para numeric acontece somente em IF posterior", () => {
    expect(body).toMatch(
      /IF\s+\(af->>'vAjusteBC'\)::numeric\s*<\s*0\s+THEN\s*\n\s*RAISE EXCEPTION 'FISCAL_RTC_NFSE_INVALID_VALUE:vAjusteBC'/,
    );
  });

  test("não combina jsonb_typeof e cast no mesmo OR", () => {
    // Nenhuma linha deve ter jsonb_typeof(...'vAjusteBC') e ::numeric juntos.
    const combined = body.match(
      /jsonb_typeof\(af->'vAjusteBC'\)[^;]*::numeric/,
    );
    expect(combined).toBeNull();
  });
});

describe("Fase 3.19.6 — códigos NFS-e usam btrim e limite 1..30", () => {
  for (const key of ["finNFSe", "tpNFSeDebito", "tpNFSeCredito"]) {
    test(`${key}: length(btrim(...)) < 1 e > 30`, () => {
      const rxMin = new RegExp(`length\\(btrim\\(af->>'${key}'\\)\\)\\s*<\\s*1`);
      const rxMax = new RegExp(`length\\(btrim\\(af->>'${key}'\\)\\)\\s*>\\s*30`);
      expect(body).toMatch(rxMin);
      expect(body).toMatch(rxMax);
    });
  }

  test("nenhum limite antigo de 20 permanece nos códigos NFS-e", () => {
    expect(body).not.toMatch(/length\(af->>'(finNFSe|tpNFSeDebito|tpNFSeCredito)'\)\s*>\s*20/);
  });
});

describe("Fase 3.19.6 — gIBSCBSAjuste: boolean isolado", () => {
  test("valida jsonb_typeof = 'boolean' em IF próprio, sem OR com cast", () => {
    expect(body).toMatch(
      /IF\s+jsonb_typeof\(af->'gIBSCBSAjuste'\)\s*<>\s*'boolean'\s+THEN\s*\n\s*RAISE EXCEPTION 'FISCAL_RTC_NFSE_INVALID_TOGGLE:gIBSCBSAjuste'/,
    );
  });

  test("ausência do toggle é verificada antes de qualquer cast::boolean", () => {
    expect(body).toMatch(
      /IF NOT \(af \? 'gIBSCBSAjuste'\) THEN\s*\n\s*RAISE EXCEPTION 'FISCAL_RTC_NFSE_VALUE_WITHOUT_TOGGLE:vAjusteBC'/,
    );
  });

  test("cast ::boolean só ocorre após confirmação de tipo (mesmo IF)", () => {
    // Deve existir um IF que combina jsonb_typeof = boolean OR cast IS DISTINCT FROM true
    expect(body).toMatch(
      /jsonb_typeof\(af->'gIBSCBSAjuste'\)\s*<>\s*'boolean'\s*\n\s*OR\s*\(af->>'gIBSCBSAjuste'\)::boolean IS DISTINCT FROM true/,
    );
  });
});

describe("Fase 3.19.6 — códigos de erro estáveis preservados", () => {
  for (const code of [
    "FISCAL_RTC_NFSE_INVALID_CODE:finNFSe",
    "FISCAL_RTC_NFSE_INVALID_CODE:tpNFSeDebito",
    "FISCAL_RTC_NFSE_INVALID_CODE:tpNFSeCredito",
    "FISCAL_RTC_NFSE_INVALID_TOGGLE:gIBSCBSAjuste",
    "FISCAL_RTC_NFSE_INVALID_VALUE:vAjusteBC",
    "FISCAL_RTC_NFSE_VALUE_WITHOUT_TOGGLE:vAjusteBC",
  ]) {
    test(code, () => {
      expect(body).toContain(`RAISE EXCEPTION '${code}'`);
    });
  }
});
