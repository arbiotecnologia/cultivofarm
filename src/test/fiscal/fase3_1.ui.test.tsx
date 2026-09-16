/**
 * Fase Fiscal 3.1 — Testes de UI da tela `FiscalEmpresa`.
 *
 * Estratégia:
 * - Mocks isolados de `useAuth` e do hook de dados.
 * - Cobre os estados: preparação (flag OFF), sem permissão, loading, erro,
 *   vazio, sucesso (admin, gestor RO, financeiro RO).
 * - Não faz I/O real com Supabase.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";

// ————————————————————————————————————————————————
// Mocks
// ————————————————————————————————————————————————
const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockSettings = vi.fn();
const mockMutate = vi.fn();
vi.mock("@/hooks/useFiscalCompanySettings", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/useFiscalCompanySettings")
  >("@/hooks/useFiscalCompanySettings");
  return {
    ...actual,
    useFiscalCompanySettings: () => mockSettings(),
    useUpdateFiscalCompanySettings: () => ({
      mutateAsync: mockMutate,
      isPending: false,
    }),
  };
});

const mockFlags = vi.hoisted(() => ({
  FEATURE_FLAGS: {
    fiscalConfigurationUi: false,
    fiscalEmissionEnabled: false,
  },
}));
vi.mock("@/config/featureFlags", () => ({
  FEATURE_FLAGS: mockFlags.FEATURE_FLAGS,
  isFeatureEnabled: (n: keyof typeof mockFlags.FEATURE_FLAGS) => mockFlags.FEATURE_FLAGS[n],
}));

// —— import AFTER mocks
import FiscalEmpresa from "@/pages/configuracoes/FiscalEmpresa";

const FULL_ROW = {
  id: "singleton-id",
  cnpj: "11222333000181",
  legal_name: "Cultivo Farm LTDA",
  trade_name: "Cultivo Farm",
  fiscal_email: "fiscal@arbio.com",
  phone: null,
  tax_regime: "SIMPLES_NACIONAL",
  crt: "1",
  primary_cnae: "1234567",
  municipal_registration: null,
  state_registration: "ISENTO",
  municipality_ibge_code: "3550308",
  postal_code: "01001-000",
  street: "Rua X",
  number: "10",
  complement: null,
  neighborhood: "Centro",
  city: "São Paulo",
  state: "SP",
  country_code: "BR",
  fiscal_environment: "HOMOLOGATION",
  fiscal_provider: "NONE",
  configuration_status: "DRAFT",
  nfe_enabled: false,
  nfse_enabled: false,
  nfe_series: null,
  nfse_series: null,
  production_enabled: false,
  is_active: true,
  accounting_validated_at: null,
  accounting_validated_by: null,
  created_at: "2026-07-21T00:00:00Z",
  created_by: null,
  updated_at: "2026-07-21T00:00:00Z",
  updated_by: null,
  additional_cnaes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFlags.FEATURE_FLAGS.fiscalConfigurationUi = false;
  mockFlags.FEATURE_FLAGS.fiscalEmissionEnabled = false;
});

// ————————————————————————————————————————————————
// Estado: flag OFF (default) — página exibe "em preparação"
// ————————————————————————————————————————————————
describe("FiscalEmpresa — flag OFF (default)", () => {
  test("admin vê estado de preparação, sem formulário", () => {
    mockUseAuth.mockReturnValue({ role: "administrador" });
    mockSettings.mockReturnValue({ data: null, isLoading: false, error: null, isError: false });
    renderWithProviders(<FiscalEmpresa />);
    expect(screen.getByTestId("fiscal-empresa-preparation")).toBeInTheDocument();
    expect(screen.queryByTestId("fiscal-empresa-save")).not.toBeInTheDocument();
    expect(screen.getByText(/Emissão fiscal desativada/i)).toBeInTheDocument();
  });
});

// ————————————————————————————————————————————————
// Sem permissão (defesa em profundidade)
// ————————————————————————————————————————————————
describe("FiscalEmpresa — sem permissão", () => {
  beforeEach(() => {
    mockFlags.FEATURE_FLAGS.fiscalConfigurationUi = true;
    mockSettings.mockReturnValue({ data: null, isLoading: false, error: null, isError: false });
  });

  for (const role of [
    "consultor_tecnico",
    "aplicador",
    "cliente_produtor",
    "administrativo",
    "tecnico_agronomo",
    "producao",
    "operador_onfarm",
    "gestor_comercial",
    "parceiro_b2b",
  ] as const) {
    test(`${role} vê "Sem permissão" e nenhum botão de salvar`, () => {
      mockUseAuth.mockReturnValue({ role });
      renderWithProviders(<FiscalEmpresa />);
      expect(screen.getByTestId("fiscal-empresa-forbidden")).toBeInTheDocument();
      expect(screen.queryByTestId("fiscal-empresa-save")).not.toBeInTheDocument();
    });
  }

  test("anônimo (null role) é bloqueado", () => {
    mockUseAuth.mockReturnValue({ role: null });
    renderWithProviders(<FiscalEmpresa />);
    expect(screen.getByTestId("fiscal-empresa-forbidden")).toBeInTheDocument();
  });
});

// ————————————————————————————————————————————————
// Estados com flag ON
// ————————————————————————————————————————————————
describe("FiscalEmpresa — flag ON", () => {
  beforeEach(() => {
    mockFlags.FEATURE_FLAGS.fiscalConfigurationUi = true;
  });

  test("loading", () => {
    mockUseAuth.mockReturnValue({ role: "administrador" });
    mockSettings.mockReturnValue({ data: null, isLoading: true, error: null, isError: false });
    renderWithProviders(<FiscalEmpresa />);
    expect(screen.getByTestId("fiscal-empresa-loading")).toBeInTheDocument();
  });

  test("erro genérico", () => {
    mockUseAuth.mockReturnValue({ role: "administrador" });
    mockSettings.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error("db down"),
    });
    renderWithProviders(<FiscalEmpresa />);
    expect(screen.getByTestId("fiscal-empresa-error")).toBeInTheDocument();
  });

  test("permission_denied", () => {
    mockUseAuth.mockReturnValue({ role: "administrador" });
    mockSettings.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: new Error("permission_denied"),
    });
    renderWithProviders(<FiscalEmpresa />);
    expect(screen.getByTestId("fiscal-empresa-permission-denied")).toBeInTheDocument();
  });

  test("vazio quando singleton inexistente", () => {
    mockUseAuth.mockReturnValue({ role: "administrador" });
    mockSettings.mockReturnValue({ data: null, isLoading: false, isError: false, error: null });
    renderWithProviders(<FiscalEmpresa />);
    expect(screen.getByTestId("fiscal-empresa-empty")).toBeInTheDocument();
  });

  test("administrador vê formulário editável e botão Salvar", () => {
    mockUseAuth.mockReturnValue({ role: "administrador" });
    mockSettings.mockReturnValue({
      data: FULL_ROW,
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithProviders(<FiscalEmpresa />);
    const page = screen.getByTestId("fiscal-empresa-page");
    expect(page).toBeInTheDocument();
    expect(within(page).getByTestId("fiscal-empresa-save")).toBeInTheDocument();
    const cnpjInput = within(page).getByLabelText("CNPJ") as HTMLInputElement;
    expect(cnpjInput).not.toBeDisabled();
    // Exibição mascarada; armazenamento continua sendo dígitos crus.
    expect(cnpjInput.value).toBe("11.222.333/0001-81");
    // Banner de emissão desativada sempre visível
    expect(within(page).getByTestId("fiscal-emission-banner")).toBeInTheDocument();
    // Nenhum campo de credencial sensível no formulário base (Fase 3.16.1:
    // certificado é gerido em aba dedicada via Edge Function; senha/PFX
    // nunca são digitados diretamente na tela de configuração).
    expect(within(page).queryByLabelText(/senha/i)).toBeNull();
    expect(within(page).queryByLabelText(/token/i)).toBeNull();
    expect(within(page).queryByLabelText(/private[_-]?key/i)).toBeNull();
  });

  for (const role of ["gestor", "financeiro"] as const) {
    test(`${role} vê formulário DESABILITADO e sem botão Salvar`, () => {
      mockUseAuth.mockReturnValue({ role });
      mockSettings.mockReturnValue({
        data: FULL_ROW,
        isLoading: false,
        isError: false,
        error: null,
      });
      renderWithProviders(<FiscalEmpresa />);
      const page = screen.getByTestId("fiscal-empresa-page");
      expect(within(page).queryByTestId("fiscal-empresa-save")).not.toBeInTheDocument();
      expect(within(page).getByTestId("fiscal-empresa-readonly-note")).toBeInTheDocument();
      const cnpjInput = within(page).getByLabelText("CNPJ") as HTMLInputElement;
      expect(cnpjInput).toBeDisabled();
    });
  }
});
