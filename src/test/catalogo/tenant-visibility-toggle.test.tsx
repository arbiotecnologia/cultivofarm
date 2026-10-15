import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mutateAsync = vi.fn();
let pending = false;
let scope: { userId: string; organizationId: string } | null = { userId: "u", organizationId: "o" };
vi.mock("@/hooks/useTenantCatalogVisibility", () => ({
  useTenantCatalogScope: () => scope,
  useSetTenantVisibility: () => ({ mutateAsync, isPending: pending }),
  useTenantVisibilityMap: () => ({}),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: ["gestor"] }) }));

import { TenantVisibilityToggle } from "@/components/protocolos/TenantVisibilityControls";

const ID = "11111111-1111-4111-8111-111111111111";

describe("TenantVisibilityToggle", () => {
  beforeEach(() => { mutateAsync.mockReset(); pending = false; scope = { userId: "u", organizationId: "o" }; });

  it("item inativo oculto não pode ser exibido", () => {
    render(<TenantVisibilityToggle entity="produto" item={{ id: ID, nome: "X", ativo: false }} state={{ hidden: true, version: 1 }} />);
    expect(screen.getByRole("button", { name: /Exibir/ }).matches(":disabled")).toBe(true);
  });
  it("sem escopo de empresa fica desativado", () => {
    scope = null;
    render(<TenantVisibilityToggle entity="produto" item={{ id: ID, nome: "X", ativo: true }} state={undefined} />);
    expect(screen.getByRole("button", { name: /Ocultar/ }).matches(":disabled")).toBe(true);
  });
  it("envia versão atual e exige motivo; ocupado bloqueia", async () => {
    mutateAsync.mockResolvedValue({ hidden: true, version: 1, replayed: false });
    render(<TenantVisibilityToggle entity="produto" item={{ id: ID, nome: "X", ativo: true }} state={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Ocultar/ }));
    const confirm = screen.getByRole("button", { name: "Confirmar" });
    expect(confirm.matches(":disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Não vendemos este" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ entityId: ID, hidden: true, expectedVersion: 0, scopeAtStart: { organizationId: "o", userId: "u" } });
  });
  it("estado ocupado desativa o botão", () => {
    pending = true;
    render(<TenantVisibilityToggle entity="cultura" item={{ id: ID, nome: "Soja", ativo: true }} state={{ hidden: true, version: 2 }} />);
    expect(screen.getByRole("button", { name: /Exibir/ }).matches(":disabled")).toBe(true);
  });
});
