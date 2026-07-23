/**
 * Fase 3.19.5 — Backend NFS-e executável.
 * Prova que a validação vive na migration canônica (fonte única),
 * não apenas no stub de `restoration/`.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const CANONICAL = resolve(
  ROOT,
  "supabase/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql",
);
const ADENDO = resolve(
  ROOT,
  "restoration/fiscal-fase3-19/ADENDO_3_19_4_NFSE_ASSERT.sql",
);

const sql = readFileSync(CANONICAL, "utf8");
const adendo = readFileSync(ADENDO, "utf8");

describe("Fase 3.19.5 — NFS-e assert vive na migration canônica", () => {
  test("bloco NFS-e presente dentro de _fiscal_rtc_assert_payload", () => {
    const fnStart = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public._fiscal_rtc_assert_payload",
    );
    expect(fnStart).toBeGreaterThan(-1);
    // Corpo termina no primeiro `END; $F$;` após a assinatura.
    const bodyEnd = sql.indexOf("END; $F$;", fnStart);
    expect(bodyEnd).toBeGreaterThan(fnStart);
    const body = sql.slice(fnStart, bodyEnd);
    expect(body).toMatch(/IF payload \? 'additional_fields' THEN[\s\S]+DECLARE af jsonb/);
    expect(body).toMatch(/af \? 'finNFSe'/);
    expect(body).toMatch(/af \? 'tpNFSeDebito'/);
    expect(body).toMatch(/af \? 'tpNFSeCredito'/);
    expect(body).toMatch(/af \? 'gIBSCBSAjuste'/);
    expect(body).toMatch(/af \? 'vAjusteBC'/);
  });

  test("tipos exigidos são checados via jsonb_typeof", () => {
    expect(sql).toMatch(/jsonb_typeof\(af->'finNFSe'\) <> 'string'/);
    expect(sql).toMatch(/jsonb_typeof\(af->'tpNFSeDebito'\) <> 'string'/);
    expect(sql).toMatch(/jsonb_typeof\(af->'tpNFSeCredito'\) <> 'string'/);
    expect(sql).toMatch(/jsonb_typeof\(af->'gIBSCBSAjuste'\) <> 'boolean'/);
    expect(sql).toMatch(/jsonb_typeof\(af->'vAjusteBC'\) <> 'number'/);
  });

  test("tamanho máximo 30 (btrim) para os códigos NFS-e", () => {
    const matches = sql.match(/length\(btrim\(af->>'(finNFSe|tpNFSeDebito|tpNFSeCredito)'\)\) > 30/g);
    expect(matches?.length).toBe(3);
  });

  test("vAjusteBC precisa ser >= 0", () => {
    expect(sql).toMatch(/\(af->>'vAjusteBC'\)::numeric < 0/);
  });

  test("dependência: vAjusteBC exige gIBSCBSAjuste=true", () => {
    // Regra: precisa checar ausência do toggle OU toggle diferente de true.
    expect(sql).toMatch(/NOT \(af \? 'gIBSCBSAjuste'\)/);
    expect(sql).toMatch(
      /\(af->>'gIBSCBSAjuste'\)::boolean IS DISTINCT FROM true/,
    );
  });

  test("códigos de erro estáveis exatamente como especificado", () => {
    for (const code of [
      "FISCAL_RTC_NFSE_INVALID_CODE:finNFSe",
      "FISCAL_RTC_NFSE_INVALID_CODE:tpNFSeDebito",
      "FISCAL_RTC_NFSE_INVALID_CODE:tpNFSeCredito",
      "FISCAL_RTC_NFSE_INVALID_TOGGLE:gIBSCBSAjuste",
      "FISCAL_RTC_NFSE_INVALID_VALUE:vAjusteBC",
      "FISCAL_RTC_NFSE_VALUE_WITHOUT_TOGGLE:vAjusteBC",
    ]) {
      expect(sql).toContain(`RAISE EXCEPTION '${code}'`);
    }
  });

  test("todos os RAISE do bloco NFS-e usam ERRCODE 22023", () => {
    const nfseRaises = sql.match(/RAISE EXCEPTION 'FISCAL_RTC_NFSE_[^']+' USING ERRCODE='22023'/g);
    expect(nfseRaises?.length).toBeGreaterThanOrEqual(6);
  });

  test("função inteira permanece fail-fast: sem EXCEPTION WHEN OTHERS", () => {
    expect(sql).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS/i);
  });

  test("transação canônica preservada: um BEGIN e um COMMIT no topo", () => {
    const begins = sql.match(/^BEGIN;\s*$/gm) ?? [];
    const commits = sql.match(/^COMMIT;\s*$/gm) ?? [];
    expect(begins.length).toBe(1);
    expect(commits.length).toBe(1);
  });
});

describe("Fase 3.19.5 — ADENDO virou stub e não é segunda fonte", () => {
  test("ADENDO não contém mais implementação SQL comentada", () => {
    // Não pode existir a árvore SQL executável duplicada no stub.
    expect(adendo).not.toMatch(/RAISE EXCEPTION 'FISCAL_RTC_NFSE_/);
    expect(adendo).not.toMatch(/jsonb_typeof\(af->'/);
    expect(adendo).not.toMatch(/DECLARE af jsonb/);
  });

  test("ADENDO aponta para a migration canônica", () => {
    expect(adendo).toMatch(/20260727000000_fiscal_fase3_19_rtc_2026\.sql/);
  });

  test("stub é curto (≤ 20 linhas)", () => {
    const lines = adendo.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeLessThanOrEqual(20);
  });
});
