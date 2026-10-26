import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FiscalServicos from "@/pages/configuracoes/FiscalServicos";

const s = vi.hoisted(() => ({ role: "administrador", write: false, save: vi.fn(), card: vi.fn(), row: { id: "profile", source_reference: "SERV-A" } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: s.role }) }));
vi.mock("@/hooks/useProductFiscalAccess", () => ({ useProductFiscalAccess: () => ({ canWrite: s.write }) }));
vi.mock("@/config/featureFlags", () => ({ FEATURE_FLAGS: { fiscalServiceProfilesUi: true, fiscalEmissionEnabled: false } }));
vi.mock("@/components/fiscal/IbsCbsItemCard", () => ({ IbsCbsItemCard: (props: unknown) => { s.card(props); return null; } }));
vi.mock("@/hooks/useServiceFiscalProfiles", async () => ({
  ...(await vi.importActual<object>("@/hooks/useServiceFiscalProfiles")),
  useServiceFiscalList: () => ({ data: { items: [{ id: "profile", source_reference: "SERV-A", is_active: true }], total: 1 }, isLoading: false }),
  useServiceFiscalReadiness: () => ({ data: [] }),
  useServiceFiscalProfile: () => ({ data: s.row, isLoading: false }),
  useSaveServiceFiscalProfile: () => ({ mutateAsync: s.save, isPending: false }),
}));

beforeEach(() => { s.role = "administrador"; s.write = false; vi.clearAllMocks(); });
describe("serviço global — página real com leitores simulados", () => {
  for (const role of ["administrador", "financeiro", "gestor"]) it(`${role} apenas consulta e não recebe editor IBS/CBS`, () => {
    s.role = role;
    render(<FiscalServicos />);
    expect(screen.queryByRole("button", { name: "Novo perfil fiscal de serviço" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver perfil fiscal SERV-A" }));
    expect(screen.queryByRole("button", { name: /^Salvar$/ })).toBeNull();
    expect(s.card).toHaveBeenLastCalledWith({ kind: "service_profile", itemId: "profile", canEdit: false });
    expect(s.save).not.toHaveBeenCalled();
  });
  it("Superadmin sem fence válido não abre escrita", () => {
    s.role = "superadmin"; render(<FiscalServicos />);
    expect(screen.queryByRole("button", { name: "Novo perfil fiscal de serviço" })).toBeNull();
  });
  it("retirada da autoridade em tela aberta remove confirmação de escrita", () => {
    s.role = "superadmin"; s.write = true;
    const h = render(<FiscalServicos />);
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil fiscal SERV-A" }));
    expect(screen.getByRole("button", { name: /^Salvar$/ })).toBeInTheDocument();
    s.role = "financeiro"; s.write = false; h.rerender(<FiscalServicos />);
    expect(screen.queryByRole("button", { name: /^Salvar$/ })).toBeNull();
    expect(s.card).toHaveBeenLastCalledWith({ kind: "service_profile", itemId: "profile", canEdit: false });
    expect(s.save).not.toHaveBeenCalled();
  });
});