/**
 * Fase H5-A.1 — Rascunho parcial.
 *
 * O schema de formulário de FiscalEmpresa não pode exigir campos da
 * empresa para simplesmente salvar rascunho. Todas as validações
 * bloqueantes de completude devem ficar em ações posteriores
 * (validar/homologar/ativar), NUNCA no save.
 */
import { describe, it, expect } from "vitest";
import {
  companyFiscalFormSchema,
  buildUpdatePayload,
  FORBIDDEN_PAYLOAD_KEYS,
} from "@/lib/fiscal/companyFiscalValidation";

describe("H5-A.1 · rascunho parcial: schema não exige nada", () => {
  it("objeto vazio é aceito como rascunho", () => {
    const r = companyFiscalFormSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("apenas cnpj + razão social é rascunho válido", () => {
    const r = companyFiscalFormSchema.safeParse({
      cnpj: "11.222.333/0001-81",
      legal_name: "ACME LTDA",
    });
    expect(r.success).toBe(true);
  });

  it("payload de UPDATE não injeta defaults fiscais fictícios", () => {
    const payload = buildUpdatePayload({});
    // Único default permitido é a trava do provider legacy (LOCKED_PROVIDER).
    // Nenhum campo da empresa recebe valor mágico.
    for (const k of ["cnpj", "legal_name", "state", "municipality_ibge_code",
                     "nfe_series", "nfse_series", "postal_code"]) {
      expect(payload).not.toHaveProperty(k);
    }
  });

  it("payload proíbe chaves administrativas mesmo em rascunho", () => {
    const contaminated = {
      cnpj: "11.222.333/0001-81",
      // simula tentativa de mudar production_enabled via UI
      ...(Object.fromEntries(FORBIDDEN_PAYLOAD_KEYS.filter((k) => k !== "configuration_status").map((k) => [k, "x"])) as Record<string, unknown>),
      configuration_status: "VALIDATED" as const,
    };
    // buildUpdatePayload só copia colunas mapeadas — production_enabled
    // e demais chaves proibidas jamais entram no payload.
    const payload = buildUpdatePayload(contaminated) as Record<string, unknown>;
    for (const k of FORBIDDEN_PAYLOAD_KEYS) {
      expect(payload[k]).toBeUndefined();
    }
  });
});
