import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";
import type { ConviteAdminEmpresa, MudancaEmailAdmin } from "@/hooks/usePlataformaSaaS";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), email: vi.fn(), invite: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/hooks/usePlataformaSaaS", () => ({
  useEditarAdminEmpresa: () => ({ mutate: vi.fn(), isPending: false }),
  useAlterarEmailAdmin: () => ({ mutate: mocks.email, isPending: false }),
  useDefinirResponsavelPrincipal: () => ({ mutate: vi.fn(), isPending: false }),
  mensagemErroPlataforma: () => "erro",
  mascararEmail: () => "ad***@example.test",
}));
import { AdminGestaoAcoes } from "@/components/plataforma/AdminGestaoAcoes";

const convite = { id: "invite-1", user_id: "user-1", organization_id: "org-1", nome: "Admin", email: "admin@example.test", status: "pendente", modo_acesso: "link" } as ConviteAdminEmpresa;
const mutation = { mutate: mocks.invite, isPending: false };
function renderDialog(mudanca: MudancaEmailAdmin | null = null) {
  renderWithProviders(<AdminGestaoAcoes convite={convite} empresaNome="Empresa" responsavelAtualId={null} mudancaPendente={mudanca} convidar={mutation as Parameters<typeof AdminGestaoAcoes>[0]["convidar"]} />);
}
async function openAccess() {
  await userEvent.click(screen.getByRole("button", { name: "Gerenciar administrador" }));
  await userEvent.click(screen.getByRole("tab", { name: "Acesso" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Atualizar estado" })).toBeEnabled());
  return within(screen.getByRole("dialog"));
}

describe("Gestão única de acesso — recovery não é convite", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it.each(["invited", "active", "temporary_password"])("envia password_link com rótulo de senha no estado %s", async (status) => {
    mocks.invoke.mockResolvedValue({ data: { status }, error: null });
    renderDialog();
    const dialog = await openAccess();
    fireEvent.click(dialog.getByRole("button", { name: "Enviar link para definir/redefinir senha" }));
    expect(dialog.getByText(/próprio titular definir ou redefinir sua senha/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("checkbox"));
    const confirm = dialog.getByRole("button", { name: "Confirmar envio ou geração" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("platform-invite-org-admin", { body: expect.objectContaining({ access_action: "password_link", invite_id: "invite-1", confirm: true }) }));
    expect(mocks.invoke.mock.calls.filter(([, args]) => args.body.access_action === "password_link")).toHaveLength(1);
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it("centraliza confirmação pendente em E-mail, sem envio duplicado em Acesso", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "active" }, error: null });
    const mudanca = { new_email: "novo@example.test", idempotency_key: "key-1", reason: "" } as MudancaEmailAdmin;
    renderDialog(mudanca);
    const dialog = await openAccess();
    expect(dialog.getByRole("button", { name: "Enviar link para definir/redefinir senha" })).toBeDisabled();
    expect(dialog.queryByRole("button", { name: /Reenviar confirmação/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "E-mail" }));
    fireEvent.click(dialog.getByLabelText("Confirmo a alteração"));
    fireEvent.click(dialog.getByRole("button", { name: "Reenviar confirmação" }));
    expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({ action: "resend", newEmail: mudanca.new_email, idempotencyKey: "key-1" }), expect.any(Object));
    expect(mocks.invoke.mock.calls.some(([, args]) => args.body.access_action === "password_link")).toBe(false);
  });
  it("exibe provisória uma vez e apaga ao ocultar, trocar seção ou fechar", async () => {
    const secret = "senha-ficticia-unitaria";
    mocks.invoke.mockImplementation(async (_name, { body }) => ({ data: body.access_action === "state" ? { status: "active" } : { senha_temporaria: secret }, error: null }));
    renderDialog();
    const dialog = await openAccess();
    fireEvent.click(dialog.getByRole("button", { name: "Gerar senha provisória" }));
    expect(dialog.getByText(/expira em 24 horas/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("checkbox"));
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar envio ou geração" }));
    await dialog.findByText(secret);
    fireEvent.click(dialog.getByRole("button", { name: "Ocultar definitivamente" }));
    expect(dialog.queryByText(secret)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Dados" }));
    await userEvent.click(screen.getByRole("tab", { name: "Acesso" }));
    expect(dialog.queryByText(secret)).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await openAccess();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  });
  it("replay não reexibe senha provisória", async () => {
    mocks.invoke.mockImplementation(async (_name, { body }) => ({ data: body.access_action === "state" ? { status: "active" } : { idempotent: true, senha_temporaria: null }, error: null }));
    renderDialog(); const dialog = await openAccess();
    fireEvent.click(dialog.getByRole("button", { name: "Gerar senha provisória" }));
    fireEvent.click(dialog.getByRole("checkbox"));
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar envio ou geração" }));
    await dialog.findByText(/Nenhuma senha será exibida novamente/);
    expect(dialog.queryByRole("button", { name: "Copiar senha" })).not.toBeInTheDocument();
  });
  it.each(["cooldown", "suspended", "failed"])("bloqueia mutações sem estado seguro: %s", async (kind) => {
    mocks.invoke.mockResolvedValue(kind === "failed" ? { error: new Error("falha") } : { data: { status: kind === "suspended" ? "suspended" : "active", next_attempt_at: kind === "cooldown" ? new Date(Date.now() + 300000).toISOString() : undefined }, error: null });
    renderDialog(); const dialog = await openAccess();
    expect(dialog.getByRole("button", { name: "Gerar senha provisória" })).toBeDisabled();
    expect(dialog.getByRole("button", { name: "Enviar link para definir/redefinir senha" })).toBeDisabled();
    expect(dialog.getByRole("button", { name: "Reenviar convite" })).toBeDisabled();
  });
});
