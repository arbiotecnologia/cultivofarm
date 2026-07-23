/**
 * Fase H4-A1 — Testes do banner de validade do certificado A1.
 *
 * Verificam:
 * - Renderização correta por estado (expirado/atenção/desconhecido).
 * - Ausência de renderização para válido/sem certificado.
 * - Nenhum segredo (pfx, senha, storage path, fingerprint completo) na saída.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CertificadoValidadeBanner from "@/components/fiscal/certificados/CertificadoValidadeBanner";

const mockUseFiscalCertificates = vi.fn();
vi.mock("@/hooks/useFiscalCertificates", () => ({
  useFiscalCertificates: (id: string | null) => mockUseFiscalCertificates(id),
}));

function withResult(data: unknown, extras: Partial<{ isLoading: boolean; isError: boolean }> = {}) {
  mockUseFiscalCertificates.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    ...extras,
  });
}

function renderBanner(companySettingsId: string | null = "cs-1") {
  return render(
    <MemoryRouter>
      <CertificadoValidadeBanner companySettingsId={companySettingsId} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseFiscalCertificates.mockReset();
});

describe("CertificadoValidadeBanner", () => {
  it("sem companySettingsId => não renderiza", () => {
    withResult([]);
    const { container } = renderBanner(null);
    expect(container.firstChild).toBeNull();
  });

  it("carregando => não renderiza (silencioso)", () => {
    withResult(undefined, { isLoading: true });
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it("erro no hook => não renderiza (silencioso)", () => {
    withResult(undefined, { isError: true });
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it("nenhum certificado ativo => não renderiza", () => {
    withResult([]);
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it("certificado válido (>30 dias) => não renderiza", () => {
    withResult([{
      is_active: true, revoked_at: null, status: "AVAILABLE",
      days_until_expiration: 120, display_name: "A1 Empresa",
    }]);
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it("<=30 dias => banner de atenção com dias restantes e nome", () => {
    withResult([{
      is_active: true, revoked_at: null, status: "AVAILABLE",
      days_until_expiration: 12, display_name: "Certificado Fiscal Ltda",
    }]);
    renderBanner();
    const banner = screen.getByTestId("fiscal-cert-validity-banner");
    expect(banner).toHaveAttribute("data-status", "expiring_soon");
    expect(banner).toHaveTextContent(/próximo do vencimento/i);
    expect(banner).toHaveTextContent(/12 dia/);
    expect(banner).toHaveTextContent(/Certificado Fiscal Ltda/);
    expect(screen.getByTestId("fiscal-cert-validity-action")).toBeInTheDocument();
  });

  it("expirado => banner destrutivo, marca bloqueio de homologação", () => {
    withResult([{
      is_active: true, revoked_at: null, status: "EXPIRED",
      days_until_expiration: -3, display_name: "A1 Vencido",
    }]);
    renderBanner();
    const banner = screen.getByTestId("fiscal-cert-validity-banner");
    expect(banner).toHaveAttribute("data-status", "expired");
    expect(banner).toHaveTextContent(/expirado.*homologação bloqueada/i);
    expect(banner).toHaveTextContent(/expirado há 3 dia/);
  });

  it("validade desconhecida => banner de 'não verificado'", () => {
    withResult([{
      is_active: true, revoked_at: null, status: "AVAILABLE",
      days_until_expiration: null, display_name: "A1 Sem data",
    }]);
    renderBanner();
    const banner = screen.getByTestId("fiscal-cert-validity-banner");
    expect(banner).toHaveAttribute("data-status", "unknown");
    expect(banner).toHaveTextContent(/não verificada/i);
  });

  it("nenhum segredo (pfx/senha/storage/fingerprint) é renderizado", () => {
    withResult([{
      is_active: true, revoked_at: null, status: "AVAILABLE",
      days_until_expiration: 5, display_name: "A1 Empresa",
      // Metadados sensíveis simulados: não devem aparecer no banner.
      fingerprint_sha256: "AABBCCDDEEFF00112233445566778899AABBCCDDEEFF00112233445566778899",
      valid_until: "2030-01-01T00:00:00Z",
      pfx_blob: "<<PFX_BINARY>>",
      pfx_password: "SEGREDO_SUPER",
      object_path: "s3://bucket/keys/company/cert.pfx",
    }]);
    const { container } = renderBanner();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/PFX_BINARY/);
    expect(text).not.toMatch(/SEGREDO_SUPER/i);
    expect(text).not.toMatch(/pfx_password/i);
    expect(text).not.toMatch(/object_path|s3:\/\//i);
    expect(text).not.toMatch(/AABBCCDDEEFF/); // fingerprint bruto
  });
});
