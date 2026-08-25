/**
 * FASE H7 — Guard duro de endpoints SEFAZ (fail-closed, somente homologação).
 */
import { describe, it, expect } from "vitest";
import {
  assertSefazEndpointAllowed,
  resolveSefazEndpoint,
  SefazEndpointError,
  SEFAZ_MG_HOMOLOGATION_ENDPOINTS,
  SEFAZ_MG_HOMOLOGATION_HOST,
  SEFAZ_MG_PRODUCTION_HOST,
  SEFAZ_PRODUCTION_HOSTS,
} from "../../../supabase/functions/_shared/fiscal/sefazEndpoints";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof SefazEndpointError ? e.code : `UNEXPECTED:${String(e)}`;
  }
  return "NO_ERROR";
}

describe("H7 — endpoints SEFAZ", () => {
  it("resolve os 6 serviços em homologação MG", () => {
    for (const svc of Object.keys(SEFAZ_MG_HOMOLOGATION_ENDPOINTS) as Array<
      keyof typeof SEFAZ_MG_HOMOLOGATION_ENDPOINTS
    >) {
      const url = resolveSefazEndpoint(svc, "2");
      expect(new URL(url).hostname).toBe(SEFAZ_MG_HOMOLOGATION_HOST);
      expect(url.startsWith("https://")).toBe(true);
    }
  });

  it("bloqueia resolução quando tpAmb=1", () => {
    expect(codeOf(() => resolveSefazEndpoint("NFeAutorizacao4", "1"))).toBe(
      "SEFAZ_PRODUCTION_DISABLED",
    );
  });

  it("bloqueia host de produção mesmo com tpAmb=2", () => {
    expect(
      codeOf(() =>
        assertSefazEndpointAllowed(
          `https://${SEFAZ_MG_PRODUCTION_HOST}/nfe2/services/NFeAutorizacao4`,
          "2",
        ),
      ),
    ).toBe("SEFAZ_PRODUCTION_HOST_BLOCKED");
  });

  it("bloqueia todos os hosts de produção conhecidos", () => {
    for (const host of SEFAZ_PRODUCTION_HOSTS) {
      expect(codeOf(() => assertSefazEndpointAllowed(`https://${host}/x`, "2"))).toBe(
        "SEFAZ_PRODUCTION_HOST_BLOCKED",
      );
    }
  });

  it("bloqueia host arbitrário fora da allowlist", () => {
    expect(codeOf(() => assertSefazEndpointAllowed("https://evil.example.com/nfe", "2"))).toBe(
      "SEFAZ_HOST_NOT_ALLOWLISTED",
    );
  });

  it("exige HTTPS", () => {
    expect(
      codeOf(() => assertSefazEndpointAllowed(`http://${SEFAZ_MG_HOMOLOGATION_HOST}/x`, "2")),
    ).toBe("SEFAZ_ENDPOINT_NOT_TLS");
  });

  it("rejeita URL inválida", () => {
    expect(codeOf(() => assertSefazEndpointAllowed("nao-e-url", "2"))).toBe(
      "SEFAZ_ENDPOINT_INVALID_URL",
    );
  });

  it("host de homologação com tpAmb=1 é fail-closed", () => {
    expect(
      codeOf(() =>
        assertSefazEndpointAllowed(
          `https://${SEFAZ_MG_HOMOLOGATION_HOST}/nfe2/services/NFeStatusServico4`,
          "1",
        ),
      ),
    ).toBe("SEFAZ_PRODUCTION_DISABLED");
  });

  it("serviço desconhecido é rejeitado", () => {
    expect(codeOf(() => resolveSefazEndpoint("NFeQualquer4" as never, "2"))).toBe(
      "SEFAZ_SERVICE_UNKNOWN",
    );
  });
});
