/**
 * H7 — Smokes autenticados de homologação: gate, sanitização e ausência de
 * efeito econômico.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  checkCertificateSelfTestGate,
  checkSmokeEnvironment,
  sanitizeSefazStatusResponse,
  sanitizeSelfTestResponse,
  sanitizeSmokeError,
} from "@/lib/fiscal/homologationSmokeGate";

const HML = {
  isAdmin: true,
  fiscalEnvironment: "HOMOLOGATION",
  nfeEnvironmentCode: "2",
  productionEnabled: false,
};
const CERT = {
  environment: "HOMOLOGATION",
  status: "AVAILABLE",
  isActive: true,
  daysUntilExpiration: 287,
};

describe("H7M — gate dos smokes", () => {
  it("libera somente administrador", () => {
    expect(checkSmokeEnvironment(HML).enabled).toBe(true);
    const nao = checkSmokeEnvironment({ ...HML, isAdmin: false });
    expect(nao.enabled).toBe(false);
    expect(nao.reason).toBe("not_admin");
  });

  it("bloqueia fora de homologação/tpAmb=2", () => {
    expect(checkSmokeEnvironment({ ...HML, fiscalEnvironment: "PRODUCTION" }).reason)
      .toBe("not_homologation");
    expect(checkSmokeEnvironment({ ...HML, nfeEnvironmentCode: "1" }).reason)
      .toBe("not_homologation");
    expect(checkSmokeEnvironment({ ...HML, fiscalEnvironment: null }).reason)
      .toBe("settings_unavailable");
  });

  it("bloqueia com produção habilitada", () => {
    expect(checkSmokeEnvironment({ ...HML, productionEnabled: true }).reason)
      .toBe("production_enabled");
  });

  it("autoteste exige certificado ativo, disponível e vigente", () => {
    expect(checkCertificateSelfTestGate(HML, CERT).enabled).toBe(true);
    expect(checkCertificateSelfTestGate(HML, null).reason).toBe("certificate_unavailable");
    expect(checkCertificateSelfTestGate(HML, { ...CERT, isActive: false }).reason)
      .toBe("certificate_unavailable");
    expect(checkCertificateSelfTestGate(HML, { ...CERT, status: "REVOKED" }).reason)
      .toBe("certificate_unavailable");
    expect(checkCertificateSelfTestGate(HML, { ...CERT, daysUntilExpiration: -1 }).reason)
      .toBe("certificate_expired");
    expect(checkCertificateSelfTestGate({ ...HML, isAdmin: false }, CERT).reason).toBe("not_admin");
  });
});

describe("H7M — sanitização das respostas", () => {
  it("descarta qualquer campo fora da allowlist do autoteste", () => {
    const view = sanitizeSelfTestResponse({
      bundle_parsed: true,
      key_matches_certificate: true,
      signature_verified: true,
      certificate_within_validity: true,
      key_usage_digital_signature: true,
      days_until_expiry: 287,
      persisted: false,
      transmitted: false,
      environmentCode: "2",
      // campos proibidos que jamais podem atravessar:
      certPem: "-----BEGIN CERTIFICATE-----AAA",
      keyPem: "-----BEGIN PRIVATE KEY-----BBB",
      signature: "ZZZ",
      fingerprint_sha256: "ab".repeat(32),
      object_path: "fiscal-certificates/x.pfx",
      material_iv: "iv",
    });
    const dump = JSON.stringify(view);
    for (const proibido of ["BEGIN", "ZZZ", "abab", "fiscal-certificates", "iv\""]) {
      expect(dump).not.toContain(proibido);
    }
    expect(view.signatureVerified).toBe(true);
    expect(view.persisted).toBe(false);
    expect(view.transmitted).toBe(false);
    expect(view.daysUntilExpiry).toBe(287);
  });

  it("é fail-closed sobre persistência/transmissão ausentes", () => {
    const view = sanitizeSelfTestResponse({});
    expect(view.persisted).toBe(true);
    expect(view.transmitted).toBe(true);
    expect(view.bundleParsed).toBe(false);
  });

  it("sanitiza o status da SEFAZ e ignora payload bruto", () => {
    const view = sanitizeSefazStatusResponse(
      {
        cStat: "107",
        xMotivo: "Servico   em Operacao",
        environmentCode: "2",
        rawSoap: "<soap>segredo</soap>",
        chNFe: "3126".padEnd(44, "0"),
      },
      412.7,
    );
    expect(view.cStat).toBe("107");
    expect(view.xMotivo).toBe("Servico em Operacao");
    expect(view.environmentCode).toBe("2");
    expect(view.durationMs).toBe(413);
    expect(JSON.stringify(view)).not.toContain("soap");
    expect(JSON.stringify(view)).not.toContain("3126");
  });

  it("erros nunca vazam detalhe bruto", () => {
    expect(sanitizeSmokeError(new Error("SEFAZ_MTLS_UNAVAILABLE: -----BEGIN PRIVATE KEY-----")))
      .toBe("Falha no teste (código SEFAZ_MTLS_UNAVAILABLE).");
    expect(sanitizeSmokeError(new Error("boom /tmp/secret.pfx"))).not.toContain("pfx");
  });
});

describe("H7M — contrato do hook e da UI", () => {
  const hook = readFileSync("src/hooks/useFiscalHomologationSmokes.ts", "utf8");
  const ui = readFileSync(
    "src/components/fiscal/homologacao/SmokesHomologacaoSecao.tsx",
    "utf8",
  );

  it("usa exatamente as ações inertes já publicadas", () => {
    expect(hook).toContain('"fiscal-event-sign"');
    expect(hook).toContain('action: "self_test"');
    expect(hook).toContain('"fiscal-sefaz-transport"');
    expect(hook).toContain('action: "status"');
    for (const proibido of [
      'action: "authorize"', 'action: "event"', 'action: "consult"', 'action: "receipt"',
      "run_id", "access_key",
    ]) {
      expect(hook).not.toContain(proibido);
    }
  });

  it("nunca loga e sempre sanitiza antes de retornar", () => {
    expect(hook).not.toContain("console.log");
    expect(hook).not.toContain("console.error");
    expect(hook).toContain("sanitizeSelfTestResponse");
    expect(hook).toContain("sanitizeSefazStatusResponse");
  });

  it("previne clique duplo e respeita o gate", () => {
    expect(ui).toContain("disabled={!certGate.enabled || selfTest.isPending}");
    expect(ui).toContain("disabled={!envGate.enabled || sefazStatus.isPending || !draftId}");
    expect(hook).toContain("invoice_id: invoiceId");
    expect(hook).toContain('.eq("environment", "HOMOLOGATION")');
    expect(hook).toContain('.eq("normalized_status", "DRAFT")');
    expect(ui).toContain("if (!isAdmin) return null;");
  });

  it("não altera configuração fiscal nem cria documento", () => {
    for (const proibido of [".update(", ".insert(", "nfe_enabled", "configuration_status", "READY"]) {
      expect(ui).not.toContain(proibido);
    }
  });
});
