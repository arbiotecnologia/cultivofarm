import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";
const m = vi.hoisted(() => ({ role: "administrador", write: false, regulatory: vi.fn(), microList: vi.fn(), microProfiles: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: m.role }) }));
vi.mock("@/hooks/useProductFiscalAccess", () => ({ useProductFiscalAccess: () => ({ ready: true, canWrite: m.write, scope: "A/T", capture: () => () => true }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ ready: true, scope: "A/T", capture: () => () => true }) }));
vi.mock("@/components/fiscal/IbsCbsItemCard", () => ({ IbsCbsItemCard: () => null }));
vi.mock("@/components/fiscal/RegulatorioMicrorganismosSecao", () => ({ RegulatorioMicrorganismosSecao: () => { m.regulatory(); return <div data-testid="regulatorio-micro" />; } }));
const q = (data: unknown) => ({ data, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() });
vi.mock("@/hooks/useProductFiscalProfiles", async () => ({ ...(await vi.importActual<object>("@/hooks/useProductFiscalProfiles")),
  useProductFiscalList: () => q({ items: [{ product_id: "prod-A", product_nome: "INS-4", product_codigo: "INS-4", profile_id: null, profile_status: null }], total: 1 }),
  useProductFiscalListByIds: () => q([]), useProductFiscalReadiness: () => q([]), useProductFiscalProfile: () => q(null),
  useSaveProductFiscalProfile: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/useMicroorganismFiscalAssociation", async () => ({ ...(await vi.importActual<object>("@/hooks/useMicroorganismFiscalAssociation")),
  useMicroorganismList: (_s: unknown, o: { enabled: boolean }) => { m.microList(o.enabled); return q(o.enabled ? [{ id: "micro-1", nome: "Trichoderma", codigo: "TRI", product_id: null, ativo: true }] : []); },
  useAssociateMicroorganism: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/useMicroorganismFiscalProfiles", async () => ({ ...(await vi.importActual<object>("@/hooks/useMicroorganismFiscalProfiles")),
  useMicroorganismFiscalProfile: () => q(null), useMicroorganismFiscalProfileList: (_i: unknown, o: { enabled: boolean }) => { m.microProfiles(o.enabled); return q([]); },
  useMicroorganismFiscalReadiness: () => q([]), useSaveMicroorganismFiscalProfile: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/config/featureFlags", () => ({ FEATURE_FLAGS: { fiscalProductProfilesUi: true, fiscalEmissionEnabled: false }, isFeatureEnabled: () => true }));
import FiscalProdutos from "@/pages/configuracoes/FiscalProdutos";
import { getAccessLevel } from "@/lib/permissions";
beforeEach(() => { vi.clearAllMocks(); m.write = false; });
describe("product (global) vs micro (canonical) edit split", () => {
  test.each(["administrador", "financeiro"])("%s: route stays rw for micro; product read-only; micro editable", (role) => {
    m.role = role; expect(getAccessLevel(role as never, "/configuracoes/fiscal/produtos")).toBe("rw");
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByRole("button", { name: "Ver perfil fiscal de INS-4" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar perfil fiscal de INS-4" })).toBeNull();
    expect(screen.getByTestId("btn-editar-perfil-micro")).toBeInTheDocument();
    expect(screen.getByTestId("regulatorio-micro")).toBeInTheDocument();
  });
  test("gestor: everything read-only", () => {
    m.role = "gestor"; expect(getAccessLevel("gestor" as never, "/configuracoes/fiscal/produtos")).toBe("r");
    renderWithProviders(<FiscalProdutos />);
    expect(screen.getByRole("button", { name: "Ver perfil fiscal de INS-4" })).toBeInTheDocument();
    expect(screen.queryByTestId("btn-editar-perfil-micro")).toBeNull();
  });
  test("internal role with stray product write capability still cannot edit product outside platform", () => {
    m.role = "administrador"; m.write = true; renderWithProviders(<FiscalProdutos />);
    expect(screen.queryByRole("button", { name: "Editar perfil fiscal de INS-4" })).toBeNull();
  });
  test("Superadmin platform tab: products only, no micro/regulatory flows mounted or started", () => {
    m.role = "superadmin"; m.write = true; renderWithProviders(<FiscalProdutos platformGlobal />);
    expect(screen.getByRole("button", { name: /perfil fiscal de INS-4/ }).getAttribute("aria-label")).toBe("Editar perfil fiscal de INS-4");
    expect(screen.queryByTestId("regulatorio-micro")).toBeNull(); expect(m.regulatory).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox", { name: "Filtrar por tipo de item" })).toBeNull();
    expect(screen.queryByTestId("btn-editar-perfil-micro")).toBeNull();
    expect(m.microList.mock.calls.every(([e]) => e === false)).toBe(true);
    expect(m.microProfiles.mock.calls.every(([e]) => e === false)).toBe(true);
  });
});
