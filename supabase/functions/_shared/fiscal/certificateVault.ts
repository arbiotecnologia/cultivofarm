/**
 * Fase H7d — Formato canônico do cofre de assinatura A1 (sem senha).
 *
 * Antes (v1): o cofre guardava os BYTES ORIGINAIS DO PFX cifrados e, para
 * poder reabri-los, guardava também a SENHA do PFX cifrada
 * (`encrypted_password` + `password_iv`). Isso violava a política de segredos
 * do projeto: a senha do A1 não pode ser persistida em nenhuma forma.
 *
 * Agora (v2): a senha existe SOMENTE em memória durante o POST de importação.
 * O PKCS#12 é aberto uma única vez, e o que se persiste é um BUNDLE DE
 * ASSINATURA versionado — certificado folha em PEM, cadeia em PEM e chave
 * privada em PKCS#8 PEM **não cifrado pela senha** —, inteiro cifrado com
 * AES-256-GCM pela chave mestra server-side (`FISCAL_CERTIFICATE_MASTER_KEY`).
 * Assinar depois não requer a senha original.
 *
 * Este módulo é puro: apenas serializa/valida/parseia o bundle. Não faz I/O,
 * não usa node-forge, não loga e nunca expõe conteúdo secreto em mensagens de
 * erro (apenas códigos estáveis).
 */

export const SIGNING_BUNDLE_VERSION = 2;
export const SIGNING_BUNDLE_FORMAT = "SIGNING_BUNDLE_V2";
export const SIGNING_BUNDLE_ALGORITHM = "AES-256-GCM";

const CERT_HEADER = "-----BEGIN CERTIFICATE-----";
const PKCS8_HEADER = "-----BEGIN PRIVATE KEY-----";
const PKCS8_ENCRYPTED_HEADER = "-----BEGIN ENCRYPTED PRIVATE KEY-----";
const PKCS1_HEADER = "-----BEGIN RSA PRIVATE KEY-----";

export interface SigningBundle {
  v: number;
  /** Certificado folha (e-CNPJ A1) em PEM. */
  certPem: string;
  /** Chave privada em PKCS#8 PEM, sem cifra por senha. */
  keyPem: string;
  /** Cadeia intermediária/raiz em PEM, quando presente no PKCS#12. */
  chainPem: string[];
}

export class SigningBundleError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "SigningBundleError";
  }
}

function assertCertPem(value: unknown, code: string): string {
  const pem = typeof value === "string" ? value.trim() : "";
  if (!pem.includes(CERT_HEADER)) throw new SigningBundleError(code);
  return pem;
}

function assertKeyPem(value: unknown): string {
  const pem = typeof value === "string" ? value.trim() : "";
  // Fail-closed: chave cifrada por senha reintroduziria a dependência da senha.
  if (pem.includes(PKCS8_ENCRYPTED_HEADER)) {
    throw new SigningBundleError("BUNDLE_KEY_PASSWORD_PROTECTED");
  }
  if (!pem.includes(PKCS8_HEADER) && !pem.includes(PKCS1_HEADER)) {
    throw new SigningBundleError("BUNDLE_KEY_INVALID");
  }
  return pem;
}

/** Serializa o bundle de assinatura para cifra AES-256-GCM. */
export function serializeSigningBundle(input: {
  certPem: string;
  keyPem: string;
  chainPem?: string[];
}): string {
  const bundle: SigningBundle = {
    v: SIGNING_BUNDLE_VERSION,
    certPem: assertCertPem(input.certPem, "BUNDLE_CERT_INVALID"),
    keyPem: assertKeyPem(input.keyPem),
    chainPem: (input.chainPem ?? []).map((c) => assertCertPem(c, "BUNDLE_CHAIN_INVALID")),
  };
  return JSON.stringify(bundle);
}

/** Parseia e valida um bundle já decifrado. Lança `SigningBundleError`. */
export function parseSigningBundle(raw: string): SigningBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SigningBundleError("BUNDLE_MALFORMED");
  }
  if (!parsed || typeof parsed !== "object") throw new SigningBundleError("BUNDLE_MALFORMED");
  const obj = parsed as Record<string, unknown>;
  if (Number(obj.v) !== SIGNING_BUNDLE_VERSION) {
    throw new SigningBundleError("BUNDLE_VERSION_UNSUPPORTED");
  }
  const chainRaw = Array.isArray(obj.chainPem) ? obj.chainPem : [];
  return {
    v: SIGNING_BUNDLE_VERSION,
    certPem: assertCertPem(obj.certPem, "BUNDLE_CERT_INVALID"),
    keyPem: assertKeyPem(obj.keyPem),
    chainPem: chainRaw.map((c) => assertCertPem(c, "BUNDLE_CHAIN_INVALID")),
  };
}

/** Verifica se o registro do cofre está no formato suportado para assinatura. */
export function isSupportedVaultFormat(format: string | null | undefined): boolean {
  return String(format ?? "") === SIGNING_BUNDLE_FORMAT;
}
