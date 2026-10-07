import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";

const m = vi.hoisted(() => ({
  editar: vi.fn(), email: vi.fn(), definir: vi.fn(),
  convites: [] as Array<Record<string, unknown>>,
  mudancas: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/hooks/usePlataformaSaaS", () => ({
  useOrganizacoesSaaS: () => ({ data: [{ id: "org-1", nome: "Empresa X", responsavel_user_id: "u-a" }] }),
  useConvitesAdminEmpresa: () => ({ data: m.convites, isLoading: false, isError: false, refetch: vi.fn() }),
  useConvidarAdminEmpresa: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
  useMudancasEmailAdmin: () => ({ data: m.mudancas }),
  useEditarAdminEmpresa: () => ({ mutate: m.editar, isPending: false }),
  useAlterarEmailAdmin: () => ({ mutate: m.email, isPending: false }),
  useDefinirResponsavelPrincipal: () => ({ mutate: m.definir, isPending: false }),
  mensagemErroPlataforma: () => "erro",
  mascararEmail: (e: string) => `${e.slice(0, 2)}***@${e.split("@")[1]}`,
}));

import PlataformaAdmins from "@/pages/plataforma/PlataformaAdmins";

const base = {
  organization_id: "org-1", modo_acesso: "link", responsavel_principal: false, attempt_count: 1,
  last_error_code: null, email_delivery_status: "accepted", email_last_error_code: null,
  cpf_cnpj: null, telefone: null, updated_at: "2026-10-07T00:00:00Z", created_at: "2026-10-07T00:00:00Z",
};
const A = { ...base, id: "i-a", user_id: "u-a", nome: "Admin A", email: "aa@x.com.br", status: "ativo", responsavel_principal: true };
const B = { ...base, id: "i-b", user_id: "u-b", nome: "Admin B", email: "bb@x.com.br", status: "ativo", cpf_cnpj: "52998224725" };
const P = { ...base, id: "i-p", user_id: "u-p", nome: "Admin P", email: "pp@x.com.br", status: "pendente" };

async function abrirMenu(nome: string) {
  await userEvent.click(within(screen.getByText(nome).closest("tr") as HTMLElement).getByRole("button", { name: "Gerenciar administrador" }));
}

