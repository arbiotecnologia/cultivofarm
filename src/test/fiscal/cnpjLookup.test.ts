/**
 * Testes do mapeamento RFB → formulário fiscal (Fase Fiscal — CNPJ lookup).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  lookupCnpj,
  CnpjLookupError,
  LOOKUP_TARGET_FIELDS,
} from "@/lib/fiscal/cnpjLookup";

const RFB_OK = {
  razao_social: "ACME INDUSTRIA LTDA",
  nome_fantasia: "Acme",
  cnae_fiscal: 4711302,
  descricao_tipo_de_logradouro: "RUA",
  logradouro: "das Flores",
  numero: "123",
  complemento: "SALA 4",
  bairro: "Centro",
  cep: "01001000",
  uf: "SP",
  municipio: "SAO PAULO",
  ddd_telefone_1: "1133224455",
  opcao_pelo_simples: true,
  opcao_pelo_mei: false,
};

const IBGE_SP = [
  { nome: "São Paulo", codigo_ibge: "3550308" },
  { nome: "Campinas", codigo_ibge: "3509502" },
];

function mockFetchSequence(responses: Array<{ status?: number; body?: unknown }>) {
  const spy = vi.spyOn(globalThis, "fetch" as never) as unknown as ReturnType<
    typeof vi.fn
  >;
  responses.forEach((r) => {
    spy.mockResolvedValueOnce({
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.body,
    } as Response);
  });
  return spy;
}

describe("lookupCnpj", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("rejeita CNPJ com tamanho inválido", async () => {
    await expect(lookupCnpj("123")).rejects.toBeInstanceOf(CnpjLookupError);
    await expect(lookupCnpj("123")).rejects.toMatchObject({ code: "invalid_cnpj" });
  });

  it("rejeita CNPJ alfanumérico (sem endpoint público)", async () => {
    // 12 chars com uma letra + 2 dígitos DV quaisquer
    await expect(lookupCnpj("ABCDE12345670012")).rejects.toMatchObject({
      code: "invalid_cnpj",
    });
    // Comprimento certo, mas com letra
    await expect(lookupCnpj("1234567890123A")).rejects.toMatchObject({
      code: "invalid_cnpj",
    });
    await expect(lookupCnpj("A1234567890123")).rejects.toMatchObject({
      code: "alpha_unsupported",
    });
  });

  it("mapeia campos RFB e resolve IBGE por nome (case/acento-insensível)", async () => {
    mockFetchSequence([{ body: RFB_OK }, { body: IBGE_SP }]);
    const r = await lookupCnpj("00000000000191");
    expect(r.values.legal_name).toBe("ACME INDUSTRIA LTDA");
    expect(r.values.trade_name).toBe("Acme");
    expect(r.values.primary_cnae).toBe("4711302");
    expect(r.values.postal_code).toBe("01001000");
    expect(r.values.street).toBe("RUA das Flores");
    expect(r.values.number).toBe("123");
    expect(r.values.complement).toBe("SALA 4");
    expect(r.values.neighborhood).toBe("Centro");
    expect(r.values.city).toBe("SAO PAULO");
    expect(r.values.state).toBe("SP");
    expect(r.values.country_code).toBe("BR");
    expect(r.values.municipality_ibge_code).toBe("3550308");
    expect(r.values.phone).toBe("(11) 3322-4455");
    expect(r.ibgeUnresolved).toBe(false);
    expect(r.taxRegimeHint).toBe("SIMPLES");
  });

  it("marca ibgeUnresolved quando município não bate", async () => {
    mockFetchSequence([
      { body: { ...RFB_OK, municipio: "Cidade Inexistente" } },
      { body: IBGE_SP },
    ]);
    const r = await lookupCnpj("00000000000191");
    expect(r.ibgeUnresolved).toBe(true);
    expect(r.values.municipality_ibge_code).toBeUndefined();
  });

  it("propaga 404 como not_found", async () => {
    mockFetchSequence([{ status: 404, body: {} }]);
    await expect(lookupCnpj("00000000000191")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("propaga 429 como rate_limited", async () => {
    mockFetchSequence([{ status: 429, body: {} }]);
    await expect(lookupCnpj("00000000000191")).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("nunca mapeia campos protegidos (regime, inscrições, e-mail, provider)", async () => {
    mockFetchSequence([{ body: RFB_OK }, { body: IBGE_SP }]);
    const r = await lookupCnpj("00000000000191");
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
    ]) {
      expect(keys).not.toContain(forbidden);
    }
    // Todos os campos retornados estão na whitelist
    for (const k of keys) {
      expect(LOOKUP_TARGET_FIELDS as readonly string[]).toContain(k);
    }
  });
});
