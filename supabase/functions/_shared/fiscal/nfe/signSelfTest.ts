/**
 * FASE H7 (continuação) — Autoteste criptográfico INERTE do cofre A1.
 *
 * Objetivo: provar, sem documento fiscal, que
 *   1. o bundle de assinatura decifrado é parseável;
 *   2. a chave privada corresponde ao certificado (mesmo módulo RSA);
 *   3. uma assinatura RSA gerada com essa chave é verificável pela chave
 *      pública do certificado;
 *   4. o certificado está dentro da validade e possui uso de assinatura.
 *
 * NÃO gera XML fiscal, NÃO reserva numeração, NÃO persiste nada e NÃO
 * transmite. Retorna apenas indicadores booleanos — jamais material,
 * PEM, chave, assinatura ou fingerprint completo.
 */
import forge from "npm:node-forge@1";

/** Payload inerte, sem qualquer semântica fiscal. */
export const SELF_TEST_PAYLOAD = "AR-BIO/H7/SELF-TEST/INERT";

export interface SigningSelfTestResult {
  bundle_parsed: boolean;
  key_matches_certificate: boolean;
  signature_verified: boolean;
  certificate_within_validity: boolean;
  key_usage_digital_signature: boolean;
  /** Dias restantes de validade (não é segredo). */
  days_until_expiry: number | null;
}

export function runSigningSelfTest(
  material: { certPem: string; keyPem: string },
  now: Date = new Date(),
): SigningSelfTestResult {
  const result: SigningSelfTestResult = {
    bundle_parsed: false,
    key_matches_certificate: false,
    signature_verified: false,
    certificate_within_validity: false,
    key_usage_digital_signature: false,
    days_until_expiry: null,
  };

  let cert: forge.pki.Certificate | null = null;
  // deno-lint-ignore no-explicit-any
  let key: any = null;
  try {
    cert = forge.pki.certificateFromPem(material.certPem);
    key = forge.pki.privateKeyFromPem(material.keyPem);
    result.bundle_parsed = true;

    // deno-lint-ignore no-explicit-any
    const pub = cert.publicKey as any;
    result.key_matches_certificate = Boolean(
      pub?.n && key?.n && pub.n.compareTo(key.n) === 0 && pub.e.compareTo(key.e) === 0,
    );

    result.certificate_within_validity = cert.validity.notBefore <= now &&
      cert.validity.notAfter >= now;
    result.days_until_expiry = Math.floor(
      (cert.validity.notAfter.getTime() - now.getTime()) / 86_400_000,
    );

    const ext = cert.getExtension("keyUsage") as { digitalSignature?: boolean } | null;
    result.key_usage_digital_signature = ext?.digitalSignature !== false;

    const md = forge.md.sha256.create();
    md.update(SELF_TEST_PAYLOAD, "utf8");
    const signature = key.sign(md);
    const vmd = forge.md.sha256.create();
    vmd.update(SELF_TEST_PAYLOAD, "utf8");
    result.signature_verified = Boolean(pub?.verify(vmd.digest().bytes(), signature));
  } catch {
    // Fail-closed: qualquer erro mantém os indicadores em false.
  } finally {
    cert = null;
    key = null;
  }

  return result;
}