describe("Gestão de administradores provisionados", () => {
  beforeEach(() => { vi.clearAllMocks(); m.convites = [A, B, P]; m.mudancas = []; });

  it("tem apenas um botão por linha e um diálogo com quatro seções", async () => {
    renderWithProviders(<PlataformaAdmins />);
    for (const nome of ["Admin A", "Admin B", "Admin P"]) {
      const row = screen.getByText(nome).closest("tr");
      expect(row).not.toBeNull();
      expect(within(row as HTMLElement).getAllByRole("button")).toHaveLength(1);
    }
    expect(screen.queryByRole("button", { name: "Gerenciar acesso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reenviar convite" })).not.toBeInTheDocument();
    await abrirMenu("Admin B");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    const d = within(screen.getByRole("dialog"));
    expect(d.getByText(/Admin B · Empresa X/)).toHaveTextContent("bb***@x.com.br");
    for (const name of ["Dados", "Responsabilidade", "E-mail", "Acesso"]) expect(d.getByRole("tab", { name })).toBeInTheDocument();
  });

  it("mostra badges reais e e-mail mascarado", () => {
    m.mudancas = [{ id: "c1", invite_id: "i-b", status: "failed", new_email: "novo@x.com.br", idempotency_key: "k", reason: "rr", last_error_code: "sync_failed" }];
    renderWithProviders(<PlataformaAdmins />);
    expect(screen.getAllByText("Responsável principal")).toHaveLength(1);
    expect(screen.getByText("Mudança de e-mail pendente")).toBeInTheDocument();
    expect(screen.getByText("Convite pendente")).toBeInTheDocument();
    expect(screen.queryByText("bb@x.com.br")).not.toBeInTheDocument();
  });

  it("define responsável principal com motivo e responsável esperado, sem duplo envio", async () => {
    renderWithProviders(<PlataformaAdmins />);
    await abrirMenu("Admin B");
    await userEvent.click(screen.getByRole("tab", { name: "Responsabilidade" }));
    const d = screen.getByRole("dialog");
    const confirmar = within(d).getByRole("button", { name: "Confirmar" });
    const motivo = within(d).getByLabelText("Motivo (opcional)");
    expect(motivo).not.toBeRequired();
    expect(confirmar).toBeEnabled();
    fireEvent.change(motivo, { target: { value: " x " } });
    expect(confirmar).toBeDisabled();
    expect(within(d).getByText(/ao menos 2 caracteres/)).toBeInTheDocument();
    fireEvent.change(motivo, { target: { value: "Troca" } });
    fireEvent.click(confirmar); fireEvent.click(confirmar);
    expect(m.definir).toHaveBeenCalledTimes(1);
    expect(m.definir).toHaveBeenCalledWith({ organizationId: "org-1", userId: "u-b", motivo: "Troca", expectedResponsavel: "u-a" }, expect.any(Object));
  });

  it("define responsável principal sem motivo (vazio enviado)", async () => {
    renderWithProviders(<PlataformaAdmins />);
    await abrirMenu("Admin B");
    await userEvent.click(screen.getByRole("tab", { name: "Responsabilidade" }));
    const d = screen.getByRole("dialog");
    fireEvent.click(within(d).getByRole("button", { name: "Confirmar" }));
    expect(m.definir).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-b", motivo: "" }), expect.any(Object));
  });

  it("não oferece transferência para o atual responsável nem para convite pendente", async () => {
    renderWithProviders(<PlataformaAdmins />);
    await abrirMenu("Admin A");
    await userEvent.click(screen.getByRole("tab", { name: "Responsabilidade" }));
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await abrirMenu("Admin P");
    await userEvent.click(screen.getByRole("tab", { name: "Responsabilidade" }));
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("edita somente nome/telefone/CPF e bloqueia CPF de ativo já preenchido", async () => {
    renderWithProviders(<PlataformaAdmins />);
    await abrirMenu("Admin B");
    await userEvent.click(screen.getByRole("tab", { name: "Dados" }));
    const d = screen.getByRole("dialog");
    expect(within(d).getByLabelText("CPF")).toBeDisabled();
    expect(within(d).queryByRole("textbox", { name: /e-mail/i })).not.toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText("Nome completo"), { target: { value: "Admin B Silva" } });
    fireEvent.change(within(d).getByLabelText("Motivo"), { target: { value: "x" } });
    expect(within(d).getByRole("button", { name: "Salvar" })).toBeDisabled();
    fireEvent.change(within(d).getByLabelText("Motivo"), { target: { value: "Correção" } });
    fireEvent.click(within(d).getByRole("button", { name: "Salvar" }));
    expect(m.editar).toHaveBeenCalledWith(expect.objectContaining({ inviteId: "i-b", nome: "Admin B Silva", expectedUpdatedAt: B.updated_at }), expect.any(Object));
  });

  it("troca de e-mail exige novo endereço repetido e confirmação explícita, com motivo opcional", async () => {
    renderWithProviders(<PlataformaAdmins />);
    await abrirMenu("Admin B");
    await userEvent.click(screen.getByRole("tab", { name: "E-mail" }));
    const d = screen.getByRole("dialog");
    const botao = within(d).getByRole("button", { name: "Confirmar alteração" });
    fireEvent.change(within(d).getByLabelText("Novo e-mail"), { target: { value: "invalido" } });
    fireEvent.change(within(d).getByLabelText("Motivo (opcional)"), { target: { value: "Domínio novo" } });
    fireEvent.click(within(d).getByLabelText("Confirmo a alteração"));
    expect(botao).toBeDisabled();
    fireEvent.change(within(d).getByLabelText("Novo e-mail"), { target: { value: "novo@x.com.br" } });
    fireEvent.change(within(d).getByLabelText("Confirmar novo e-mail"), { target: { value: "novo@x.com.br" } });
    await waitFor(() => expect(botao).toBeEnabled());
    fireEvent.click(botao);
    expect(m.email).toHaveBeenCalledWith(expect.objectContaining({ inviteId: "i-b", newEmail: "novo@x.com.br", reason: "Domínio novo", idempotencyKey: undefined }), expect.any(Object));
  });

  it("troca de e-mail: motivo opcional; vazio aceito, 1 caractere bloqueia", async () => {
    renderWithProviders(<PlataformaAdmins />);
    await abrirMenu("Admin B");
    await userEvent.click(screen.getByRole("tab", { name: "E-mail" }));
    const d = screen.getByRole("dialog");
    const botao = within(d).getByRole("button", { name: "Confirmar alteração" });
    const motivo = within(d).getByLabelText("Motivo (opcional)");
    expect(motivo).not.toBeRequired();
    fireEvent.change(within(d).getByLabelText("Novo e-mail"), { target: { value: "novo@x.com.br" } });
    fireEvent.change(within(d).getByLabelText("Confirmar novo e-mail"), { target: { value: "novo@x.com.br" } });
    fireEvent.click(within(d).getByLabelText("Confirmo a alteração"));
    fireEvent.change(motivo, { target: { value: " x " } });
    expect(botao).toBeDisabled();
    expect(within(d).getByText(/ao menos 2 caracteres/)).toBeInTheDocument();
    fireEvent.change(motivo, { target: { value: "   " } });
    await waitFor(() => expect(botao).toBeEnabled());
    expect(within(d).queryByText(/ao menos 2 caracteres/)).not.toBeInTheDocument();
    fireEvent.click(botao);
    expect(m.email).toHaveBeenCalledWith(expect.objectContaining({ newEmail: "novo@x.com.br", reason: "" }), expect.any(Object));
  });

  it("retoma mudança pendente com a mesma chave idempotente", async () => {
    m.mudancas = [{ id: "c1", invite_id: "i-b", status: "failed", new_email: "novo@x.com.br", idempotency_key: "key-1", reason: "Domínio", last_error_code: "sync_failed" }];
    renderWithProviders(<PlataformaAdmins />);
    await abrirMenu("Admin B");
    await userEvent.click(screen.getByRole("tab", { name: "E-mail" }));
    const d = screen.getByRole("dialog");
    fireEvent.click(within(d).getByLabelText("Confirmo a alteração"));
    fireEvent.click(within(d).getByRole("button", { name: "Verificar confirmação" }));
    expect(m.email).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "key-1", newEmail: "novo@x.com.br", action: "reconcile" }), expect.any(Object));
  });

  it("não oferece cancelamento fictício e respeita cooldown de reenvio", async () => {
    m.mudancas = [{ id: "c1", invite_id: "i-b", status: "requested", new_email: "novo@x.com.br", idempotency_key: "key-1", reason: "", confirmation_delivery_status: "accepted", confirmation_next_attempt_at: new Date(Date.now() + 300000).toISOString() }];
    renderWithProviders(<PlataformaAdmins />);
    await abrirMenu("Admin B");
    await userEvent.click(screen.getByRole("tab", { name: "E-mail" }));
    const d = screen.getByRole("dialog");
    expect(within(d).queryByRole("button", { name: "Cancelar solicitação" })).not.toBeInTheDocument();
    expect(within(d).getByText(/não podem ser cancelados com segurança/)).toBeInTheDocument();
    expect(within(d).getByText(/Aguarde a expiração ou verifique a confirmação para reconciliar/)).toBeInTheDocument();
    fireEvent.click(within(d).getByLabelText("Confirmo a alteração"));
    expect(within(d).getByRole("button", { name: "Reenviar confirmação" })).toBeDisabled();
    expect(m.email).not.toHaveBeenCalled();
  });

  it("reenvio ambíguo exige confirmação humana e mantém chave idempotente", async () => {
    m.mudancas = [{ id: "c1", invite_id: "i-b", status: "requested", new_email: "novo@x.com.br", idempotency_key: "key-1", reason: "", confirmation_delivery_status: "ambiguous" }];
    renderWithProviders(<PlataformaAdmins />);
    await abrirMenu("Admin B");
    await userEvent.click(screen.getByRole("tab", { name: "E-mail" }));
    const d = screen.getByRole("dialog");
    const resend = within(d).getByRole("button", { name: "Reenviar confirmação" });
    expect(resend).toBeDisabled();
    expect(within(d).getByText(/Verifiquei a caixa de entrada/)).toBeInTheDocument();
    fireEvent.click(within(d).getByLabelText("Confirmo a alteração"));
    fireEvent.click(resend);
    expect(m.email).toHaveBeenCalledWith(expect.objectContaining({ action: "resend", idempotencyKey: "key-1", confirmAmbiguousRetry: true }), expect.any(Object));
  });
});

describe("contratos estruturais de segurança", () => {
  const fn = readFileSync("supabase/functions/platform-org-admin-email-change/index.ts", "utf8");
  const hook = readFileSync("src/hooks/usePlataformaSaaS.ts", "utf8");
  it("Edge valida JWT e superadmin e só sincroniza após o Auth", () => {
    const authTs = readFileSync("supabase/functions/platform-org-admin-email-change/auth.ts", "utf8");
    expect(fn).not.toContain("getClaims");
    expect(fn).toContain("authorizeSuperadmin(");
    expect(fn).toMatch(/npm:@supabase\/supabase-js@2\.\d+\.\d+/);
    expect(authTs).toContain("auth.getUser(token)");
    expect(authTs).toContain("is_platform_superadmin");
    expect(fn).not.toContain("updateUserById");
    expect(fn).not.toContain("email_confirm: true");
    expect(fn).toContain('type: "email_change_new"');
    expect(fn).toContain('type: "email_change_current"');
    expect(fn).not.toMatch(/user_metadata/);
  });
  it("frontend não usa service_role nem Admin Auth", () => {
    expect(hook).not.toMatch(/service_role|auth\.admin/);
  });
});
