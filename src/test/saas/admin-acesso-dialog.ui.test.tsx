import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";
import type { ConviteAdminEmpresa, MudancaEmailAdmin } from "@/hooks/usePlataformaSaaS";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

import { AdminAcessoDialog } from "@/components/plataforma/AdminAcessoDialog";

const convite = { id: "invite-1", user_id: "user-1", nome: "Admin", status: "pendente" } as ConviteAdminEmpresa;

describe("Gestão de acesso — recovery não é reenvio de convite", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it.each(["invited", "active", "temporary_password"])("envia password_link com rótulo de senha no estado %s", async (status) => {
    mocks.invoke.mockResolvedValue({ data: { status }, error: null });
    renderWithProviders(<AdminAcessoDialog convite={convite} mudanca={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerenciar acesso" }));
    const dialog = within(screen.getByRole("dialog"));
    const link = await dialog.findByRole("button", { name: "Enviar link para definir/redefinir senha" });
    await waitFor(() => expect(link).toBeEnabled());
    expect(dialog.queryByText(/reenviar convite|novo convite/i)).not.toBeInTheDocument();
    fireEvent.click(link);
    expect(dialog.getByText(/próprio titular definir ou redefinir sua senha/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("checkbox"));
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar envio ou geração" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("platform-invite-org-admin", {
      body: expect.objectContaining({ access_action: "password_link", invite_id: "invite-1", confirm: true }),
    }));
  });

  it("mantém confirmação de e-mail no fluxo pendente, sem enviar recovery", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "active" }, error: null });
    const mudanca = { new_email: "novo@example.test", idempotency_key: "key-1", reason: "" } as MudancaEmailAdmin;
    renderWithProviders(<AdminAcessoDialog convite={convite} mudanca={mudanca} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerenciar acesso" }));
    const dialog = within(screen.getByRole("dialog"));
    const link = await dialog.findByRole("button", { name: "Reenviar confirmação de e-mail" });
    await waitFor(() => expect(link).toBeEnabled());
    expect(dialog.queryByRole("button", { name: "Enviar link para definir/redefinir senha" })).not.toBeInTheDocument();
    fireEvent.click(link);
    fireEvent.click(dialog.getByRole("checkbox"));
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar envio ou geração" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("platform-org-admin-email-change", {
      body: expect.objectContaining({ action: "resend", new_email: mudanca.new_email, idempotency_key: "key-1" }),
    }));
    expect(mocks.invoke.mock.calls.some(([, args]) => args.body.access_action === "password_link")).toBe(false);
  });
});