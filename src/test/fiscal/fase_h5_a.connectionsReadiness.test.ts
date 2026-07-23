/**
 * Fase H5-A — Testes da prontidão de conexões.
 *
 * Cobre:
 *  - Rascunho parcial: nenhum valor inventado, singleton null => todos "não iniciado".
 *  - NF-e/NFS-e desativados => "Não aplicável" e não contribuem para pendências.
 *  - Todos os estados de item aparecem conforme dados.
 *  - Deep-links no formato canônico `?aba=<aba>#<id>` (ou `?aba=<aba>`).
 *  - Produção NÃO é permitida enquanto readiness estiver incompleta; mesmo
 *    quando permitida, o resultado só é reportado (não ativa nada).
 *  - Certificado expirado bloqueia (blocker); ambiente 'production' vira
 *    pendência para retornar à homologação.
 *  - Varredura ampla: nenhum campo sensível (token/senha/pfx/fingerprint)
 *    entra no payload calculado.
 */
import { describe, it, expect } from "vitest";
import {
  computeConnectionsReadiness,
  CONNECTION_STATUS_LABEL_PTBR,
  type ConnectionItemKey,
} from "@/lib/fiscal/connectionsReadiness";
import type { CompanyFiscalRow } from "@/hooks/useFiscalCompanySettings";
import type { FiscalCertificateReadinessRow } from "@/hooks/useFiscalCertificates";

function baseRow(overrides: Partial<CompanyFiscalRow> = {}): CompanyFiscalRow {
  return {
    id: "cs-1",
    cnpj: "11.222.333/0001-81",
    legal_name: "ACME LTDA",
    state: "SP",
    municipality_ibge_code: "3550308",
    fiscal_environment: "HOMOLOGATION",
    fiscal_provider: "NONE",
    nfe_enabled: true, nfe_provider: "NONE", nfe_credential_ref: null, nfe_series: "1",
    nfse_enabled: false, nfse_provider: "NONE", nfse_credential_ref: null, nfse_series: null,
    production_enabled: false,
    webhook_ref: null,
    ...overrides,
  } as unknown as CompanyFiscalRow;
}

function cert(status: FiscalCertificateReadinessRow["status"], days: number | null): FiscalCertificateReadinessRow {
  return {
    certificate_id: "c1", company_settings_id: "cs-1",
    source_type: "A1_UPLOAD", environment: "HOMOLOGATION",
    status, display_name: "A1 Empresa", subject_name: null, issuer_name: null,
    valid_from: null, valid_until: null, fingerprint_sha256: null,
    is_active: true, revoked_at: null, days_until_expiration: days,
  };
}

function findItem(items: ReturnType<typeof computeConnectionsReadiness>["items"], key: ConnectionItemKey) {
  const it = items.find((i) => i.key === key);
  if (!it) throw new Error(`item ${key} não encontrado`);
  return it;
}

describe("H5-A · computeConnectionsReadiness — rascunho parcial", () => {
  it("singleton null => todos os itens iniciam como 'não iniciado' (nada inventado)", () => {
    const r = computeConnectionsReadiness(null, []);
    // Nenhum item aparece com contagem numérica ou valor fictício.
    for (const item of r.items) {
      expect(item.status === "not_started").toBe(true);
      expect(item.description).not.toMatch(/\b0\b/);
    }
    expect(r.hasBlocker).toBe(false);
    expect(r.productionAllowed).toBe(false);
  });

  it("dados parciais (só CNPJ) => empresa 'pendente', demais coerentes", () => {
    const row = baseRow({ legal_name: null, state: null, municipality_ibge_code: null,
      nfe_enabled: false, nfse_enabled: false });
    const r = computeConnectionsReadiness(row, []);
    expect(findItem(r.items, "empresa").status).toBe("pending");
    expect(findItem(r.items, "nfe").status).toBe("not_applicable");
    expect(findItem(r.items, "nfse").status).toBe("not_applicable");
    expect(findItem(r.items, "provedor").status).toBe("not_applicable");
    expect(findItem(r.items, "credenciais_provedor").status).toBe("not_applicable");
  });
});

describe("H5-A · Estados de NF-e e NFS-e", () => {
  it("NF-e habilitada sem provedor/série => pendente", () => {
    const r = computeConnectionsReadiness(baseRow({ nfe_provider: "NONE", nfe_series: null }), []);
    const nfe = findItem(r.items, "nfe");
    expect(nfe.status).toBe("pending");
    expect(nfe.description).toMatch(/provedor.*série/i);
  });
  it("NF-e habilitada com provedor + série => preenchido — não testado", () => {
    const r = computeConnectionsReadiness(baseRow({ nfe_provider: "TECNOSPEED", nfe_series: "1" }), []);
    expect(findItem(r.items, "nfe").status).toBe("filled_untested");
  });
  it("NFS-e desativado => Não aplicável", () => {
    const r = computeConnectionsReadiness(baseRow({ nfse_enabled: false }), []);
    expect(findItem(r.items, "nfse").status).toBe("not_applicable");
  });
});

