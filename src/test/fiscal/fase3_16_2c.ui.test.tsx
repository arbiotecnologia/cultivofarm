/**
 * Fase Fiscal 3.16.2-C — UI test do `CertificadoDigitalSecao`.
 *
 * Cobre:
 *   - Seção visível para leitura mesmo sem `canManageCertificates`;
 *   - Ausência de ações de escrita (upload, registrar, revogar) no modo RO;
 *   - Fingerprint sempre mascarado (formato "abcd…wxyz");
 *   - Botão "Atualizar detecção" e mensagem
 *     "Conector do sistema operacional não instalado" quando o bridge está
 *     ausente.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";

// Mock do bridge nativo: sempre indisponível neste ambiente.
vi.mock("@/lib/fiscal/certificateOsAdapter", () => ({
  probeOsBridge: vi.fn().mockResolvedValue({ available: false }),
  listOsCertificatesSafe: vi.fn().mockResolvedValue([]),
}));

const mockList = vi.fn();
vi.mock("@/hooks/useFiscalCertificates", () => ({
  useFiscalCertificates: () => mockList(),
  useRevokeFiscalCertificate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useRegisterOsCertificate", () => ({
  useRegisterOsCertificate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// UploadCertificadoA1 real usa Supabase; substituímos por stub inerte.
vi.mock("@/components/fiscal/certificados/UploadCertificadoA1", () => ({
  default: () => <div data-testid="mock-upload-a1">upload-a1</div>,
}));

import CertificadoDigitalSecao from "@/components/fiscal/certificados/CertificadoDigitalSecao";

const FP = "abcd1234567890ef1122334455667788aabbccddeeff00112233445566778899";

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockReturnValue({
    isLoading: false,
    isError: false,
    error: null,
    data: [
      {
        certificate_id: "cert-1",
        display_name: "Certificado Homologação",
        subject_name: "CN=Cultivo Farm LTDA",
        source_type: "A1_UPLOAD",
        environment: "HOMOLOGATION",
        status: "AVAILABLE",
        fingerprint_sha256: FP,
        valid_from: "2026-01-01T00:00:00Z",
        valid_until: "2027-01-01T00:00:00Z",
        days_until_expiration: 120,
        is_active: true,
      },
    ],
    refetch: vi.fn(),
  });
});

describe("CertificadoDigitalSecao — modo somente leitura", () => {
  test("exibe a seção mesmo sem canManageCertificates", () => {
    renderWithProviders(
      <CertificadoDigitalSecao companySettingsId="cs-1" canManageCertificates={false} />,
    );
    expect(screen.getByTestId("fiscal-certificado-secao")).toBeInTheDocument();
    expect(screen.getByTestId("fiscal-cert-readonly")).toBeInTheDocument();
  });

  test("não renderiza botões de escrita (revogar / upload / registrar)", () => {
    renderWithProviders(
      <CertificadoDigitalSecao companySettingsId="cs-1" canManageCertificates={false} />,
    );
    expect(screen.queryByRole("button", { name: /revogar/i })).toBeNull();
    expect(screen.queryByTestId("mock-upload-a1")).toBeNull();
    expect(screen.queryByRole("button", { name: /registrar no cofre/i })).toBeNull();
  });

  test("fingerprint é sempre mascarado, nunca renderizado integralmente", () => {
    renderWithProviders(
      <CertificadoDigitalSecao companySettingsId="cs-1" canManageCertificates={false} />,
    );
    const cell = screen.getByTestId("fiscal-cert-fp");
    expect(cell.textContent).toBe("abcd…8899");
    // Nenhum nó do DOM contém o fingerprint completo.
    expect(document.body.textContent ?? "").not.toContain(FP);
  });
});

describe("CertificadoDigitalSecao — bridge do SO ausente", () => {
  test("botão renomeado e mensagem exata quando bridge não instalado", async () => {
    renderWithProviders(
      <CertificadoDigitalSecao companySettingsId="cs-1" canManageCertificates={true} />,
    );
    // Botão pt-BR
    expect(await screen.findByRole("button", { name: /atualizar detecção/i })).toBeInTheDocument();
    // Mensagem pt-BR
    expect(await screen.findByTestId("fiscal-os-bridge-missing")).toBeInTheDocument();
    expect(screen.getByText(/Conector do sistema operacional não instalado/i)).toBeInTheDocument();
  });
});
