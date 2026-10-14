/**
 * Fase Fiscal 3.21 — UI unificada (produtos + microrganismos com perfil próprio).
 *
 * Novo contrato:
 *   - Microrganismo tem PERFIL FISCAL PRÓPRIO (`microorganism_fiscal_profiles`)
 *     e pode ser faturado direto, sem depender de produto.
 *   - Vínculo `microrganismos.product_id` é apenas comercial/opcional.
 *   - Colunas fiscais do micro vêm do próprio perfil, NUNCA do produto vinculado.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";

const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));

const mockUseProductFiscalList = vi.fn();
const mockUseProductFiscalListByIds = vi.fn();
const mockUseProductFiscalReadiness = vi.fn();
const mockUseProductFiscalProfile = vi.fn();
const mockUseSaveProductFiscalProfile = vi.fn(() => ({
  mutateAsync: vi.fn(), isPending: false,
}));

vi.mock("@/hooks/useProductFiscalProfiles", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useProductFiscalProfiles")>(
    "@/hooks/useProductFiscalProfiles",
  );
  return {
    ...actual,
    useProductFiscalList: (...args: unknown[]) => mockUseProductFiscalList(...args),
    useProductFiscalListByIds: (...args: unknown[]) => mockUseProductFiscalListByIds(...args),
    useProductFiscalReadiness: (...args: unknown[]) => mockUseProductFiscalReadiness(...args),
    useProductFiscalProfile: (...args: unknown[]) => mockUseProductFiscalProfile(...args),
    useSaveProductFiscalProfile: () => mockUseSaveProductFiscalProfile(),
  };
});

const mockUseMicroorganismList = vi.fn();
const mockAssociateMutate = vi.fn();
vi.mock("@/hooks/useMicroorganismFiscalAssociation", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMicroorganismFiscalAssociation")>(
    "@/hooks/useMicroorganismFiscalAssociation",
  );
  return {
    ...actual,
    useMicroorganismList: (...args: unknown[]) => mockUseMicroorganismList(...args),
    useAssociateMicroorganism: () => ({ mutateAsync: mockAssociateMutate, isPending: false }),
  };
});

const mockUseMicroorganismFiscalProfile = vi.fn();
const mockUseMicroorganismFiscalProfileList = vi.fn();
const mockUseMicroorganismFiscalReadiness = vi.fn();
const mockUseSaveMicroorganismFiscalProfile = vi.fn(() => ({
  mutateAsync: vi.fn(), isPending: false,
}));
vi.mock("@/hooks/useMicroorganismFiscalProfiles", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMicroorganismFiscalProfiles")>(
    "@/hooks/useMicroorganismFiscalProfiles",
  );
  return {
    ...actual,
    useMicroorganismFiscalProfile: (...args: unknown[]) => mockUseMicroorganismFiscalProfile(...args),
    useMicroorganismFiscalProfileList: (...args: unknown[]) => mockUseMicroorganismFiscalProfileList(...args),
    useMicroorganismFiscalReadiness: (...args: unknown[]) => mockUseMicroorganismFiscalReadiness(...args),
    useSaveMicroorganismFiscalProfile: () => mockUseSaveMicroorganismFiscalProfile(),
  };
});

const mockFlags = vi.hoisted(() => ({
  FEATURE_FLAGS: {
    fiscalProductProfilesUi: true,
    fiscalEmissionEnabled: false,
  } as Record<string, boolean>,
}));
vi.mock("@/config/featureFlags", () => ({
  FEATURE_FLAGS: mockFlags.FEATURE_FLAGS,
  isFeatureEnabled: (n: string) => mockFlags.FEATURE_FLAGS[n],
}));

vi.mock("@/components/fiscal/IbsCbsItemCard", () => ({
  IbsCbsItemCard: () => null,
}));

import FiscalProdutos from "@/pages/configuracoes/FiscalProdutos";

const PRODUCT_A = {
  product_id: "prod-A", product_nome: "Bio-A Comercial", product_codigo: "BIO-A",
  ncm: "31010010", cest: null, cfop_in_state: "5102", cfop_interstate: "6102",
  profile_id: "prof-A", profile_status: "APPROVED",
};

const MICRO_WITH_OWN = {
  id: "micro-1", nome: "Trichoderma harzianum", codigo: "TRI-01",
  product_id: "prod-A", ativo: true,
};
const MICRO_WITHOUT_OWN = {
  id: "micro-2", nome: "Bacillus subtilis", codigo: "BAC-02",
  product_id: null, ativo: true,
};

const MICRO_OWN_PROFILE = {
  id: "mprof-1", microorganism_id: "micro-1",
  ncm: "30021029", cest: null, cfop_in_state: "5101", cfop_interstate: "6101",
  profile_status: "VALIDATED", updated_at: "2026-08-06T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ role: "administrador" });
  mockUseProductFiscalList.mockReturnValue({
    data: { items: [PRODUCT_A], total: 1 },
    isLoading: false, isError: false, error: null,
  });
  mockUseProductFiscalListByIds.mockReturnValue({
    data: [], isLoading: false, isError: false, error: null,
  });
  mockUseProductFiscalReadiness.mockReturnValue({
    data: [{ product_id: "prod-A", minimally_classified: true, accounting_validated: true }],
    isLoading: false, isError: false, error: null,
  });
  mockUseMicroorganismList.mockReturnValue({
    data: [MICRO_WITH_OWN, MICRO_WITHOUT_OWN],
    isLoading: false, isError: false, error: null,
  });
  mockUseMicroorganismFiscalProfileList.mockReturnValue({
    data: [MICRO_OWN_PROFILE],
    isLoading: false, isError: false, error: null,
  });
  mockUseMicroorganismFiscalReadiness.mockReturnValue({
    data: [{ microorganism_id: "micro-1", profile_status: "VALIDATED", minimally_classified: true, accounting_validated: false }],
    isLoading: false, isError: false, error: null,
  });
});

describe("FiscalProdutos — perfil fiscal próprio de microrganismos (Fase 3.21)", () => {
  test("microrganismo com perfil próprio exibe NCM/CFOP do próprio perfil, NÃO do produto vinculado", () => {
    renderWithProviders(<FiscalProdutos />);
    const row = screen.getByTestId("row-micro:micro-1");
    // NCM do PRÓPRIO perfil (30021029), não do produto vinculado (31010010).
    expect(within(row).getByText("30021029")).toBeInTheDocument();
    expect(within(row).queryByText("31010010")).not.toBeInTheDocument();
    // Vínculo comercial opcional é sinalizado como badge, sem bloquear nada.
    expect(within(row).getByTestId("badge-vinculo-opcional")).toBeInTheDocument();
    // Não existe mais badge de "produto fiscal não associado".
    expect(within(row).queryByTestId("badge-nao-associado")).not.toBeInTheDocument();
  });

  test("microrganismo SEM perfil próprio mostra 'Perfil fiscal pendente' e ação Criar perfil fiscal", () => {
    renderWithProviders(<FiscalProdutos />);
    const row = screen.getByTestId("row-micro:micro-2");
    expect(within(row).getByTestId("badge-perfil-fiscal-pendente")).toBeInTheDocument();
    const btn = within(row).getByTestId("btn-editar-perfil-micro");
    expect(btn).toHaveTextContent(/Criar perfil fiscal/i);
    // Vínculo opcional continua disponível, sem ser condição para o perfil.
    expect(within(row).queryByTestId("btn-vinculo-opcional")).not.toBeInTheDocument();
  });

  test("usuário somente leitura vê apenas botão 'Ver', sem ação de criar/vincular", () => {
    mockUseAuth.mockReturnValue({ role: "gestor" });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.queryByTestId("btn-editar-perfil-micro")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-vinculo-opcional")).not.toBeInTheDocument();
  });

  test("permission_denied em qualquer fonte (produto, micro, readiness, perfil próprio) bloqueia a tela", () => {
    mockUseMicroorganismFiscalProfileList.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: new Error("permission_denied"),
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-permission-denied")).toBeInTheDocument();
  });

  test("estado de loading cobre carregamento de perfis e prontidão de microrganismos", () => {
    mockUseMicroorganismFiscalProfileList.mockReturnValue({
      data: undefined, isLoading: true, isError: false, error: null,
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-loading")).toBeInTheDocument();
  });

  test("estado vazio quando não há produtos nem microrganismos", () => {
    mockUseProductFiscalList.mockReturnValue({
      data: { items: [], total: 0 }, isLoading: false, isError: false, error: null,
    });
    mockUseMicroorganismList.mockReturnValue({
      data: [], isLoading: false, isError: false, error: null,
    });
    mockUseMicroorganismFiscalProfileList.mockReturnValue({
      data: [], isLoading: false, isError: false, error: null,
    });
    mockUseMicroorganismFiscalReadiness.mockReturnValue({
      data: [], isLoading: false, isError: false, error: null,
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-empty")).toBeInTheDocument();
  });

  test("contadores agregados de perfil próprio", () => {
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("micros-com-perfil-proprio").textContent).toContain("1");
    expect(screen.getByTestId("micros-sem-perfil-proprio").textContent).toContain("1");
  });

  test("estado de erro genérico é acionado por falha em qualquer fonte", () => {
    mockUseMicroorganismFiscalReadiness.mockReturnValue({
      data: undefined, isLoading: false, isError: true, error: new Error("network_down"),
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-error")).toBeInTheDocument();
  });
});
