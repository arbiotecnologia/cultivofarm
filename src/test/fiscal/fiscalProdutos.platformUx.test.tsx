import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";
const m = vi.hoisted(() => ({ role: "administrador", write: false, regulatory: vi.fn(), microList: vi.fn(), microProfiles: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: m.role, roles: [m.role], profile: { organization_id: "tenant-test" } }) }));
vi.mock("@/hooks/useProductFiscalAccess", () => ({ useProductFiscalAccess: () => ({ ready: true, canWrite: m.write, scope: "A/T", capture: () => () => true }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ ready: true, scope: "A/T", capture: () => () => true }) }));
vi.mock("@/hooks/useScopedPortalQuery", () => ({ useScopedPortalQuery: () => ({ data: undefined, ready: false, isError: false }) }));
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
  test("Superadmin platform tab: products AND global micros listed; micro read-only; no regulatory flow", () => {
    m.role = "superadmin"; m.write = true; renderWithProviders(<FiscalProdutos platformGlobal />);
    // catálogo exclusivo por empresa: sem writer global de Superadmin para ficha fiscal de produto
    expect(screen.getByRole("button", { name: /perfil fiscal de INS-4/ }).getAttribute("aria-label")).toBe("Ver perfil fiscal de INS-4");
    expect(screen.queryByTestId("regulatorio-micro")).toBeNull(); expect(m.regulatory).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Filtrar por tipo de item" })).toBeInTheDocument();
    expect(screen.getByTestId("row-micro:micro-1")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-editar-perfil-micro")).toBeNull();
    expect(m.microList.mock.calls.some(([e]) => e === true)).toBe(true);
    expect(m.microProfiles.mock.calls.some(([e]) => e === true)).toBe(true);
  });
  test("Superadmin platform UX: global copy/counters include micros, no internal view names", () => {
    m.role = "superadmin"; m.write = true; renderWithProviders(<FiscalProdutos platformGlobal />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Perfis fiscais de produtos globais");
    expect(screen.getByTestId("fiscal-platform-summary")).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/v_product_fiscal_readiness|v_microorganism/);
    expect(screen.getByTestId("platform-micros-listados").textContent).toBe("1");
    expect(screen.getByTestId("badge-familia").textContent).toBe("Família pendente");
  });
  test("tenant mode keeps existing micro summary", () => {
    m.role = "administrador"; renderWithProviders(<FiscalProdutos />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Perfis Fiscais de Produtos e Microrganismos");
    expect(screen.getByTestId("micros-sem-perfil-proprio")).toBeInTheDocument();
    expect(screen.queryByTestId("fiscal-platform-summary")).toBeNull();
  });
});
