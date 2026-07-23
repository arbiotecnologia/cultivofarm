/**
 * Fase H4-A3 — Fechamento corretivo local.
 *
 * Cobre os pontos exigidos:
 *  1) Certificado A1 ausente => banner "pendente" (não bloqueia demais).
 *  2) Link canônico aponta para `?aba=certificado#certificado-a1`.
 *  3) Hash com percent-encoding inválido => fallback silencioso (não lança).
 *  4) Hash fora da allow-list => fallback silencioso (sem foco em alvo alheio).
 *  5) IE sem indicador canônico => severidade "recomendado" (não bloqueante).
 *  6) Varredura de segredos permanece limpa em estado "none".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import CertificadoValidadeBanner from "@/components/fiscal/certificados/CertificadoValidadeBanner";
import { computeCompanyMissingFields } from "@/lib/fiscal/companyMissingFields";
import type { CompanyFiscalRow } from "@/hooks/useFiscalCompanySettings";
import { useFiscalFieldFocus } from "@/lib/fiscal/useFiscalFieldFocus";

const mockUseFiscalCertificates = vi.fn();
vi.mock("@/hooks/useFiscalCertificates", () => ({
  useFiscalCertificates: (id: string | null) => mockUseFiscalCertificates(id),
}));

beforeEach(() => {
  mockUseFiscalCertificates.mockReset();
  document.body.innerHTML = "";
});

describe("H4-A3 · Certificado A1 pendente (Central de Homologação)", () => {
  it("sem certificado + showAllStates => renderiza pendente sem bloquear", () => {
    mockUseFiscalCertificates.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(
      <MemoryRouter>
        <CertificadoValidadeBanner companySettingsId="cs-1" showAllStates />
      </MemoryRouter>,
    );
    const banner = screen.getByTestId("fiscal-cert-validity-banner");
    expect(banner).toHaveAttribute("data-status", "none");
    expect(banner).toHaveTextContent(/pendente/i);
  });

  it("link canônico aponta para ?aba=certificado#certificado-a1", () => {
    mockUseFiscalCertificates.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(
      <MemoryRouter>
        <CertificadoValidadeBanner companySettingsId="cs-1" showAllStates />
      </MemoryRouter>,
    );
    const action = screen.getByTestId("fiscal-cert-validity-action");
    expect(action.getAttribute("href")).toContain("?aba=certificado#certificado-a1");
    expect(action.getAttribute("href")).not.toContain("#certificados-registrados");
  });

  it("varredura de segredos: estado 'none' não vaza nada sensível", () => {
    mockUseFiscalCertificates.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { container } = render(
      <MemoryRouter>
        <CertificadoValidadeBanner companySettingsId="cs-1" showAllStates />
      </MemoryRouter>,
    );
    const t = container.textContent ?? "";
    expect(t).not.toMatch(/pfx|senha|password|s3:\/\/|fingerprint/i);
  });
});

describe("H4-A3 · IE sem indicador canônico é recomendado", () => {
  function baseRow(): CompanyFiscalRow {
    return {
      id: "cs-1",
      company_id: null,
      legal_name: "ACME",
      trade_name: null, cnpj: "11.222.333/0001-81", state: "SP",
      municipality_ibge_code: "3550308", environment: "sandbox",
      state_registration: null, municipal_registration: null,
      nfe_enabled: true, nfse_enabled: false,
      nfe_configuration: { series: "1", suggested_cfop_in_state: "5102", suggested_cfop_interstate: "6102" },
      nfse_configuration: null,
    } as unknown as CompanyFiscalRow;
  }
  it("state_registration vazio => severity 'recomendado' (não bloqueante)", () => {
    const r = computeCompanyMissingFields(baseRow());
    const ie = r.bySection.nfe.find((f) => f.key === "state_registration");
    expect(ie).toBeDefined();
    expect(ie?.severity).toBe("recomendado");
    // `blocking` é a contagem de itens bloqueantes; nenhum deles é IE.
    const allBloqueia = [
      ...r.bySection.empresa, ...r.bySection.endereco,
      ...r.bySection.nfe, ...r.bySection.nfse,
    ].filter((f) => f.severity === "bloqueia_homologacao");
    expect(allBloqueia.some((f) => f.key === "state_registration")).toBe(false);
  });
});

describe("H4-A3 · Hash defensivo (percent-encoding inválido e allow-list)", () => {
  function Harness({ tab }: { tab: string }) {
    const [searchParams, setSearchParams] = useSearchParams();
    useFiscalFieldFocus({ tab, ready: true, searchParams, setSearchParams });
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("percent-encoding inválido (`#%E0%A4`) NÃO lança e cai em fallback silencioso", () => {
    window.history.replaceState(null, "", "/x?aba=empresa#%E0%A4");
    expect(() => {
      render(
        <MemoryRouter initialEntries={["/x?aba=empresa"]}>
          <Harness tab="empresa" />
        </MemoryRouter>,
      );
      act(() => { vi.advanceTimersByTime(120); });
    }).not.toThrow();
    // Fallback silencioso: query preservada, sem alteração de valores.
    expect(window.location.search).toBe("?aba=empresa");
  });

  it("hash fora da allow-list não foca nenhum alvo (fallback seguro)", () => {
    const outsider = document.createElement("input");
    outsider.id = "campo_arbitrario";
    outsider.scrollIntoView = vi.fn();
    document.body.appendChild(outsider);

    window.history.replaceState(null, "", "/x?aba=empresa#campo_arbitrario");
    render(
      <MemoryRouter initialEntries={["/x?aba=empresa"]}>
        <Harness tab="empresa" />
      </MemoryRouter>,
    );
    act(() => { vi.advanceTimersByTime(120); });
    expect(document.activeElement).not.toBe(outsider);
  });

  it("link legado apenas com ?campo= continua funcionando", () => {
    const input = document.createElement("input");
    input.id = "fiscal_email";
    input.scrollIntoView = vi.fn();
    document.body.appendChild(input);
    render(
      <MemoryRouter initialEntries={["/x?aba=empresa&campo=fiscal_email"]}>
        <Harness tab="empresa" />
      </MemoryRouter>,
    );
    act(() => { vi.advanceTimersByTime(120); });
    expect(document.activeElement).toBe(input);
  });
});
