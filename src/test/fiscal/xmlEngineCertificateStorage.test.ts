import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENGINE = readFileSync(
  resolve(process.cwd(), "supabase/functions/fiscal-xml-engine/index.ts"),
  "utf8",
);

describe("fiscal-xml-engine — certificado vinculado ao emitente", () => {
  it("não seleciona certificado pelo mais recente disponível", () => {
    expect(ENGINE).not.toMatch(/\.order\(\s*["']valid_until["']/);
    expect(ENGINE).not.toMatch(/\.limit\(1\)/);
  });

  it("resolve o certificado pela RPC canônica usando o invoiceId", () => {
    expect(ENGINE).toContain('rpc("rpc_fiscal_certificate_for_invoice_v1"');
    expect(ENGINE).toMatch(/_invoice_id:\s*invoiceId/);
  });

  it("consulta a readiness apenas pelo certificateId devolvido pela RPC", () => {
    expect(ENGINE).toMatch(/\.eq\("certificate_id",\s*certificateId\)/);
    expect(ENGINE).toMatch(/certRow\.data\.status !== "AVAILABLE"/);
    expect(ENGINE).toMatch(/certRow\.data\.environment !== "HOMOLOGATION"/);
  });

  it("devolve CERTIFICATE_REQUIRED preservando a execução em GENERATED", () => {
    const blocks = ENGINE.match(/code: "CERTIFICATE_REQUIRED"/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(ENGINE).toMatch(/state: "GENERATED", code: "CERTIFICATE_REQUIRED"/);
  });
});

describe("fiscal-xml-engine — via legada de certificado de teste removida", () => {
  it.each([
    "FISCAL_TEST_CERTIFICATE_MASTER_KEY",
    "F42-HARNESS-",
    "_fiscal_staging_marker",
    "HARNESS_FIXTURE_PREFIX",
    "STAGING_PROJECT_REF",
    "resolveMasterKey",
  ])("não referencia %s", (token) => {
    expect(ENGINE).not.toContain(token);
  });

  it("usa somente a chave mestra canônica", () => {
    expect(ENGINE).toContain('Deno.env.get("FISCAL_CERTIFICATE_MASTER_KEY")'); // via comentário + módulo compartilhado
    expect(ENGINE).toContain("const masterKey = await decodeMasterKey();");
  });
});

describe("fiscal-xml-engine — integridade dos artefatos no Storage", () => {
  it("reutiliza o helper de verificação da H14", () => {
    expect(ENGINE).toContain('from "../_shared/fiscal/nfe/protocoledStorage.ts"');
    expect(ENGINE).toContain("isAlreadyExistingObject");
    expect(ENGINE).toContain("verifyExistingObject");
  });

  it("não usa regex ampla de exists como autoridade de integridade", () => {
    expect(ENGINE).not.toMatch(/\/exists\|duplicate\/i/);
  });

  it("nunca sobrescreve artefato (nenhum upsert:true)", () => {
    expect(ENGINE).not.toMatch(/upsert:\s*true/);
    expect(ENGINE).toMatch(/upsert:\s*false/);
  });

  it("bloqueia replay divergente do XML não assinado", () => {
    expect(ENGINE).toContain('ensureStoredArtifact(admin, unsignedPath, unsignedBytes, unsignedSha)');
    expect(ENGINE).toContain('fail("XML_STORAGE_CONFLICT", "artefato não assinado divergente no mesmo caminho", 409)');
  });

  it("bloqueia replay divergente do XML assinado sem registrar SIGNED", () => {
    expect(ENGINE).toContain('ensureStoredArtifact(admin, signedPath, signedBytes, signedSha)');
    expect(ENGINE).toContain('fail("XML_STORAGE_CONFLICT", "artefato assinado divergente no mesmo caminho", 409)');
    const conflictIdx = ENGINE.indexOf('artefato assinado divergente');
    const signedRecordIdx = ENGINE.indexOf('p_state: "SIGNED"');
    expect(conflictIdx).toBeGreaterThan(-1);
    expect(signedRecordIdx).toBeGreaterThan(conflictIdx);
  });

  it("falha fechado quando a verificação do objeto existente não é possível", () => {
    expect((ENGINE.match(/XML_STORAGE_VERIFY_FAILED/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("aceita replay somente quando hash e tamanho conferem", () => {
    expect(ENGINE).toMatch(/verifyExistingObject\([\s\S]*?expectedSha,[\s\S]*?bytes\.byteLength,/);
    expect(ENGINE).toContain("if (!verdict) return null;");
  });
});

describe("fiscal-xml-engine — guardas preservadas", () => {
  it("mantém guard canônico do projeto", () => {
    expect(ENGINE).toContain("isCanonicalSupabaseUrl(supabaseUrl)");
    expect(ENGINE).toContain("FISCAL_CANONICAL_PROJECT_REQUIRED");
  });

  it("mantém produção bloqueada e sem transmissão", () => {
    expect(ENGINE).toContain("transmitted: false");
    expect(ENGINE).not.toMatch(/tpAmb\s*[:=]\s*["']1["']/);
  });
});
