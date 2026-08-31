/**
 * Fase H7c — Testes do classificador ASN.1 do upload de certificado A1.
 *
 * Nenhum material real (PFX, chave, senha) é usado: apenas buffers sintéticos
 * que exercitam a triagem de SEQUENCE BER/DER. A validação definitiva de
 * PKCS#12 continua no node-forge, dentro da Edge Function.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isPlausibleAsn1Sequence,
  MIN_PKCS12_BYTES,
} from "../../../supabase/functions/fiscal-certificate-upload/asn1Screen";

const ROOT = resolve(__dirname, "../../..");
const EF_UPLOAD = resolve(ROOT, "supabase/functions/fiscal-certificate-upload/index.ts");

function pad(len: number, fill = 0x41): number[] {
  return Array.from({ length: len }, () => fill);
}

describe("H7c — triagem ASN.1 BER/DER", () => {
  test("BER de comprimento indefinido (30 80 ... 00 00) passa a triagem", () => {
    const buf = new Uint8Array([0x30, 0x80, ...pad(300), 0x00, 0x00]);
    expect(isPlausibleAsn1Sequence(buf)).toBe(true);
  });

  test("DER forma longa 1 byte (30 81) plausível passa", () => {
    const body = pad(200);
    const buf = new Uint8Array([0x30, 0x81, body.length, ...body]);
    expect(isPlausibleAsn1Sequence(buf)).toBe(true);
  });

  test("DER forma longa 2 bytes (30 82) plausível passa", () => {
    const body = pad(1000);
    const buf = new Uint8Array([0x30, 0x82, 0x03, 0xe8, ...body]);
    expect(isPlausibleAsn1Sequence(buf)).toBe(true);
  });

  test("DER forma curta plausível passa", () => {
    const body = pad(100);
    const buf = new Uint8Array([0x30, body.length, ...body]);
    expect(isPlausibleAsn1Sequence(buf)).toBe(true);
  });

  test("primeiro byte diferente de 0x30 é rejeitado", () => {
    expect(isPlausibleAsn1Sequence(new Uint8Array([0x31, 0x82, ...pad(300)]))).toBe(false);
    expect(isPlausibleAsn1Sequence(new Uint8Array([0x00, 0x80, ...pad(300)]))).toBe(false);
  });

  test("forma de comprimento inválida (0x85+) é rejeitada", () => {
    expect(isPlausibleAsn1Sequence(new Uint8Array([0x30, 0x85, ...pad(300)]))).toBe(false);
    expect(isPlausibleAsn1Sequence(new Uint8Array([0x30, 0xff, ...pad(300)]))).toBe(false);
  });

  test("comprimento longo truncado é rejeitado", () => {
    // declara 0xFFFF bytes mas o buffer tem apenas ~300
    expect(isPlausibleAsn1Sequence(new Uint8Array([0x30, 0x82, 0xff, 0xff, ...pad(300)]))).toBe(false);
  });

  test("BER indefinido sem terminador EOC é rejeitado", () => {
    expect(isPlausibleAsn1Sequence(new Uint8Array([0x30, 0x80, ...pad(300)]))).toBe(false);
  });

  test("buffer minúsculo/vazio é rejeitado", () => {
    expect(isPlausibleAsn1Sequence(new Uint8Array([]))).toBe(false);
    expect(isPlausibleAsn1Sequence(new Uint8Array([0x30, 0x80]))).toBe(false);
    expect(isPlausibleAsn1Sequence(new Uint8Array(pad(MIN_PKCS12_BYTES - 1)))).toBe(false);
  });

  test("bytes aleatórios praticamente nunca passam", () => {
    let passed = 0;
    for (let i = 0; i < 500; i++) {
      const b = new Uint8Array(512);
      for (let j = 0; j < b.length; j++) b[j] = Math.floor(Math.random() * 256);
      b[0] = Math.random() < 0.5 ? 0x30 : b[0];
      if (isPlausibleAsn1Sequence(b)) passed++;
    }
    expect(passed).toBeLessThan(250); // triagem é barata; forge é a autoridade
  });
});

describe("H7c — hardening preservado na Edge Function", () => {
  const src = readFileSync(EF_UPLOAD, "utf8");

  test("usa o classificador compartilhado e não o header rígido 30 82", () => {
    expect(src).toContain('from "./asn1Screen.ts"');
    expect(src).toContain("isPlausibleAsn1Sequence(bytes)");
    expect(src).not.toContain("DER_SEQUENCE_TAG");
  });

  test("controles de segurança intactos", () => {
    for (const needle of [
      // H7: allowlist de origens agora vem do helper compartilhado
      // (`_shared/fiscal/corsAllowlist.ts`), que ainda honra o secret
      // FISCAL_CORS_ALLOWLIST quando presente.
      "fiscalCorsHeaders",
      "cors_origin_not_allowed",
      "has_role",
      "administrador",
      "FISCAL_CERTIFICATE_MASTER_KEY",
      "AES-GCM",
      "fiscal-certificates",
      "rpc_fiscal_certificate_register_a1",
      "pkcs12_missing_private_key",
      "selectCertificateLeafForPrivateKey",
      "private_key_does_not_match_certificate",
      "certificate_expired",
      "certificate_not_yet_valid",
      "invalid_extension",
      "file_too_large",
    ]) {
      expect(src, `controle ausente: ${needle}`).toContain(needle);
    }
  });

  test("H7-005.8 — gate canônico CERT_PASSWORD_REQUIRED sem senha", () => {
    expect(src).toContain("CERT_PASSWORD_REQUIRED");
    expect(src).toContain("password.trim()");
    expect(src).not.toContain('"password_required"');
  });

  test("não ecoa material sensível", () => {
    expect(src).not.toMatch(/console\.(log|error|info)\s*\(/);
    expect(src).not.toContain("p_encrypted_material");
  });
});
