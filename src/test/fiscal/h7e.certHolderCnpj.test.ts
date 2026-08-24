/**
 * Fase H7e — Identidade do certificado A1 x CNPJ do emitente.
 *
 * Fixtures 100% sintéticas: nenhum PFX, senha, chave privada ou base64 real.
 * Apenas estruturas DER mínimas de subjectAltName com os otherName ICP-Brasil.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveCertificateHolderCnpj,
  extractIcpBrasilSanFields,
} from "../../../supabase/functions/_shared/fiscal/certHolderCnpj";

const ROOT = resolve(__dirname, "../../..");
const EF = resolve(ROOT, "supabase/functions/fiscal-certificate-upload/index.ts");

const CNPJ_OK = "11222333000181";
const CNPJ_OUTRO = "11444777000161";
const CNPJ_DV_RUIM = "11222333000182";

function ascii(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

/** otherName ICP-Brasil: OID + [0] EXPLICIT { OCTET STRING conteudo }. */
function otherName(oidTail: number, content: string): number[] {
  const body = ascii(content);
  const octet = [0x04, body.length, ...body];
  const explicit = [0xa0, octet.length, ...octet];
  const oid = [0x06, 0x05, 0x60, 0x4c, 0x01, 0x03, oidTail];
  const seq = [...oid, ...explicit];
  return [0xa0, seq.length, ...seq]; // GeneralName [0] otherName
}

function san(...parts: number[][]): Uint8Array {
  const inner = parts.flat();
  return new Uint8Array([0x30, inner.length, ...inner]);
}

describe("H7e — extração ICP-Brasil do subjectAltName", () => {
  test("A. CNPJ de PJ (OID 2.16.76.1.3.3) é extraído e aceito", () => {
    const bytes = san(otherName(0x03, CNPJ_OK));
    expect(extractIcpBrasilSanFields(bytes).pjCnpj).toBe(CNPJ_OK);
    const r = resolveCertificateHolderCnpj({ sanBytes: bytes });
    expect(r).toEqual({ ok: true, cnpj: CNPJ_OK, source: "san_icp_pj" });
  });

  test("B. CNPJ válido porém diferente do emitente é detectado pelo chamador", () => {
    const bytes = san(otherName(0x03, CNPJ_OUTRO));
    const r = resolveCertificateHolderCnpj({ sanBytes: bytes });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cnpj).not.toBe(CNPJ_OK); // => CERT_CNPJ_MISMATCH na EF
  });

  test("C. sem CNPJ algum => CERT_CNPJ_NOT_FOUND", () => {
    expect(resolveCertificateHolderCnpj({ sanBytes: null, subjectCn: "AR BIO LTDA" }))
      .toEqual({ ok: false, code: "CERT_CNPJ_NOT_FOUND" });
    expect(resolveCertificateHolderCnpj({ sanBytes: san(), subjectCn: "" }))
      .toEqual({ ok: false, code: "CERT_CNPJ_NOT_FOUND" });
  });

  test("D. e-CPF (OID 2.16.76.1.3.1) é rejeitado como pessoa física", () => {
    const bytes = san(otherName(0x01, "1980010112345678901000000000000000000000000000000000000"));
    expect(resolveCertificateHolderCnpj({ sanBytes: bytes }))
      .toEqual({ ok: false, code: "CERT_HOLDER_IS_INDIVIDUAL" });
    // CN de e-CPF ("NOME:CPF") também é rejeitado
    expect(resolveCertificateHolderCnpj({ subjectCn: "RENATO CUNHA:12345678901" }))
      .toEqual({ ok: false, code: "CERT_HOLDER_IS_INDIVIDUAL" });
  });

  test("E. CNPJ com DV inválido é rejeitado", () => {
    const bytes = san(otherName(0x03, CNPJ_DV_RUIM));
    expect(resolveCertificateHolderCnpj({ sanBytes: bytes }))
      .toEqual({ ok: false, code: "CERT_CNPJ_INVALID" });
    expect(resolveCertificateHolderCnpj({ subjectCn: `AR BIO:${CNPJ_DV_RUIM}` }))
      .toEqual({ ok: false, code: "CERT_CNPJ_INVALID" });
  });

  test("F. 14 dígitos em campo não relacionado NÃO é aceito", () => {
    // dNSName/otherName de OID estranho + CN sem padrão PJ
    const bytes = san(otherName(0x07, CNPJ_OK), [0x82, 11, ...ascii("arbio.co.br")]);
    expect(extractIcpBrasilSanFields(bytes).pjCnpj).toBeUndefined();
    expect(resolveCertificateHolderCnpj({
      sanBytes: bytes,
      subjectCn: `AR BIO ${CNPJ_OK} LTDA`, // dígitos soltos no meio do CN
    })).toEqual({ ok: false, code: "CERT_CNPJ_NOT_FOUND" });
  });

  test("precedência: SAN oficial vence serialNumber e CN divergentes", () => {
    const bytes = san(otherName(0x03, CNPJ_OK));
    const r = resolveCertificateHolderCnpj({
      sanBytes: bytes,
      subjectSerialNumber: CNPJ_OUTRO,
      subjectCn: `AR BIO:${CNPJ_OUTRO}`,
    });
    expect(r).toEqual({ ok: true, cnpj: CNPJ_OK, source: "san_icp_pj" });
  });

  test("fallbacks: serialNumber (2.5.4.5) e CN padrão PJ", () => {
    expect(resolveCertificateHolderCnpj({ subjectSerialNumber: CNPJ_OK }))
      .toEqual({ ok: true, cnpj: CNPJ_OK, source: "subject_serial_number" });
    expect(resolveCertificateHolderCnpj({ subjectCn: `AR BIO LTDA:${CNPJ_OK}` }))
      .toEqual({ ok: true, cnpj: CNPJ_OK, source: "subject_cn" });
  });

  test("e-CNPJ com responsável PF não é classificado como pessoa física", () => {
    const bytes = san(otherName(0x03, CNPJ_OK), otherName(0x04, "RESPONSAVEL"));
    const r = resolveCertificateHolderCnpj({ sanBytes: bytes });
    expect(r).toEqual({ ok: true, cnpj: CNPJ_OK, source: "san_icp_pj" });
  });
});

