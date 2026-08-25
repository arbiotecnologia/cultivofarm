/**
 * Fase H7d — Cofre A1 sem senha persistida.
 *
 * Testes do bundle de assinatura (módulo puro) + regressão estática das
 * garantias de política de segredos no upload, no motor XML e no SQL.
 * Nenhum material real (PFX, senha, chave privada) é usado: as fixtures são
 * sintéticas e não constituem chaves válidas.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  serializeSigningBundle,
  parseSigningBundle,
  isSupportedVaultFormat,
  SIGNING_BUNDLE_FORMAT,
  SIGNING_BUNDLE_ALGORITHM,
  SIGNING_BUNDLE_VERSION,
  SigningBundleError,
} from "../../../supabase/functions/_shared/fiscal/certificateVault";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const EF_UPLOAD = "supabase/functions/fiscal-certificate-upload/index.ts";
const EF_ENGINE = "supabase/functions/fiscal-xml-engine/index.ts";
const SIGNER = "supabase/functions/_shared/fiscal/nfe/signNfeXml.ts";
const APPLY = "restoration/homologacao-h7/70-h7d-cofre-sem-senha-apply.sql";
const ROLLBACK = "restoration/homologacao-h7/71-h7d-cofre-sem-senha-rollback.sql";
const POSTCHECK = "restoration/homologacao-h7/72-h7d-postcheck.sql";
const DOC = "docs/auditorias/homologacao-h7d-cofre-a1-sem-senha.md";

const CERT_PEM = "-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----\n";
const KEY_PEM = "-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----\n";

describe("H7d — bundle de assinatura", () => {
  test("serializa e reparseia preservando cert, chave e cadeia", () => {
    const raw = serializeSigningBundle({ certPem: CERT_PEM, keyPem: KEY_PEM, chainPem: [CERT_PEM] });
    const bundle = parseSigningBundle(raw);
    expect(bundle.v).toBe(SIGNING_BUNDLE_VERSION);
    expect(bundle.certPem).toContain("BEGIN CERTIFICATE");
    expect(bundle.keyPem).toContain("BEGIN PRIVATE KEY");
    expect(bundle.chainPem).toHaveLength(1);
  });

  test("o bundle serializado não contém campo de senha", () => {
    const raw = serializeSigningBundle({ certPem: CERT_PEM, keyPem: KEY_PEM });
    expect(raw).not.toMatch(/password|senha|pfx|p12/i);
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(["certPem", "chainPem", "keyPem", "v"]);
  });

  test("chave PKCS#8 cifrada por senha é rejeitada (fail-closed)", () => {
    const encrypted = "-----BEGIN ENCRYPTED PRIVATE KEY-----\nQUJD\n-----END ENCRYPTED PRIVATE KEY-----";
    expect(() => serializeSigningBundle({ certPem: CERT_PEM, keyPem: encrypted }))
      .toThrow(SigningBundleError);
    try {
      serializeSigningBundle({ certPem: CERT_PEM, keyPem: encrypted });
    } catch (e) {
      expect((e as SigningBundleError).code).toBe("BUNDLE_KEY_PASSWORD_PROTECTED");
    }
  });

  test("cert/chave ausentes ou inválidos são rejeitados", () => {
    expect(() => serializeSigningBundle({ certPem: "xxx", keyPem: KEY_PEM })).toThrow(SigningBundleError);
    expect(() => serializeSigningBundle({ certPem: CERT_PEM, keyPem: "xxx" })).toThrow(SigningBundleError);
    expect(() => parseSigningBundle("nao-json")).toThrow(SigningBundleError);
    expect(() => parseSigningBundle(JSON.stringify({ v: 1, certPem: CERT_PEM, keyPem: KEY_PEM })))
      .toThrow(SigningBundleError);
  });

  test("apenas o formato versionado atual é assinável", () => {
    expect(isSupportedVaultFormat(SIGNING_BUNDLE_FORMAT)).toBe(true);
    expect(isSupportedVaultFormat("PKCS12_ENCRYPTED")).toBe(false);
    expect(isSupportedVaultFormat(null)).toBe(false);
    expect(SIGNING_BUNDLE_ALGORITHM).toBe("AES-256-GCM");
  });
});

describe("H7d — upload não persiste senha", () => {
  const up = read(EF_UPLOAD);

  test("não cifra nem envia senha ao registro", () => {
    expect(up).not.toMatch(/encPassword/);
    expect(up).not.toMatch(/p_encrypted_password_b64/);
    expect(up).not.toMatch(/p_password_iv_b64/);
  });

  test("registra somente material/IV/formato/algoritmo versionados", () => {
    expect(up).toMatch(/p_material_iv_b64/);
    expect(up).toMatch(/p_material_format:\s*SIGNING_BUNDLE_FORMAT/);
    expect(up).toMatch(/p_material_algorithm:\s*SIGNING_BUNDLE_ALGORITHM/);
    expect(up).toMatch(/serializeSigningBundle/);
  });

  test("ingestão por secret permanente foi removida", () => {
    expect(up).not.toMatch(/Deno\.env\.get\("FISCAL_CERT_PFX_B64"\)/);
    expect(up).not.toMatch(/Deno\.env\.get\("FISCAL_CERT_PASSWORD"\)/);
    expect(up).toMatch(/CERTIFICATE_UPLOAD_SOURCE_REQUIRED/);
  });

  test("controles de segurança preservados", () => {
    for (const guard of [
      "cors_origin_not_allowed",
      "administrador",
      "CERTIFICATE_VAULT_NOT_CONFIGURED",
      "CERT_PASSWORD_REQUIRED",
      "isPlausibleAsn1Sequence",
      "private_key_does_not_match_certificate",
      "CERT_CNPJ_MISMATCH",
      "fiscal-certificates",
      "rpc_fiscal_certificate_register_a1",
    ]) {
      expect(up).toContain(guard);
    }
    // rollback do objeto em falha de registro
    expect(up).toMatch(/remove\(\[objectPath\]\)/);
    // nenhum log
    expect(up).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });

  test("senha e bytes do PFX são zerados após o uso", () => {
    expect(up).toMatch(/bytes\.fill\(0\)/);
    expect(up).toMatch(/password = ""/);
  });
});

describe("H7d — assinatura sem senha", () => {
  const engine = read(EF_ENGINE);
  const signer = read(SIGNER);

  test("signer recebe PEMs, não PFX+senha", () => {
    expect(signer).toMatch(/material:\s*SigningMaterial/);
    expect(signer).not.toMatch(/pkcs12FromAsn1/);
    expect(signer).not.toMatch(/password:\s*string/);
    expect(signer).toMatch(/CERTIFICATE_KEY_MISMATCH/);
  });

  test("motor XML não lê colunas de senha e valida o formato do cofre", () => {
    expect(engine).not.toMatch(/encrypted_password/);
    expect(engine).not.toMatch(/password_iv/);
    expect(engine).toMatch(/isSupportedVaultFormat/);
    expect(engine).toMatch(/parseSigningBundle/);
    expect(engine).toMatch(/CERTIFICATE_DECRYPT_FAILED/);
  });

  test("motor XML não devolve material secreto ao cliente", () => {
    expect(engine).not.toMatch(/keyPem\s*[,}]\s*\n?\s*.*json\(/);
    expect(engine).not.toMatch(/console\.(log|info|warn|debug)/);
  });
});

describe("H7d — SQL, rollback e postcheck", () => {
  const apply = read(APPLY);
  const rollback = read(ROLLBACK);
  const post = read(POSTCHECK);

  test("apply remove/neutraliza colunas de senha e mantém RLS fail-closed", () => {
    expect(apply).toMatch(/DROP COLUMN IF EXISTS encrypted_password/);
    expect(apply).toMatch(/DROP COLUMN IF EXISTS password_iv/);
    expect(apply).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(apply).toMatch(/REVOKE ALL ON public\.fiscal_certificate_material FROM anon/);
    expect(apply).toMatch(/REVOKE ALL ON public\.fiscal_certificate_material FROM authenticated/);
    expect(apply).toMatch(/GRANT ALL ON public\.fiscal_certificate_material TO service_role/);
    expect(apply).not.toMatch(/CREATE POLICY/);
  });

  test("apply é restrito ao staging e a RPC não recebe senha", () => {
    expect(apply).toContain("ikaauvsflpmamgxmkhoq");
    expect(apply).not.toContain("navfzbwgwzruipouyfnk");
    const rpcBody = apply.slice(apply.indexOf("CREATE OR REPLACE FUNCTION public.rpc_fiscal_certificate_register_a1"));
    expect(rpcBody).not.toMatch(/p_encrypted_password_b64|p_password_iv_b64/);
    expect(rpcBody).toMatch(/material_format_unsupported/);
  });

  test("rollback não reintroduz senha real e é restrito ao staging", () => {
    expect(rollback).toContain("ikaauvsflpmamgxmkhoq");
    expect(rollback).toMatch(/ADD COLUMN IF NOT EXISTS encrypted_password bytea;?\n?/);
    expect(rollback).not.toMatch(/INSERT INTO public\.fiscal_certificate_material/);
  });

  test("postcheck cobre senha, RLS, grants, RPC e bucket", () => {
    for (const marker of [
      "H7D-1", "H7D-2", "H7D-3", "H7D-4", "H7D-5", "H7D-6", "H7D-7", "H7D-8",
    ]) {
      expect(post).toContain(marker);
    }
  });
});

describe("H7d — documentação corrigida", () => {
  test("doc H7d declara senha transitória", () => {
    const doc = read(DOC);
    expect(doc).toMatch(/senha .*(nunca|jamais).*persistida|nunca é persistida/i);
    expect(doc).toContain("SIGNING_BUNDLE_V2");
  });

  test("docs de secrets não instruem manter senha/PFX como secret permanente", () => {
    for (const p of [
      "docs/auditorias/homologacao-h7-certificado-secrets.md",
      "docs/auditorias/homologacao-h7c-certificado-a1.md",
    ]) {
      const d = read(p);
      expect(d).not.toMatch(/Cadastrar `FISCAL_CERT_PFX_B64`/);
      expect(d).toMatch(/H7d/);
    }
  });
});
