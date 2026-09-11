/**
 * H7b — Congelamento estático dos invariantes de binding/CORS fiscal.
 * Nenhum segredo é lido; apenas contratos versionados no repositório.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const CULTIVOFARM = "swzpzcwiasxmjutrmvkm";
const PRODUCTION = "navfzbwgwzruipouyfnk";

describe("H7b — allowlist CORS fiscal unificada", () => {
  const allowlist = read("supabase/functions/_shared/fiscal/corsAllowlist.ts");

  it("aceita os dois nomes de secret e nunca usa curinga", () => {
    expect(allowlist).toContain("FISCAL_CORS_ALLOWLIST");
    expect(allowlist).toContain("FISCAL_ALLOWED_ORIGINS");
    expect(allowlist).not.toContain('"*"');
  });

  it("fiscal-preflight usa a allowlist compartilhada", () => {
    const preflight = read("supabase/functions/fiscal-preflight/index.ts");
    expect(preflight).toContain("fiscalAllowedOrigins");
    expect(preflight).not.toMatch(/Deno\.env\.get\("FISCAL_ALLOWED_ORIGINS"\)/);
  });
});

describe("H7b — diagnóstico de binding", () => {
  const diag = read("supabase/functions/fiscal-binding-diagnostics/index.ts");

  it("fixa o CultivoFarm esperado e proíbe produção", () => {
    expect(diag).toContain(CULTIVOFARM);
    expect(diag).toContain(PRODUCTION);
    expect(diag).toContain("binding_ok");
  });

  it("nunca retorna valores de segredo", () => {
    expect(diag).toContain("fiscal_certificate_master_key_present");
    expect(diag).not.toMatch(/Deno\.env\.get\("FISCAL_CERTIFICATE_MASTER_KEY"\)\s*\}/);
  });
});

describe("H7b — guard de binding no cliente", () => {
  const guard = read("src/config/fiscalBinding.ts");
  const upload = read("src/components/fiscal/certificados/UploadCertificadoA1.tsx");

  it("é fail-closed para refs desconhecidos e de produção", () => {
    expect(guard).toContain("production_forbidden");
    expect(guard).toContain("ref_mismatch");
    expect(guard).toContain("unknown_ref");
  });

  it("bloqueia o envio do PFX fora do ambiente autorizado", () => {
    expect(upload).toContain("checkFiscalBinding");
    const idx = upload.indexOf("checkFiscalBinding()");
    const invoke = upload.indexOf('functions.invoke("fiscal-certificate-upload"');
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(invoke);
  });
});

describe("H7b — gate de runtime", () => {
  const gate = read("restoration/homologacao-h7/63-h7b-binding-gate.sh");
  it("cobre origem válida, inválida, auth e produção", () => {
    expect(gate).toContain("cors_origin_not_allowed");
    expect(gate).toContain(PRODUCTION);
    expect(gate).toContain("production_emission_allowed");
  });
});
