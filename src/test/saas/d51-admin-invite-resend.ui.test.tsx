import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  mutate: vi.fn(),
  reset: vi.fn(),
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
  useConvidarAdminEmpresa: () => ({ mutate: mocks.mutate, reset: mocks.reset, isPending: mocks.isPending }),
  useMudancasEmailAdmin: () => ({ data: [] }),
  useEditarAdminEmpresa: () => ({ mutate: vi.fn(), isPending: false }),
  useAlterarEmailAdmin: () => ({ mutate: vi.fn(), isPending: false }),
  useDefinirResponsavelPrincipal: () => ({ mutate: vi.fn(), isPending: false }),
  mensagemErroPlataforma: () => "erro",
  mascararEmail: (e: string) => e,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

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

async function openAccess() {
  await userEvent.click(screen.getByRole("button", { name: "Gerenciar administrador" }));
  await userEvent.click(screen.getByRole("tab", { name: "Acesso" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Atualizar estado" })).toBeEnabled());
  return within(screen.getByRole("dialog"));
}

describe("D51.2 — reenvio no gerenciamento único", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.isPending = false; mocks.convites = [{ ...base }];
    mocks.invoke.mockResolvedValue({ data: { status: "invited" }, error: null });
  });
  it("reenvia o mesmo registro após confirmação dentro de Acesso", async () => {
    mocks.mutate.mockImplementation((_payload, options) => { options.onSuccess({ email_status: "accepted" }); options.onSettled(); });
    renderWithProviders(<PlataformaAdmins />);
    expect(screen.queryByRole("button", { name: "Reenviar convite" })).not.toBeInTheDocument();
    const dialog = await openAccess();
    fireEvent.click(dialog.getByRole("button", { name: "Reenviar convite" }));
    expect(dialog.getByText(/Nenhuma nova conta será criada/)).toBeInTheDocument();
    const confirmar = dialog.getByRole("button", { name: "Confirmar reenvio do convite" });
    expect(confirmar).toBeDisabled();
    fireEvent.click(dialog.getByRole("checkbox")); fireEvent.click(confirmar);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", nome: "Administrador Controlado", email: "admin@empresa.com.br", confirmAmbiguousEmailRetry: false }), expect.any(Object));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it.each([["ativo", "link"], ["pendente", "senha_temporaria"]])("não oferece reenvio para %s/%s", async (status, modo_acesso) => {
    mocks.convites = [{ ...base, status, modo_acesso }];
    renderWithProviders(<PlataformaAdmins />); const dialog = await openAccess();
    expect(dialog.queryByRole("button", { name: "Reenviar convite" })).not.toBeInTheDocument();
  });
  it("permite tentativa de convite falho pelo mesmo caminho", async () => {
    mocks.convites = [{ ...base, status: "falhou", email_delivery_status: "failed" }];
    renderWithProviders(<PlataformaAdmins />); const dialog = await openAccess();
    expect(dialog.getByRole("button", { name: "Reenviar convite" })).toBeEnabled();
  });
  it("envio ambíguo exige confirmação humana e envia flag verdadeira", async () => {
    mocks.mutate.mockImplementation(() => undefined);
    mocks.convites = [{ ...base, email_delivery_status: "ambiguous" }];
    renderWithProviders(<PlataformaAdmins />); const dialog = await openAccess();
    fireEvent.click(dialog.getByRole("button", { name: "Reenviar convite" }));
    expect(dialog.getByText(/O reenvio pode gerar uma segunda mensagem/)).toBeInTheDocument();
    const confirmar = dialog.getByRole("button", { name: "Confirmar reenvio do convite" });
    expect(confirmar).toBeDisabled();
    fireEvent.click(dialog.getByRole("checkbox")); fireEvent.click(confirmar);
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ confirmAmbiguousEmailRetry: true }), expect.any(Object));
  });
  it("impede duplo clique e bloqueia troca de seção/fechamento durante envio", async () => {
    mocks.mutate.mockImplementation(() => undefined);
    renderWithProviders(<PlataformaAdmins />); const dialog = await openAccess();
    fireEvent.click(dialog.getByRole("button", { name: "Reenviar convite" }));
    fireEvent.click(dialog.getByRole("checkbox"));
    const confirmar = dialog.getByRole("button", { name: "Confirmar reenvio do convite" });
    fireEvent.click(confirmar); fireEvent.click(confirmar);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(dialog.getByRole("tab", { name: "Dados" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("sem link manual ao operador e sem caminho de acesso separado", async () => {
    renderWithProviders(<PlataformaAdmins />); const dialog = await openAccess();
    expect(dialog.queryByRole("button", { name: "Gerar link" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerenciar acesso" })).not.toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Enviar link para definir/redefinir senha" })).toBeEnabled();
  });
});
