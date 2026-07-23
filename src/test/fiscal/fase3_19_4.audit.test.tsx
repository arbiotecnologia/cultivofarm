/**
 * Fase Fiscal 3.19.4 — Testes cirúrgicos.
 *
 * Cobre:
 *  1) O hook `useFiscalHomologationReadiness` consome a RPC v2 e faz
 *     fallback correto para a canônica.
 *  2) O parser da readiness mantém contrato completo e propaga
 *     `rtc_configured` quando emitido pela v2.
 *  3) `RtcCompanyCard` expõe effective_from, last_reviewed_at,
 *     feedback de sucesso e botão Recarregar.
 *  4) `IbsCbsItemCard` expõe todas as seções e rótulos humanos exigidos,
 *     campos NFS-e condicionais e limpeza de dependentes.
 *  5) Zod rejeita `vAjusteBC` inválido e `vAjusteBC` sem toggle.
 *  6) Nenhum `as any` restou nos artefatos RTC.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { RtcCompanyCard } from "@/components/fiscal/RtcCompanyCard";
import { IbsCbsItemCard } from "@/components/fiscal/IbsCbsItemCard";
import {
  ibsCbsItemSchema,
  validateNfseInAdditionalFields,
  setNfseField,
  getNfseField,
} from "@/lib/fiscal/rtcConfiguration";
import { parseReadinessResult } from "@/lib/fiscal/homologationReadiness";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

// —————————————— Mocks de hook (controlado por teste) ——————————————
vi.mock("@/hooks/useFiscalRtc", () => {
  const noop = () => Promise.resolve({ ok: false as const });
  const state = { data: null, revision: "", loading: false, error: null, saving: false };
  return {
    useFiscalRtcCompany: () => ({ ...state, reload: () => Promise.resolve(), save: noop }),
    useFiscalRtcItem: () => ({ ...state, reload: () => Promise.resolve(), save: noop }),
  };
});

describe("Fase 3.19.4 — Hook consome RPC v2 com fallback", () => {
  const hookSrc = read("src/hooks/useFiscalHomologationReadiness.ts");

  test("chama rpc_fiscal_homologation_readiness_v2 primeiro", () => {
    expect(hookSrc).toMatch(/READINESS_RPC_PRIMARY\s*=\s*["']rpc_fiscal_homologation_readiness_v2["']/);
    expect(hookSrc).toMatch(/READINESS_RPC_FALLBACK\s*=\s*["']rpc_fiscal_homologation_readiness["']/);
  });

  test("fallback para RPC canônica quando v2 indisponível (PGRST202)", () => {
    expect(hookSrc).toMatch(/PGRST202/);
    expect(hookSrc).toMatch(/isMissingRpc/);
  });

  test("mantém tratamento de indisponibilidade quando nem v2 nem canônica existem", () => {
    expect(hookSrc).toMatch(/unavailable/);
  });
});

describe("Fase 3.19.4 — Parser preserva contrato e propaga rtc_configured", () => {
  test("parser aceita item rtc_configured no checklist da v2", () => {
    const result = parseReadinessResult({
      status: "INCOMPLETE",
      generated_at: "2026-07-27T00:00:00Z",
      environment_label: "HML",
      production_enabled: false,
      checklist: [
        { key: "company", label: "Empresa", status: "READY" },
        { key: "rtc_configured", label: "RTC 2026 configurado", status: "NOT_CONFIGURED" },
      ],
      counts: {
        drafts_total: 0, drafts_ready: 0, drafts_incomplete: 0, drafts_blocked: 0,
        products_ready: 1, services_ready: 0, customers_ready: 0,
      },
    });
    if ("unavailable" in result) throw new Error("esperado resultado válido");
    expect(result.environment_label).toBe("HML");
    expect(result.production_enabled).toBe(false);
    expect(result.counts.products_ready).toBe(1);
    const keys = result.checklist.map((c) => c.key);
    expect(keys).toContain("rtc_configured");
    expect(keys).toContain("company");
  });
});

describe("Fase 3.19.4 — RtcCompanyCard expõe campos novos", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  afterEach(() => { document.body.innerHTML = ""; });

  test("renderiza effective_from, last_reviewed_at, recarregar e save", () => {
    render(<RtcCompanyCard canEdit={true} />);
    expect(screen.getByLabelText(/Vigência inicial/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Última revisão/i)).toBeInTheDocument();
    expect(screen.getByTestId("rtc-company-reload")).toBeInTheDocument();
    expect(screen.getByTestId("rtc-company-save")).toBeInTheDocument();
  });
});

describe("Fase 3.19.4 — IbsCbsItemCard: seções, rótulos, NFS-e condicional", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  afterEach(() => { document.body.innerHTML = ""; });

  test("exibe seções esperadas em serviço (inclui NFS-e)", () => {
    render(<IbsCbsItemCard kind="service" itemId="svc-1" canEdit={true} />);
    for (const t of [
      "ibs-cbs-section-codes",
      "ibs-cbs-section-source",
      "ibs-cbs-section-credit",
      "ibs-cbs-section-reducao",
      "ibs-cbs-section-diferimento",
      "ibs-cbs-section-monofasia",
      "ibs-cbs-section-nfse",
    ]) {
      expect(screen.getByTestId(t)).toBeInTheDocument();
    }
    // Sem catálogo automático — labels humanos com código técnico como ajuda.
    expect(screen.getByLabelText(/Finalidade da NFS-e/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tipo de débito/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tipo de crédito/i)).toBeInTheDocument();
  });

  test("vAjusteBC só aparece quando gIBSCBSAjuste está ativo", () => {
    render(<IbsCbsItemCard kind="service" itemId="svc-1" canEdit={true} />);
    // Desativado por padrão: vAjusteBC não aparece.
    expect(screen.queryByLabelText(/Valor de ajuste da base/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Grupo de ajuste IBS\/CBS/i));
    expect(screen.getByLabelText(/Valor de ajuste da base/i)).toBeInTheDocument();
  });

  test("produto NÃO exibe seção NFS-e", () => {
    render(<IbsCbsItemCard kind="product" itemId="p-1" canEdit={true} />);
    expect(screen.queryByTestId("ibs-cbs-section-nfse")).not.toBeInTheDocument();
  });
});

describe("Fase 3.19.4 — Regras condicionais no schema", () => {
  test("setNfseField(gIBSCBSAjuste, false) limpa vAjusteBC", () => {
    let cfg: import("@/lib/fiscal/rtcConfiguration").IbsCbsItemConfiguration =
      { schema_version: 1 };
    cfg = setNfseField(cfg, "gIBSCBSAjuste", true);
    cfg = setNfseField(cfg, "vAjusteBC", 12.5);
    expect(getNfseField(cfg, "vAjusteBC")).toBe(12.5);
    cfg = setNfseField(cfg, "gIBSCBSAjuste", false);
    expect(getNfseField(cfg, "vAjusteBC")).toBeUndefined();
  });


  test("validateNfseInAdditionalFields rejeita vAjusteBC negativo", () => {
    const r = validateNfseInAdditionalFields({ gIBSCBSAjuste: true, vAjusteBC: -1 });
    expect(r).not.toBeNull();
    expect(r?.code).toBe("FISCAL_RTC_NFSE_INVALID_VALUE");
    expect(r?.field).toBe("vAjusteBC");
  });

  test("validateNfseInAdditionalFields rejeita vAjusteBC sem toggle", () => {
    const r = validateNfseInAdditionalFields({ vAjusteBC: 10 });
    expect(r?.code).toBe("FISCAL_RTC_NFSE_VALUE_WITHOUT_TOGGLE");
  });

  test("validateNfseInAdditionalFields rejeita finNFSe não-string", () => {
    const r = validateNfseInAdditionalFields({ finNFSe: 123 as unknown as string });
    expect(r?.code).toBe("FISCAL_RTC_NFSE_INVALID_CODE");
  });

  test("ibsCbsItemSchema propaga a rejeição via superRefine", () => {
    const parsed = ibsCbsItemSchema.safeParse({
      schema_version: 1,
      additional_fields: { vAjusteBC: 5 }, // sem toggle
    });
    expect(parsed.success).toBe(false);
  });

  test("ibsCbsItemSchema aceita configuração NFS-e válida", () => {
    const parsed = ibsCbsItemSchema.safeParse({
      schema_version: 1,
      additional_fields: {
        finNFSe: "1",
        tpNFSeDebito: "0",
        tpNFSeCredito: "0",
        gIBSCBSAjuste: true,
        vAjusteBC: 0,
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("Fase 3.19.4 — Higiene: sem `as any` nos artefatos RTC", () => {
  const paths = [
    "src/hooks/useFiscalHomologationReadiness.ts",
    "src/hooks/useFiscalRtc.ts",
    "src/components/fiscal/RtcCompanyCard.tsx",
    "src/components/fiscal/IbsCbsItemCard.tsx",
    "src/lib/fiscal/rtcConfiguration.ts",
  ];
  test.each(paths)("%s não contém `as any`", (p) => {
    const src = read(p);
    // Remove comentários de linha, de bloco e conteúdo em template literals
    // que descrevem a proibição — foco só em código executável.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/`[^`]*`/g, "");
    expect(stripped).not.toMatch(/\bas\s+any\b/);
  });

});
