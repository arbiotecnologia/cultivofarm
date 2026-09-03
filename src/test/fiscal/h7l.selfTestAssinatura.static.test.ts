/**
 * H7 (continuação após registro real do A1) — contrato estático do autoteste
 * criptográfico inerte do cofre de assinatura.
 *
 * Garante que o mecanismo:
 *   - existe e é puro (sem persistência, sem transmissão, sem numeração);
 *   - retorna apenas indicadores booleanos;
 *   - está exposto na Edge Function `fiscal-event-sign` sob `action=self_test`,
 *     após autenticação e autorização fiscal, com limpeza do material.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const selfTest = readFileSync(
  "supabase/functions/_shared/fiscal/nfe/signSelfTest.ts",
  "utf8",
);
const fn = readFileSync("supabase/functions/fiscal-event-sign/index.ts", "utf8");

describe("H7L — autoteste criptográfico inerte", () => {
  it("não persiste, não transmite e não reserva numeração", () => {
    for (const forbidden of ["storage", "upload", "insert(", "fetch(", "rpc("]) {
      expect(selfTest.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("retorna somente indicadores, nunca material", () => {
    for (const forbidden of ["certPem:", "keyPem:", "signature:", "console."]) {
      expect(selfTest).not.toContain(forbidden);
    }
    for (const flag of [
      "bundle_parsed",
      "key_matches_certificate",
      "signature_verified",
      "certificate_within_validity",
      "key_usage_digital_signature",
    ]) {
      expect(selfTest).toContain(flag);
    }
  });

  it("usa payload inerte, sem chave/numero de NF-e", () => {
    expect(selfTest).toContain("AR-BIO/H7/SELF-TEST/INERT");
  });

  it("é exposto na função apenas após auth e autorização fiscal", () => {
    const idxSelfTest = fn.indexOf('"self_test"');
    expect(idxSelfTest).toBeGreaterThan(0);
    expect(fn.indexOf("fn_fiscal_can_operate")).toBeLessThan(idxSelfTest);
    expect(fn.indexOf("unauthorized")).toBeLessThan(idxSelfTest);
  });

  it("descarta o material sensível ao final do autoteste", () => {
    expect(fn).toContain("selfTestMaterial.keyPem = \"\"");
    expect(fn).toContain("persisted: false");
    expect(fn).toContain("transmitted: false");
  });
});
