/**
 * Fase Fiscal H3-A — Testes do cliente de consulta CNPJ.
 *
 * Cobre: DV inválido (sem request), alfanumérico bloqueado, mapeamento de
 * valores, whitelist defensiva, formatação de telefone, propagação de
 * códigos (not_found, rate_limited, timeout, upstream_error, forbidden,
 * unauthorized), cancelamento via AbortSignal, ausência de campos protegidos.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

import {
  lookupCnpj,
  CnpjLookupError,
  LOOKUP_TARGET_FIELDS,
} from "@/lib/fiscal/cnpjLookup";

// CNPJ numérico válido (DV correto)
const CNPJ_VALID = "00000000000191";
// CNPJ numérico com DV inválido
const CNPJ_DV_INVALID = "00000000000192";
// CNPJ alfanumérico válido: 12ABC34501DE + DV.
// Reutilizamos validateCnpjAlpha calculado offline: base "12ABC34501DE" → DV "35".
const CNPJ_ALPHA_VALID = "12ABC34501DE35";

function okResponse(body: unknown) {
  return { data: body, error: null };
}
function errResponse(code: string, status = 400) {
  return {
    data: null,
    error: {
      context: {
        response: new Response(JSON.stringify({ error: code }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      },
    },
  };
}

describe("lookupCnpj (H3-A, via Edge Function)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("rejeita CNPJ com DV inválido ANTES de qualquer request", async () => {
    await expect(lookupCnpj(CNPJ_DV_INVALID)).rejects.toMatchObject({
      code: "invalid_cnpj",
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("rejeita CNPJ com tamanho inválido sem request", async () => {
    await expect(lookupCnpj("123")).rejects.toBeInstanceOf(CnpjLookupError);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("rejeita CNPJ alfanumérico com alpha_unsupported sem request", async () => {
    await expect(lookupCnpj(CNPJ_ALPHA_VALID)).rejects.toMatchObject({
      code: "alpha_unsupported",
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("mapeia campos retornados e formata telefone", async () => {
    invokeMock.mockResolvedValueOnce(
      okResponse({
        source: "brasilapi",
        ibge_unresolved: false,
        tax_regime_hint: "SIMPLES",
        values: {
          legal_name: "ACME LTDA",
          trade_name: "Acme",
          primary_cnae: "4711302",
          phone: "1133224455",
          postal_code: "01001000",
          street: "RUA das Flores",
          number: "123",
          complement: "SALA 4",
          neighborhood: "Centro",
          city: "SAO PAULO",
          state: "SP",
          country_code: "BR",
          municipality_ibge_code: "3550308",
        },
      }),
    );
    const r = await lookupCnpj(CNPJ_VALID);
    expect(invokeMock).toHaveBeenCalledWith("fiscal-cnpj-lookup", {
      body: { version: "fiscal-cnpj-lookup/1.0.0", cnpj: CNPJ_VALID },
    });
    expect(r.source).toBe("brasilapi");
    expect(r.values.phone).toBe("(11) 3322-4455");
    expect(r.values.legal_name).toBe("ACME LTDA");
    expect(r.values.municipality_ibge_code).toBe("3550308");
    expect(r.ibgeUnresolved).toBe(false);
    expect(r.taxRegimeHint).toBe("SIMPLES");
  });

  it("propaga ibge_unresolved e mantém demais campos", async () => {
    invokeMock.mockResolvedValueOnce(
      okResponse({
        source: "brasilapi",
        ibge_unresolved: true,
        tax_regime_hint: null,
        values: { legal_name: "X", state: "SP", city: "Inexistente" },
      }),
    );
    const r = await lookupCnpj(CNPJ_VALID);
    expect(r.ibgeUnresolved).toBe(true);
    expect(r.values.municipality_ibge_code).toBeUndefined();
    expect(r.values.legal_name).toBe("X");
  });

  it("descarta chaves fora da whitelist (nunca toca campos protegidos)", async () => {
    invokeMock.mockResolvedValueOnce(
      okResponse({
        source: "brasilapi",
        ibge_unresolved: false,
        tax_regime_hint: null,
        values: {
          legal_name: "OK",
          // Chaves proibidas (defesa em profundidade):
          cnpj: "99999999999999",
          fiscal_email: "x@y.z",
          tax_regime: "SIMPLES",
          state_registration: "ISENTO",
          municipal_registration: "1",
          nfe_provider: "PLUGNOTAS",
          nfse_provider: "PLUGNOTAS",
          production_enabled: true,
          configuration_version: 42,
        },
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
    invokeMock.mockResolvedValueOnce(errResponse("not_found", 404));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "not_found" });
  });

  it("propaga 429 como rate_limited", async () => {
    invokeMock.mockResolvedValueOnce(errResponse("rate_limited", 429));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("propaga timeout", async () => {
    invokeMock.mockResolvedValueOnce(errResponse("timeout", 504));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "timeout" });
  });

  it("propaga upstream_error", async () => {
    invokeMock.mockResolvedValueOnce(errResponse("upstream_error", 502));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "upstream_error" });
  });

  it("propaga forbidden quando papel não autorizado", async () => {
    invokeMock.mockResolvedValueOnce(errResponse("forbidden", 403));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("propaga unauthorized quando sem sessão", async () => {
    invokeMock.mockResolvedValueOnce(errResponse("unauthorized", 401));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("mapeia falha de rede/lançamento como network_error", async () => {
    invokeMock.mockRejectedValueOnce(new Error("boom"));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "network_error" });
  });

  it("mapeia payload não-objeto como upstream_error", async () => {
    invokeMock.mockResolvedValueOnce(okResponse("not-an-object"));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "upstream_error" });
  });

  it("aborta antes do request quando o signal já está abortado", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(lookupCnpj(CNPJ_VALID, ctrl.signal)).rejects.toMatchObject({
      code: "network_error",
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("encaminha o AbortSignal para supabase.functions.invoke", async () => {
    invokeMock.mockResolvedValueOnce(
      okResponse({ source: "brasilapi", ibge_unresolved: false, tax_regime_hint: null, values: {} }),
    );
    const ctrl = new AbortController();
    await lookupCnpj(CNPJ_VALID, ctrl.signal);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [, opts] = invokeMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts.signal).toBe(ctrl.signal);
    expect((opts.body as { version: string; cnpj: string }).cnpj).toBe(CNPJ_VALID);
  });

  it("mapeia AbortError vindo do invoke como network_error/aborted", async () => {
    const err = Object.assign(new Error("aborted"), { name: "AbortError" });
    invokeMock.mockRejectedValueOnce(err);
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({
      code: "network_error",
      message: "aborted",
    });
  });

  it("401 e 403 são propagados sem exigir mudança na validação DV local", async () => {
    // 401 antes de qualquer detalhamento: cliente confia no status vindo da Edge.
    invokeMock.mockResolvedValueOnce(errResponse("unauthorized", 401));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "unauthorized" });
    invokeMock.mockResolvedValueOnce(errResponse("forbidden", 403));
    await expect(lookupCnpj(CNPJ_VALID)).rejects.toMatchObject({ code: "forbidden" });
    // Ambas ocorreram (2 chamadas).
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
