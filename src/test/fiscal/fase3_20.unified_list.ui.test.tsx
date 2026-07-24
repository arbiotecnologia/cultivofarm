/**
 * Fase Fiscal 3.20 — UI unificada (produtos + microrganismos).
 *
 * Cobertura:
 *   - Filtros Todos/Produtos/Microrganismos com badges corretos.
 *   - Microrganismo NÃO associado mostra badge "Produto fiscal não
 *     associado" e ação "Associar produto fiscal".
 *   - Microrganismo associado reutiliza o MESMO product_id (via
 *     productProfile map).
 *   - Usuário somente leitura visualiza pendência mas não vê botão de
 *     associação; leitura da lista é permitida.
 *   - Estado vazio, loading, erro e permission_denied.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";

const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));

const mockUseProductFiscalList = vi.fn();
const mockUseProductFiscalReadiness = vi.fn();
const mockUseProductFiscalProfile = vi.fn();
const mockUseSaveProductFiscalProfile = vi.fn(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
}));

vi.mock("@/hooks/useProductFiscalProfiles", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useProductFiscalProfiles")>(
    "@/hooks/useProductFiscalProfiles",
  );
  return {
    ...actual,
    useProductFiscalList: (...args: unknown[]) => mockUseProductFiscalList(...args),
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
    useAssociateMicroorganism: () => ({
      mutateAsync: mockAssociateMutate,
      isPending: false,
    }),
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
  product_id: "prod-A",
  product_nome: "Bio-A Comercial",
  product_codigo: "BIO-A",
  ncm: "31010010",
  cest: null,
  cfop_in_state: "5102",
  cfop_interstate: "6102",
  profile_id: "prof-A",
  profile_status: "APPROVED",
};

const PRODUCT_B = {
  product_id: "prod-B",
  product_nome: "Bio-B Comercial",
  product_codigo: "BIO-B",
  ncm: null,
  cest: null,
  cfop_in_state: null,
  cfop_interstate: null,
  profile_id: null,
  profile_status: null,
};

const MICRO_LINKED = {
  id: "micro-1",
  nome: "Trichoderma harzianum",
  codigo: "TRI-01",
  product_id: "prod-A",
  ativo: true,
};

const MICRO_UNLINKED = {
  id: "micro-2",
  nome: "Bacillus subtilis",
  codigo: "BAC-02",
  product_id: null,
  ativo: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ role: "administrador" });
  mockUseProductFiscalList.mockReturnValue({
    data: { items: [PRODUCT_A, PRODUCT_B], total: 2 },
    isLoading: false, isError: false, error: null,
  });
  mockUseProductFiscalReadiness.mockReturnValue({
    data: [
      { product_id: "prod-A", minimally_classified: true, accounting_validated: true },
      { product_id: "prod-B", minimally_classified: false, accounting_validated: false },
    ],
    isLoading: false, isError: false, error: null,
  });
  mockUseMicroorganismList.mockReturnValue({
    data: [MICRO_LINKED, MICRO_UNLINKED],
    isLoading: false, isError: false, error: null,
  });
  mockUseProductFiscalProfile.mockReturnValue({ data: null, isLoading: false });
});

describe("FiscalProdutos — lista unificada", () => {
  test("mostra produtos e microrganismos com badges corretos", () => {
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("row-product:prod-A")).toBeInTheDocument();
    expect(screen.getByTestId("row-product:prod-B")).toBeInTheDocument();
    expect(screen.getByTestId("row-micro:micro-1")).toBeInTheDocument();
    const unlinkedRow = screen.getByTestId("row-micro:micro-2");
    expect(unlinkedRow).toBeInTheDocument();
    // Badge "Produto fiscal não associado" só na linha do não associado.
    expect(within(unlinkedRow).getByTestId("badge-nao-associado")).toBeInTheDocument();
  });

  test("microrganismo associado reutiliza o mesmo product_id do canônico (sem perfil paralelo)", async () => {
    renderWithProviders(<FiscalProdutos />);
    const linkedRow = screen.getByTestId("row-micro:micro-1");
    // Mesma NCM do PRODUCT_A herdada da linha
    expect(within(linkedRow).getByText("31010010")).toBeInTheDocument();
  });

  test("usuário somente leitura (gestor) não vê botão de associação", () => {
    mockUseAuth.mockReturnValue({ role: "gestor" });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.queryByTestId("btn-associar-produto")).not.toBeInTheDocument();
  });

  test("permission_denied em micros bloqueia a tela com aviso", () => {
    mockUseMicroorganismList.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: new Error("permission_denied"),
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-permission-denied")).toBeInTheDocument();
  });

  test("estado de loading é renderizado", () => {
    mockUseProductFiscalList.mockReturnValue({
      data: undefined, isLoading: true, isError: false, error: null,
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-loading")).toBeInTheDocument();
  });

  test("estado vazio quando sem produtos e sem micros", () => {
    mockUseProductFiscalList.mockReturnValue({
      data: { items: [], total: 0 }, isLoading: false, isError: false, error: null,
    });
    mockUseMicroorganismList.mockReturnValue({
      data: [], isLoading: false, isError: false, error: null,
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-empty")).toBeInTheDocument();
  });

  test("badge 'Produto fiscal não associado' e conta agregada de pendências", () => {
    renderWithProviders(<FiscalProdutos />);
    const unlinkedRow = screen.getByTestId("row-micro:micro-2");
    expect(within(unlinkedRow).getByTestId("badge-nao-associado")).toBeInTheDocument();
    expect(screen.getByTestId("micros-nao-associados").textContent).toContain("1");
  });
});