describe("H7e — paridade e hardening na Edge Function", () => {
  const src = readFileSync(EF, "utf8");

  test("usa helper compartilhado e não duplica lógica de CNPJ", () => {
    expect(src).toContain('from "../_shared/fiscal/certHolderCnpj.ts"');
    expect(src).toContain("resolveCertificateHolderCnpj(");
    expect(src).toContain("CERT_CNPJ_MISMATCH");
  });

  test("CNPJ do emitente é lido server-side, nunca do corpo da requisição", () => {
    expect(src).toMatch(/from\("company_fiscal_settings"\)[\s\S]{0,80}select\("id, cnpj"\)/);
    expect(src).not.toMatch(/form\.get\(\s*["']cnpj["']\s*\)/);
    expect(src).not.toMatch(/body\.cnpj/);
  });

  test("mantém triagem ASN.1 BER/DER e demais controles", () => {
    expect(src).toContain('from "./asn1Screen.ts"');
    expect(src).not.toContain("PKCS12_MAGIC");
    for (const needle of [
      "fiscalAllowedOrigins",
      "CERT_PASSWORD_REQUIRED",
      "FISCAL_CERTIFICATE_MASTER_KEY",
      "AES-GCM",
      "private_key_does_not_match_certificate",
      "certificate_expired",
      "rpc_fiscal_certificate_register_a1",
    ]) {
      expect(src, `controle ausente: ${needle}`).toContain(needle);
    }
  });

  test("não ecoa CNPJ completo nem material sensível", () => {
    expect(src).not.toMatch(/console\.(log|error|info)\s*\(/);
    expect(src).not.toMatch(/holder\.cnpj[^!=)]*\}\s*,\s*4\d\d/);
    expect(src).not.toContain("issuer_cnpj:");
  });
});
