import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  refetch: vi.fn(),
  convites: [] as Array<Record<string, unknown>>,
  isPending: false,
}));

vi.mock("@/hooks/usePlataformaSaaS", () => ({
  useOrganizacoesSaaS: () => ({ data: [{ id: "org-1", nome: "Empresa Controlada" }] }),
  useConvitesAdminEmpresa: () => ({
    data: mocks.convites,
    isLoading: false,
    isError: false,
    refetch: mocks.refetch,
  }),
  useConvidarAdminEmpresa: () => ({ mutate: mocks.mutate, isPending: mocks.isPending }),
}));

import PlataformaAdmins from "@/pages/plataforma/PlataformaAdmins";

const base = {
  id: "invite-1",
  organization_id: "org-1",
  user_id: "user-1",
  email: "admin@empresa.com.br",
  nome: "Administrador Controlado",
  cpf_cnpj: "12345678901",
  telefone: "11999999999",
  modo_acesso: "link",
  responsavel_principal: true,
  status: "pendente",
  attempt_count: 1,
  last_error_code: null,
  email_delivery_status: "accepted",
  email_last_error_code: null,
  updated_at: "2026-10-03T20:00:00Z",
  created_at: "2026-10-03T19:00:00Z",
};

describe("D51.2 — reenvio persistente na lista de administradores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPending = false;
    mocks.convites = [{ ...base }];
  });

  it("mostra reenvio para pendente por link e envia o mesmo registro após confirmação", async () => {
    mocks.mutate.mockImplementation((_payload, options) => options.onSuccess({ email_status: "accepted" }));
    renderWithProviders(<PlataformaAdmins />);

    fireEvent.click(screen.getByRole("button", { name: "Reenviar convite" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Reenviar convite de acesso?");
    expect(dialog).toHaveTextContent("Nenhuma nova conta será criada.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reenviar convite" }));

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      nome: "Administrador Controlado",
      email: "admin@empresa.com.br",
      confirmAmbiguousEmailRetry: false,
    }), expect.any(Object));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1));
  });

  it.each([
    ["ativo", "link"],
    ["pendente", "senha_temporaria"],
  ])("não mostra reenvio para status %s no modo %s", (status, modo_acesso) => {
    mocks.convites = [{ ...base, status, modo_acesso }];
    renderWithProviders(<PlataformaAdmins />);
    expect(screen.queryByRole("button", { name: /reenviar convite/i })).not.toBeInTheDocument();
  });

  it("mantém tentativa direta para falha normal", () => {
    mocks.convites = [{ ...base, status: "falhou", email_delivery_status: "failed" }];
    renderWithProviders(<PlataformaAdmins />);
    expect(screen.getByRole("button", { name: "Tentar convite novamente" })).toBeEnabled();
  });

  it("mantém confirmação especial e flag verdadeira para envio ambíguo", () => {
    mocks.mutate.mockImplementation(() => undefined);
    mocks.convites = [{ ...base, email_delivery_status: "ambiguous" }];
    renderWithProviders(<PlataformaAdmins />);
    fireEvent.click(screen.getByRole("button", { name: "Não recebi — reenviar convite" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("O reenvio pode gerar uma segunda mensagem");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e reenviar" }));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ confirmAmbiguousEmailRetry: true }), expect.any(Object));
  });

  it("impede duplo clique síncrono na confirmação", () => {
    mocks.mutate.mockImplementation(() => undefined);
    renderWithProviders(<PlataformaAdmins />);
    fireEvent.click(screen.getByRole("button", { name: "Reenviar convite" }));
    const confirmar = within(screen.getByRole("alertdialog")).getByRole("button", { name: "Reenviar convite" });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });
});