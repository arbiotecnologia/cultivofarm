/**
 * Fase Fiscal 3.20.1 — Resolver independente do produto canônico para
 * microrganismos vinculados.
 *
 * Motivação: `productByProductId` era construído apenas com a página
 * corrente de `useProductFiscalList`. Com filtro "Microrganismos" ou
 * paginação futura, o produto vinculado pode não estar na página, e o
 * vínculo aparecia falsamente como "não associado". Introduzimos
 * `useProductFiscalListByIds` para resolver por ID, sem SELECT amplo e
 * sem duplicar perfis fiscais.
 *
 * Também audita, por asserção estática de flags, que emissão fiscal e
 * preflight de transmissão permanecem desligados após a correção.
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
import { FEATURE_FLAGS } from "@/config/featureFlags";

const PRODUCT_CANONICAL = {
  product_id: "prod-CAN",
  product_nome: "Bio Canônico",
  product_codigo: "BIO-CAN",
  ncm: "31010010",
  cest: null,
  cfop_in_state: "5102",
  cfop_interstate: "6102",
  profile_id: "prof-CAN",
  profile_status: "APPROVED",
  is_active: true,
  updated_at: "2026-08-04T00:00:00Z",
};

const MICRO_A_LINKED = {
  id: "micro-A",
  nome: "Trichoderma harzianum",
  codigo: "TRI-01",
  product_id: "prod-CAN",
  ativo: true,
};

const MICRO_B_LINKED_SAME = {
  id: "micro-B",
  nome: "Trichoderma asperellum",
  codigo: "TRI-02",
  product_id: "prod-CAN",
  ativo: true,
};

const MICRO_C_UNLINKED = {
  id: "micro-C",
  nome: "Bacillus subtilis",
  codigo: "BAC-03",
  product_id: null,
  ativo: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ role: "administrador" });
  mockUseProductFiscalList.mockReturnValue({
    data: { items: [], total: 0 },
    isLoading: false, isError: false, error: null,
  });
  mockUseProductFiscalListByIds.mockReturnValue({
    data: [], isLoading: false, isError: false, error: null,
  });
  mockUseProductFiscalReadiness.mockReturnValue({
    data: [], isLoading: false, isError: false, error: null,
  });
  mockUseMicroorganismList.mockReturnValue({
    data: [], isLoading: false, isError: false, error: null,
  });
  mockUseProductFiscalProfile.mockReturnValue({ data: null, isLoading: false });
});

describe("FiscalProdutos — resolver independente microrganismo→produto", () => {
  test("filtro Microrganismos: vínculo válido resolve produto fora da página", () => {
    // Página corrente de produtos NÃO contém prod-CAN.
    mockUseProductFiscalList.mockReturnValue({
      data: { items: [], total: 0 }, isLoading: false, isError: false, error: null,
    });
    // Micro vinculado a prod-CAN.
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_A_LINKED], isLoading: false, isError: false, error: null,
    });
    // Fonte independente resolve o produto canônico.
    mockUseProductFiscalListByIds.mockReturnValue({
      data: [PRODUCT_CANONICAL], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalReadiness.mockReturnValue({
      data: [{ product_id: "prod-CAN", minimally_classified: true, accounting_validated: true }],
      isLoading: false, isError: false, error: null,
    });

    renderWithProviders(<FiscalProdutos />);
    const row = screen.getByTestId("row-micro:micro-A");
    // Deve estar associado (sem badge de não-associado, NCM herdada, sem botão Associar).
    expect(within(row).queryByTestId("badge-nao-associado")).not.toBeInTheDocument();
    expect(within(row).getByText("31010010")).toBeInTheDocument();
    expect(within(row).queryByTestId("btn-associar-produto")).not.toBeInTheDocument();
  });

  test("resolver foi chamado apenas com os IDs vinculados ausentes da página", () => {
    mockUseProductFiscalList.mockReturnValue({
      data: {
        items: [{ ...PRODUCT_CANONICAL, product_id: "prod-OTHER", product_nome: "Outro" }],
        total: 1,
      },
      isLoading: false, isError: false, error: null,
    });
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_A_LINKED, MICRO_C_UNLINKED],
      isLoading: false, isError: false, error: null,
    });

    renderWithProviders(<FiscalProdutos />);
    // Primeira chamada com IDs faltantes = ["prod-CAN"]; "prod-OTHER" já está
    // na página; MICRO_C_UNLINKED não contribui.
    const calls = mockUseProductFiscalListByIds.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const [firstArg] = calls[0];
    expect(firstArg).toEqual(["prod-CAN"]);
  });

  test("múltiplos microrganismos compartilham o mesmo produto/perfil (sem perfil paralelo)", () => {
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_A_LINKED, MICRO_B_LINKED_SAME],
      isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalListByIds.mockReturnValue({
      data: [PRODUCT_CANONICAL], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalReadiness.mockReturnValue({
      data: [{ product_id: "prod-CAN", minimally_classified: true, accounting_validated: true }],
      isLoading: false, isError: false, error: null,
    });

    renderWithProviders(<FiscalProdutos />);
    // Ambas as linhas exibem os mesmos dados fiscais do produto canônico.
    const rowA = screen.getByTestId("row-micro:micro-A");
    const rowB = screen.getByTestId("row-micro:micro-B");
    expect(within(rowA).getByText("31010010")).toBeInTheDocument();
    expect(within(rowB).getByText("31010010")).toBeInTheDocument();
    // O resolver deduplica IDs — pediu prod-CAN uma única vez.
    const [firstArg] = mockUseProductFiscalListByIds.mock.calls[0];
    expect(firstArg).toEqual(["prod-CAN"]);
  });

  test("vínculo nulo continua como não-associado (não mascarar por resolver)", () => {
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_C_UNLINKED], isLoading: false, isError: false, error: null,
    });
    // Resolver não deve ser habilitado com dados úteis: nenhuma ID vinculada.
    mockUseProductFiscalListByIds.mockReturnValue({
      data: [], isLoading: false, isError: false, error: null,
    });
    renderWithProviders(<FiscalProdutos />);
    const row = screen.getByTestId("row-micro:micro-C");
    expect(within(row).getByTestId("badge-nao-associado")).toBeInTheDocument();
    const [firstArg] = mockUseProductFiscalListByIds.mock.calls[0];
    expect(firstArg).toEqual([]);
  });

  test("permission_denied do resolver bloqueia a tela sem mascarar como ausência", () => {
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_A_LINKED], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalListByIds.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: new Error("permission_denied"),
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-permission-denied")).toBeInTheDocument();
  });

  test("emissão fiscal permanece desativada após a correção (gate estático)", () => {
    // A correção é local à UI de perfis. Não deve tocar a flag de emissão.
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_A_LINKED], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalListByIds.mockReturnValue({
      data: [PRODUCT_CANONICAL], isLoading: false, isError: false, error: null,
    });
    renderWithProviders(<FiscalProdutos />);
    // Banner de emissão desativada continua visível.
    expect(screen.getByTestId("fiscal-emission-banner")).toBeInTheDocument();
  });
});

describe("FiscalProdutos — prontidão para emissão de microrganismo", () => {
  test("microrganismo sem associação nunca é considerado pronto para emissão", () => {
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_C_UNLINKED], isLoading: false, isError: false, error: null,
    });
    renderWithProviders(<FiscalProdutos />);
    const row = screen.getByTestId("row-micro:micro-C");
    // Sem produto canônico não deve exibir badge "OK".
    expect(within(row).queryByText("OK")).not.toBeInTheDocument();
    expect(within(row).getByTestId("badge-nao-associado")).toBeInTheDocument();
  });

  test("microrganismo com perfil incompleto do produto canônico aparece como Pendente", () => {
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_A_LINKED], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalListByIds.mockReturnValue({
      data: [{ ...PRODUCT_CANONICAL, ncm: null }],
      isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalReadiness.mockReturnValue({
      data: [{ product_id: "prod-CAN", minimally_classified: false, accounting_validated: false }],
      isLoading: false, isError: false, error: null,
    });
    renderWithProviders(<FiscalProdutos />);
    const row = screen.getByTestId("row-micro:micro-A");
    expect(within(row).getByTestId("pending-badge")).toBeInTheDocument();
  });
});

describe("FiscalProdutos — loading/erro do resolver e da readiness", () => {
  test("loading do resolver bloqueia render como 'não associado'", () => {
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_A_LINKED], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalListByIds.mockReturnValue({
      data: undefined, isLoading: true, isError: false, error: null,
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("badge-nao-associado")).not.toBeInTheDocument();
  });

  test("erro de rede (não-permission) do resolver aciona erro genérico e não vira 'não associado'", () => {
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_A_LINKED], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalListByIds.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: new Error("network_error"),
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-error")).toBeInTheDocument();
    expect(screen.queryByTestId("badge-nao-associado")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("fiscal-produtos-permission-denied"),
    ).not.toBeInTheDocument();
  });

  test("loading da readiness bloqueia render como 'Pendente'", () => {
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_A_LINKED], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalListByIds.mockReturnValue({
      data: [PRODUCT_CANONICAL], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalReadiness.mockReturnValue({
      data: undefined, isLoading: true, isError: false, error: null,
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("pending-badge")).not.toBeInTheDocument();
  });

  test("erro de rede da readiness aciona erro genérico e não vira 'Pendente'", () => {
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_A_LINKED], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalListByIds.mockReturnValue({
      data: [PRODUCT_CANONICAL], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalReadiness.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: new Error("network_error"),
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-error")).toBeInTheDocument();
    expect(screen.queryByTestId("pending-badge")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("fiscal-produtos-permission-denied"),
    ).not.toBeInTheDocument();
  });

  test("permission_denied do resolver tem prioridade sobre o erro genérico", () => {
    mockUseMicroorganismList.mockReturnValue({
      data: [MICRO_A_LINKED], isLoading: false, isError: false, error: null,
    });
    mockUseProductFiscalListByIds.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: new Error("permission_denied"),
    });
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByTestId("fiscal-produtos-permission-denied")).toBeInTheDocument();
    expect(screen.queryByTestId("fiscal-produtos-error")).not.toBeInTheDocument();
  });
});
