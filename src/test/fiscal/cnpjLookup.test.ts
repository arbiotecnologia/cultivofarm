/**
 * Consulta CNPJ da tela fiscal — agora pelo mesmo canal direto usado nos
 * cadastros de Cliente e Parceiro B2B (BrasilAPI).
 *
 * Cobre: DV inválido (sem request), alfanumérico bloqueado, mapeamento de
 * valores, whitelist defensiva, formatação de telefone, 404/429/5xx,
 * payload inválido, cancelamento via AbortSignal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  lookupCnpj,
  CnpjLookupError,
  LOOKUP_TARGET_FIELDS,
} from "@/lib/fiscal/cnpjLookup";

// CNPJ numérico válido (DV correto)
const CNPJ_VALID = "00000000000191";
// CNPJ numérico com DV inválido
const CNPJ_DV_INVALID = "00000000000192";
// CNPJ alfanumérico válido: base "12ABC34501DE" → DV "35".
const CNPJ_ALPHA_VALID = "12ABC34501DE35";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FULL_PAYLOAD = {
  razao_social: "ACME LTDA",
  nome_fantasia: "Acme",
  cnae_fiscal: 4711302,
  ddd_telefone_1: "1133224455",
  cep: "01001-000",
  logradouro: "RUA das Flores",
  numero: "123",
  complemento: "SALA 4",
  bairro: "Centro",
  municipio: "SAO PAULO",
  uf: "SP",
  codigo_municipio_ibge: "3550308",
  opcao_pelo_simples: true,
  opcao_pelo_mei: false,
};

describe("lookupCnpj (BrasilAPI direto)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("rejeita CNPJ com DV inválido ANTES de qualquer request", async () => {
    await expect(lookupCnpj(CNPJ_DV_INVALID)).rejects.toMatchObject({
      code: "invalid_cnpj",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejeita CNPJ com tamanho inválido sem request", async () => {
    await expect(lookupCnpj("123")).rejects.toBeInstanceOf(CnpjLookupError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejeita CNPJ alfanumérico com alpha_unsupported sem request", async () => {
    await expect(lookupCnpj(CNPJ_ALPHA_VALID)).rejects.toMatchObject({
      code: "alpha_unsupported",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consulta a base pública e mapeia campos, formatando telefone", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FULL_PAYLOAD));
    const r = await lookupCnpj(CNPJ_VALID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://brasilapi.com.br/api/cnpj/v1/${CNPJ_VALID}`);
    expect(r.source).toBe("brasilapi");
    expect(r.values.legal_name).toBe("ACME LTDA");
    expect(r.values.trade_name).toBe("Acme");
    expect(r.values.primary_cnae).toBe("4711302");
    expect(r.values.phone).toBe("(11) 3322-4455");
    expect(r.values.postal_code).toBe("01001000");
    expect(r.values.city).toBe("SAO PAULO");
    expect(r.values.state).toBe("SP");
    expect(r.values.country_code).toBe("BR");
    expect(r.values.municipality_ibge_code).toBe("3550308");
    expect(r.ibgeUnresolved).toBe(false);
    expect(r.taxRegimeHint).toBe("SIMPLES");
  });

  it("marca ibgeUnresolved quando o código IBGE não vem na resposta", async () => {
    const { codigo_municipio_ibge: _omit, ...rest } = FULL_PAYLOAD;
    fetchMock.mockResolvedValueOnce(jsonResponse(rest));
    const r = await lookupCnpj(CNPJ_VALID);
    expect(r.ibgeUnresolved).toBe(true);
    expect(r.values.municipality_ibge_code).toBeUndefined();
    expect(r.values.legal_name).toBe("ACME LTDA");
  });

  it("usa razão social como nome fantasia quando ausente", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...FULL_PAYLOAD, nome_fantasia: "" }),
    );
    const r = await lookupCnpj(CNPJ_VALID);
    expect(r.values.trade_name).toBe("ACME LTDA");
  });

  it("sinaliza MEI quando aplicável", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...FULL_PAYLOAD, opcao_pelo_mei: true }),
    );
    const r = await lookupCnpj(CNPJ_VALID);
    expect(r.taxRegimeHint).toBe("MEI");
  });

  it("nunca preenche campos fora da whitelist", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...FULL_PAYLOAD,
        cnpj: "99999999999999",
        fiscal_email: "x@y.z",
        tax_regime: "SIMPLES",
        crt: "1",
        state_registration: "ISENTO",
        municipal_registration: "1",
        nfe_provider: "PLUGNOTAS",
        production_enabled: true,
        configuration_version: 42,
      }),
    );
    const r = await lookupCnpj(CNPJ_VALID);
    const keys = Object.keys(r.values);
    for (const forbidden of [
      "cnpj",
      "fiscal_email",
      "tax_regime",
      "crt",
      "state_registration",
      "municipal_registration",
      "nfe_provider",
      "nfse_provider",
      "nfe_configuration",
      "nfse_configuration",
      "configuration_status",
      "configuration_version",
      "production_enabled",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
    for (const k of keys) {
      expect(LOOKUP_TARGET_FIELDS as readonly string[]).toContain(k);
    }
  });

  it("propaga 404 como not_found", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "não encontrado" }, 404));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "not_found" });
  });

  it("propaga 429 como rate_limited", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 429));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("propaga 504 como timeout", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 504));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "timeout" });
  });

  it("propaga 5xx como upstream_error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 502));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "upstream_error" });
  });

  it("mapeia falha de rede como network_error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "network_error" });
  });

  it("mapeia corpo não-JSON como upstream_error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>erro</html>", { status: 200 }),
    );
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "upstream_error" });
  });

  it("mapeia payload não-objeto como upstream_error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse("not-an-object"));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "upstream_error" });
  });

  it("aborta antes do request quando o signal já está abortado", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(lookupCnpj(CNPJ_VALID, ctrl.signal)).rejects.toMatchObject({
      code: "network_error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("encaminha um AbortSignal ao fetch e cancela quando o chamador aborta", async () => {
    const ctrl = new AbortController();
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    });
    const p = lookupCnpj(CNPJ_VALID, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ code: "network_error", message: "aborted" });
  });
});
