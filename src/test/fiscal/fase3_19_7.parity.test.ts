/**
 * Fase Fiscal 3.19.7 — Paridade frontend/backend NFS-e (30 caracteres).
 * Garante que o schema Zod, a UI e a migration canônica usam o mesmo limite.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ibsCbsItemSchema } from "@/lib/fiscal/rtcConfiguration";

const ROOT = resolve(__dirname, "../../..");
const CARD = resolve(ROOT, "src/components/fiscal/IbsCbsItemCard.tsx");
const SCHEMA = resolve(ROOT, "src/lib/fiscal/rtcConfiguration.ts");
const CANONICAL = resolve(
  ROOT,
  "supabase/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql",
);

const cardSrc = readFileSync(CARD, "utf8");
const schemaSrc = readFileSync(SCHEMA, "utf8");
const sql = readFileSync(CANONICAL, "utf8");

describe("Fase 3.19.7 — Frontend schema Zod limita códigos NFS-e a 30", () => {
  for (const key of ["finNFSe", "tpNFSeDebito", "tpNFSeCredito"] as const) {
    test(`${key} aceita 30 caracteres e rejeita 31`, () => {
      const valid = "a".repeat(30);
      const invalid = "a".repeat(31);

      const base = {
        schema_version: 1,
        additional_fields: {
          gIBSCBSAjuste: true,
          vAjusteBC: 0,
          [key]: valid,
        },
      };

      const ok = ibsCbsItemSchema.safeParse(base);
      expect(ok.success).toBe(true);

      const bad = ibsCbsItemSchema.safeParse({ ...base, additional_fields: { ...base.additional_fields, [key]: invalid } });
      expect(bad.success).toBe(false);
    });
  }

  test("schema auxiliar usa z.string().trim().min(1).max(30)", () => {
    expect(schemaSrc).toMatch(/const nfseCodeMax30 = z\.string\(\)\.trim\(\)\.min\(1\)\.max\(30\);/);
  });

  test("não existe mais limite max(20) no schema auxiliar", () => {
    expect(schemaSrc).not.toMatch(/\.max\(20\)/);
  });
});

describe("Fase 3.19.7 — UI impede entrada além de 30 caracteres", () => {
  for (const id of ["finNFSe", "tpNFSeDebito", "tpNFSeCredito"]) {
    test(`${id} tem maxLength={30} no IbsCbsItemCard`, () => {
      const rx = new RegExp(`<Input id="${id}" maxLength=\\{30\\}`);
      expect(cardSrc).toMatch(rx);
    });
  }

  test("não há maxLength={20} remanescente nos campos NFS-e", () => {
    expect(cardSrc).not.toMatch(/id="(finNFSe|tpNFSeDebito|tpNFSeCredito)" maxLength=\{20\}/);
  });
});

describe("Fase 3.19.7 — Backend canônico valida btrim 1..30", () => {
  test("migration exige length(btrim(...)) <= 30 para os três códigos", () => {
    const matches = sql.match(/length\(btrim\(af->>'(finNFSe|tpNFSeDebito|tpNFSeCredito)'\)\) > 30/g);
    expect(matches?.length).toBe(3);
  });

  test("códigos de erro permanecem estáveis", () => {
    for (const code of [
      "FISCAL_RTC_NFSE_INVALID_CODE:finNFSe",
      "FISCAL_RTC_NFSE_INVALID_CODE:tpNFSeDebito",
      "FISCAL_RTC_NFSE_INVALID_CODE:tpNFSeCredito",
    ]) {
      expect(sql).toContain(`RAISE EXCEPTION '${code}'`);
    }
  });
});
