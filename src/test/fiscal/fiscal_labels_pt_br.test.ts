/**
 * Rótulos centrais fiscais pt-BR.
 * Cobre valores canônicos + fallback "Não mapeado (VALOR)" para
 * códigos legados/desconhecidos, sem coagir nem ocultar o valor técnico.
 */
import { describe, it, expect } from "vitest";
import {
  FISCAL_ENVIRONMENT,
  FISCAL_CONFIGURATION_STATUS,
  FISCAL_PROVIDER,
  NFE_FINALITY,
  NFE_NUMBERING_MODE,
  NFE_DANFE_LAYOUT,
  NFE_CONTINGENCY,
  NFSE_MODE,
  DOCUMENT_MODEL,
  DOCUMENT_ORIGIN,
  NORMALIZED_STATUS,
  DOCUMENT_STATUS,
  RECONCILIATION_STATUS,
  INVOICE_TYPE,
  ITEM_KIND,
  PRODUCT_PROFILE_STATUS,
  SERVICE_PROFILE_STATUS,
  CUSTOMER_PROFILE_STATUS,
  TAXPAYER_INDICATOR,
  ENTITY_KIND,
} from "@/lib/fiscal/labels";

describe("fiscal labels — valores canônicos traduzidos", () => {
  const cases: Array<[string, ReturnType<typeof mk>, string, string]> = [];
  function mk<T extends { label: (v: string) => string }>(x: T) {
    return x;
  }
  const pairs: Array<[string, { label: (v: string | null | undefined) => string }, string, string]> = [
    ["FISCAL_ENVIRONMENT.NOT_CONFIGURED", FISCAL_ENVIRONMENT, "NOT_CONFIGURED", "Não configurado"],
    ["FISCAL_ENVIRONMENT.HOMOLOGATION", FISCAL_ENVIRONMENT, "HOMOLOGATION", "Homologação"],
    ["FISCAL_ENVIRONMENT.PRODUCTION", FISCAL_ENVIRONMENT, "PRODUCTION", "Produção"],
    ["CONFIG.DRAFT", FISCAL_CONFIGURATION_STATUS, "DRAFT", "Rascunho"],
    ["CONFIG.PENDING_ACCOUNTING", FISCAL_CONFIGURATION_STATUS, "PENDING_ACCOUNTING", "Aguardando contabilidade"],
    ["CONFIG.READY_FOR_HOMOLOGATION", FISCAL_CONFIGURATION_STATUS, "READY_FOR_HOMOLOGATION", "Pronto para homologação"],
    ["PROVIDER.NONE", FISCAL_PROVIDER, "NONE", "Nenhum"],
    ["NFE_FINALITY.NORMAL", NFE_FINALITY, "NORMAL", "Normal"],
    ["NFE_FINALITY.RETURN", NFE_FINALITY, "RETURN", "Devolução"],
    ["NFE_NUMBERING_MODE.MANUAL_REFERENCE", NFE_NUMBERING_MODE, "MANUAL_REFERENCE", "Numeração manual (referência)"],
    ["NFE_DANFE_LAYOUT.PORTRAIT", NFE_DANFE_LAYOUT, "PORTRAIT", "Retrato"],
    ["NFE_CONTINGENCY.DISABLED", NFE_CONTINGENCY, "DISABLED", "Desativada"],
    ["NFSE_MODE.NFSE_NACIONAL", NFSE_MODE, "NFSE_NACIONAL", "NFS-e Nacional (padrão)"],
    ["DOCUMENT_MODEL.55", DOCUMENT_MODEL, "55", "NF-e (modelo 55)"],
    ["DOCUMENT_ORIGIN.MANUAL_RECORD", DOCUMENT_ORIGIN, "MANUAL_RECORD", "Registro manual"],
    ["DOCUMENT_ORIGIN.EXTERNAL_IMPORTED", DOCUMENT_ORIGIN, "EXTERNAL_IMPORTED", "Importado externamente"],
    ["DOCUMENT_ORIGIN.SYSTEM_PREPARED", DOCUMENT_ORIGIN, "SYSTEM_PREPARED", "Preparado pelo sistema"],
    ["DOCUMENT_ORIGIN.PROVIDER_INTEGRATED", DOCUMENT_ORIGIN, "PROVIDER_INTEGRATED", "Integrado pelo provedor"],
    ["NORMALIZED_STATUS.ISSUED", NORMALIZED_STATUS, "ISSUED", "Emitido"],
    ["NORMALIZED_STATUS.ERROR", NORMALIZED_STATUS, "ERROR", "Erro"],
    ["NORMALIZED_STATUS.CANCELED", NORMALIZED_STATUS, "CANCELED", "Cancelado"],
    ["NORMALIZED_STATUS.CANCELLED", NORMALIZED_STATUS, "CANCELLED", "Cancelado"],
    ["NORMALIZED_STATUS.REJECTED", NORMALIZED_STATUS, "REJECTED", "Rejeitado"],
    ["DOCUMENT_STATUS.AUTHORIZED", DOCUMENT_STATUS, "AUTHORIZED", "Autorizado"],
    ["DOCUMENT_STATUS.ERROR", DOCUMENT_STATUS, "ERROR", "Erro"],
    ["DOCUMENT_STATUS.CANCELLED", DOCUMENT_STATUS, "CANCELLED", "Cancelado"],
    ["RECONCILIATION.MATCHED", RECONCILIATION_STATUS, "MATCHED", "Conciliada"],
    ["INVOICE_TYPE.NFE", INVOICE_TYPE, "NFE", "NF-e (produtos)"],
    ["INVOICE_TYPE.NFSE", INVOICE_TYPE, "NFSE", "NFS-e (serviços)"],
    ["INVOICE_TYPE.OTHER", INVOICE_TYPE, "OTHER", "Outro"],
    ["ITEM_KIND.SERVICE", ITEM_KIND, "SERVICE", "Serviço"],
    ["PRODUCT_PROFILE.VALIDATED", PRODUCT_PROFILE_STATUS, "VALIDATED", "Validado"],
    ["SERVICE_PROFILE.BLOCKED", SERVICE_PROFILE_STATUS, "BLOCKED", "Bloqueado"],
    ["CUSTOMER_PROFILE.INCOMPLETE", CUSTOMER_PROFILE_STATUS, "INCOMPLETE", "Incompleto"],
    ["TAXPAYER.1", TAXPAYER_INDICATOR, "1", "Contribuinte de ICMS"],
    ["TAXPAYER.9", TAXPAYER_INDICATOR, "9", "Não contribuinte"],
    ["ENTITY_KIND.produto", ENTITY_KIND, "produto", "Produto"],
    ["ENTITY_KIND.microrganismo", ENTITY_KIND, "microrganismo", "Microrganismo"],
  ];
  for (const [name, mod, v, expected] of pairs) {
    it(`${name} → "${expected}"`, () => {
      expect(mod.label(v)).toBe(expected);
    });
  }
  void cases;
});