describe("H5-A · Provedor/Credenciais/Webhook/Ambiente", () => {
  it("credenciais_provedor: ref ausente => pendente; presente => não testado", () => {
    const pending = computeConnectionsReadiness(baseRow({ nfe_credential_ref: null }), []);
    expect(findItem(pending.items, "credenciais_provedor").status).toBe("pending");
    const filled = computeConnectionsReadiness(baseRow({ nfe_credential_ref: "cred-1" }), []);
    expect(findItem(filled.items, "credenciais_provedor").status).toBe("not_tested");
  });
  it("webhook_ref ausente => pendente; presente => não testado", () => {
    const r0 = computeConnectionsReadiness(baseRow({ webhook_ref: null }), []);
    expect(findItem(r0.items, "webhook").status).toBe("pending");
    const r1 = computeConnectionsReadiness(baseRow({ webhook_ref: "wh-x" }), []);
    expect(findItem(r1.items, "webhook").status).toBe("not_tested");
  });
  it("ambiente = homologação => pronto para testar", () => {
    const r = computeConnectionsReadiness(baseRow({ fiscal_environment: "HOMOLOGATION" }), []);
    expect(findItem(r.items, "ambiente").status).toBe("ready_to_test");
  });
  it("ambiente = production => pendente (não bloqueia salvar, mas sinaliza)", () => {
    const r = computeConnectionsReadiness(baseRow({ fiscal_environment: "PRODUCTION" }), []);
    expect(findItem(r.items, "ambiente").status).toBe("pending");
  });
});

describe("H5-A · Certificado A1", () => {
  it("sem certificado => não iniciado", () => {
    const r = computeConnectionsReadiness(baseRow(), []);
    expect(findItem(r.items, "certificado_a1").status).toBe("not_started");
  });
  it("A1 AVAILABLE dentro da validade => preenchido — não testado", () => {
    const r = computeConnectionsReadiness(baseRow(), [cert("AVAILABLE", 120)]);
    expect(findItem(r.items, "certificado_a1").status).toBe("filled_untested");
  });
  it("A1 EXPIRED => BLOQUEADO (blocker)", () => {
    const r = computeConnectionsReadiness(baseRow(), [cert("EXPIRED", -3)]);
    expect(findItem(r.items, "certificado_a1").status).toBe("blocked");
    expect(r.hasBlocker).toBe(true);
    expect(r.productionAllowed).toBe(false);
  });
});

describe("H5-A · Deep-links canônicos", () => {
  it("todos os deep-links no formato /configuracoes/fiscal/empresa?aba=<aba>[#<id>]", () => {
    const r = computeConnectionsReadiness(baseRow({ webhook_ref: "wh" }), [cert("AVAILABLE", 100)]);
    for (const item of r.items) {
      expect(item.deepLink).toMatch(/^\/configuracoes\/fiscal\/empresa\?aba=[a-z_]+(#[a-z0-9_-]+)?$/);
    }
    expect(findItem(r.items, "certificado_a1").deepLink).toBe(
      "/configuracoes/fiscal/empresa?aba=certificado#certificado-a1",
    );
    expect(findItem(r.items, "webhook").deepLink).toContain("#webhook_ref");
  });
});

describe("H5-A · Produção bloqueada / permitida-somente-em-relatório", () => {
  it("qualquer pendência => productionAllowed=false", () => {
    const r = computeConnectionsReadiness(baseRow(), []);
    expect(r.productionAllowed).toBe(false);
  });
  it("todos requisitos ok => productionAllowed=true (apenas reporta, não ativa)", () => {
    const row = baseRow({
      nfe_provider: "TECNOSPEED", nfe_credential_ref: "cred-1",
      webhook_ref: "wh-x", fiscal_environment: "HOMOLOGATION",
    });
    const r = computeConnectionsReadiness(row, [cert("AVAILABLE", 200)]);
    expect(r.productionAllowed).toBe(true);
    // O flag não implica production_enabled do banco.
    expect(row.production_enabled).toBe(false);
  });
});

describe("H5-A · Segurança: nenhum segredo entra no cálculo/saída", () => {
  it("varredura ampla: token/senha/pfx/fingerprint no row NÃO aparecem no resultado", () => {
    const row = baseRow({
      nfe_credential_ref: "cred-1",
      webhook_ref: "wh-x",
      // Campos hipotéticos que NUNCA deveriam ser considerados:
      // (cast unknown apenas para simular payload contaminado).
      ...({ nfe_credential_secret: "SUPER_SECRET_TOKEN_123" } as unknown as Partial<CompanyFiscalRow>),
    });
    const c = cert("AVAILABLE", 60);
    const contaminated: FiscalCertificateReadinessRow = {
      ...c,
      fingerprint_sha256: "DEADBEEF01234567DEADBEEF01234567",
      ...(({ pfx_blob: "<<PFX>>", pfx_password: "PWD_SEG" }) as unknown as Partial<FiscalCertificateReadinessRow>),
    };
    const r = computeConnectionsReadiness(row, [contaminated]);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/SUPER_SECRET_TOKEN_123/);
    expect(json).not.toMatch(/DEADBEEF/i);
    expect(json).not.toMatch(/PWD_SEG|<<PFX>>/i);
    expect(json).not.toMatch(/pfx_password|pfx_blob|credential_secret/i);
  });

  it("labels pt-BR são estáveis (contrato de UI)", () => {
    expect(CONNECTION_STATUS_LABEL_PTBR.blocked).toBe("Bloqueado");
    expect(CONNECTION_STATUS_LABEL_PTBR.not_applicable).toBe("Não aplicável");
    expect(CONNECTION_STATUS_LABEL_PTBR.filled_untested).toBe("Preenchido — não testado");
    expect(CONNECTION_STATUS_LABEL_PTBR.ready_to_test).toBe("Pronto para testar");
  });
});