describe("Reconciliação — filtros de tipo NFE/NFSE/OTHER", () => {
  it('nenhum valor renderiza como "Não mapeado"', () => {
    for (const v of ["NFE", "NFSE", "OTHER"]) {
      const label = INVOICE_TYPE.label(v);
      expect(label).not.toMatch(/^Não mapeado/);
      expect(label).not.toBe(v);
    }
    expect(INVOICE_TYPE.label("NFE")).toBe("NF-e (produtos)");
    expect(INVOICE_TYPE.label("NFSE")).toBe("NFS-e (serviços)");
    expect(INVOICE_TYPE.label("OTHER")).toBe("Outro");
  });
});

describe("fiscal labels — fallback legado", () => {
  it('valores desconhecidos viram "Não mapeado (VALOR)" e nunca o código puro', () => {
    expect(FISCAL_ENVIRONMENT.label("LEGADO_X")).toBe("Não mapeado (LEGADO_X)");
    expect(NORMALIZED_STATUS.label("OUTRO")).toBe("Não mapeado (OUTRO)");
    expect(DOCUMENT_ORIGIN.label("XYZ")).toBe("Não mapeado (XYZ)");
    // Nunca devolve string vazia; entradas nulas viram "—".
    expect(FISCAL_ENVIRONMENT.label(null)).toBe("—");
    expect(FISCAL_ENVIRONMENT.label(undefined)).toBe("—");
    expect(FISCAL_ENVIRONMENT.label("")).toBe("—");
  });
});

describe("fiscal labels — toOptions preserva value técnico", () => {
  it("mapeia códigos brutos em {value,label} sem alterar o value", () => {
    const raw = ["NOT_CONFIGURED", "HOMOLOGATION"] as const;
    const opts = FISCAL_ENVIRONMENT.toOptions(raw);
    expect(opts).toEqual([
      { value: "NOT_CONFIGURED", label: "Não configurado" },
      { value: "HOMOLOGATION", label: "Homologação" },
    ]);
    // Códigos desconhecidos entram como "Não mapeado", sem descartar o value.
    const legacy = FISCAL_ENVIRONMENT.toOptions(["OFFLINE_LEGADO"]);
    expect(legacy[0].value).toBe("OFFLINE_LEGADO");
    expect(legacy[0].label).toBe("Não mapeado (OFFLINE_LEGADO)");
  });
});
