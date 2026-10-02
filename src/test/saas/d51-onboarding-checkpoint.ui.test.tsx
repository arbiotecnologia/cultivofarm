import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";

const mocks = vi.hoisted(() => ({
  criar: vi.fn(),
  convidar: vi.fn(),
  consultar: vi.fn(),
}));

vi.mock("@/hooks/usePlataformaSaaS", () => ({
  ErroConvitePlataforma: class ErroConvitePlataforma extends Error {
    constructor(public code: string, message: string) { super(message); }
  },
  mensagemErroPlataforma: () => "Não foi possível concluir a operação.",
  useOrganizacoesSaaS: () => ({ data: [], isLoading: false }),
  usePlanosSaaS: () => ({ data: [{ id: "base", key: "base", name: "Plano Base", active: true }] }),
  useCriarEmpresa: () => ({ mutateAsync: mocks.criar, isPending: false }),
  useConvidarAdminEmpresa: () => ({ mutateAsync: mocks.convidar, isPending: false }),
}));

vi.mock("@/lib/saas/onboardingCnpj", () => ({
  CODIGOS_FALLBACK_MANUAL: new Set<string>(),
  FONTE_OFICIAL: "Consulta oficial",
  mensagemConsulta: () => "Consulta indisponível",
  consultarCnpjOnboarding: mocks.consultar,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (value: string) => void }) => (
    <select aria-label="Plano" value={value} onChange={(event) => onValueChange(event.target.value)}>
      <option value="">Selecione o plano</option>{children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
}));

import OrganizationOnboardingFlow from "@/pages/plataforma/OrganizationOnboardingFlow";

async function chegarNaRevisao() {
  fireEvent.change(screen.getByLabelText("CNPJ *"), { target: { value: "36.736.180/0001-11" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar empresa" }));
  await screen.findByDisplayValue("EMPRESA OFICIAL CONTROLADA LTDA");
  fireEvent.change(screen.getByLabelText("E-mail corporativo da empresa *"), { target: { value: "renato@refilinformatica.com.br" } });
  fireEvent.change(screen.getByLabelText("Plano"), { target: { value: "base" } });
  fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
  fireEvent.change(screen.getByLabelText("Nome completo *"), { target: { value: "Responsável Controlado" } });
  fireEvent.change(screen.getByLabelText("E-mail de acesso e convite *"), { target: { value: "teste@refilinformatica.com.br" } });
  fireEvent.click(screen.getByRole("button", { name: /Revisar/ }));
  fireEvent.change(screen.getByLabelText("Confirme o CNPJ *"), { target: { value: "36736180000111" } });
  expect(screen.getByRole("button", { name: "Criar empresa" })).toBeEnabled();
}

function renderFlow() {
  return renderWithProviders(<OrganizationOnboardingFlow onOpenAdmins={vi.fn()} onShowOrganization={vi.fn()} />);
}

describe("D51.2 — checkpoint explícito E01 → E02", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consultar.mockResolvedValue({
      codigo: "ok",
      consultado_em: "2026-10-02T14:00:00.000Z",
      dados: {
        cnpj: "36.736.180/0001-11",
        razao_social: "EMPRESA OFICIAL CONTROLADA LTDA",
        nome_fantasia: "EMPRESA CONTROLADA",
        email_contato: "",
        situacao_cadastral: "ATIVA",
      },
    });
    mocks.criar.mockResolvedValue("org-controlada");
    mocks.convidar.mockResolvedValue({ user_id: "user-controlado", senha_temporaria: null, email_status: "accepted" });
  });

  it("cria a empresa sem chamar o convite e libera E02 somente após o sucesso", async () => {
    renderFlow();
    await chegarNaRevisao();
    fireEvent.click(screen.getByRole("button", { name: "Criar empresa" }));

    await screen.findByText("Empresa criada — pronta para auditoria");
    expect(mocks.criar).toHaveBeenCalledTimes(1);
    expect(mocks.convidar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Enviar convite" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Voltar e editar/ })).toBeDisabled();
  });

  it("mantém a criação desabilitada quando o CNPJ confirmado é diferente", async () => {
    renderFlow();
    await chegarNaRevisao();
    fireEvent.change(screen.getByLabelText("Confirme o CNPJ *"), { target: { value: "36736180000112" } });
    expect(screen.getByRole("button", { name: "Criar empresa" })).toBeDisabled();
    expect(mocks.criar).not.toHaveBeenCalled();
  });

  it("bloqueia resposta oficial com CNPJ diferente do consultado", async () => {
    mocks.consultar.mockResolvedValueOnce({ codigo: "ok", dados: { cnpj: "09.255.249/0001-12", razao_social: "REFIL", nome_fantasia: "", email_contato: "", situacao_cadastral: "ATIVA" } });
    renderFlow();
    fireEvent.change(screen.getByLabelText("CNPJ *"), { target: { value: "36.736.180/0001-11" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar empresa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A consulta retornou outro CNPJ");
    expect(screen.queryByRole("button", { name: /Continuar/ })).toBeDisabled();
  });

  it("bloqueia criação se a razão oficial divergir do snapshot", async () => {
    renderFlow();
    fireEvent.change(screen.getByLabelText("CNPJ *"), { target: { value: "36.736.180/0001-11" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar empresa" }));
    const razao = await screen.findByLabelText("Razão social *");
    fireEvent.change(razao, { target: { value: "RAZÃO ALTERADA" } });
    fireEvent.change(screen.getByLabelText("E-mail corporativo da empresa *"), { target: { value: "renato@refilinformatica.com.br" } });
    fireEvent.change(screen.getByLabelText("Plano"), { target: { value: "base" } });
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    fireEvent.change(screen.getByLabelText("Nome completo *"), { target: { value: "Responsável Controlado" } });
    fireEvent.change(screen.getByLabelText("E-mail de acesso e convite *"), { target: { value: "teste@refilinformatica.com.br" } });
    fireEvent.click(screen.getByRole("button", { name: /Revisar/ }));
    fireEvent.change(screen.getByLabelText("Confirme o CNPJ *"), { target: { value: "36736180000111" } });
    expect(screen.getByRole("button", { name: "Criar empresa" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Os dados não conferem");
  });

  it("envia exatamente o e-mail corporativo exibido na revisão", async () => {
    renderFlow();
    await chegarNaRevisao();
    expect(screen.getByText("renato@refilinformatica.com.br")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar empresa" }));
    await waitFor(() => expect(mocks.criar).toHaveBeenCalledWith(expect.objectContaining({ email: "renato@refilinformatica.com.br" })));
  });

  it("invalida snapshot e confirmação ao consultar outro CNPJ", async () => {
    renderFlow();
    await chegarNaRevisao();
    fireEvent.click(screen.getByRole("button", { name: /Voltar e editar/ }));
    fireEvent.click(screen.getByRole("button", { name: /Voltar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Consultar outro CNPJ" }));
    expect(screen.getByLabelText("CNPJ *")).toHaveValue("");
    expect(screen.queryByLabelText("Confirme o CNPJ *")).not.toBeInTheDocument();
  });

  it("declara mitigação de autofill nos três campos sensíveis", async () => {
    renderFlow();
    expect(screen.getByLabelText("CNPJ *")).toHaveAttribute("autocomplete", "off");
    fireEvent.change(screen.getByLabelText("CNPJ *"), { target: { value: "36.736.180/0001-11" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar empresa" }));
    expect(await screen.findByLabelText("E-mail corporativo da empresa *")).toHaveAttribute("autocomplete", "off");
    fireEvent.change(screen.getByLabelText("E-mail corporativo da empresa *"), { target: { value: "renato@refilinformatica.com.br" } });
    fireEvent.change(screen.getByLabelText("Plano"), { target: { value: "base" } });
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(screen.getByLabelText("E-mail de acesso e convite *")).toHaveAttribute("autocomplete", "off");
  });

  it("só envia convite após a segunda ação explícita", async () => {
    renderFlow();
    await chegarNaRevisao();
    fireEvent.click(screen.getByRole("button", { name: "Criar empresa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar convite" }));

    await screen.findByText("Convite enviado");
    expect(mocks.criar).toHaveBeenCalledTimes(1);
    expect(mocks.convidar).toHaveBeenCalledTimes(1);
    expect(mocks.convidar).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-controlada" }));
  });

  it("retry pós-falha repete somente o convite", async () => {
    mocks.convidar.mockRejectedValueOnce(new Error("falha controlada")).mockResolvedValueOnce({ user_id: "user-controlado", senha_temporaria: null, email_status: "accepted" });
    renderFlow();
    await chegarNaRevisao();
    fireEvent.click(screen.getByRole("button", { name: "Criar empresa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar convite" }));

    const retry = await screen.findByRole("button", { name: "Tentar convite novamente" });
    fireEvent.click(retry);
    await screen.findByText("Convite enviado");
    expect(mocks.criar).toHaveBeenCalledTimes(1);
    expect(mocks.convidar).toHaveBeenCalledTimes(2);
  });

  it("exige confirmação explícita antes do retry ambíguo", async () => {
    const { ErroConvitePlataforma } = await import("@/hooks/usePlataformaSaaS");
    mocks.convidar.mockRejectedValueOnce(new ErroConvitePlataforma("email_ambiguous_confirmation_required", "Verifique a caixa de entrada"));
    renderFlow();
    await chegarNaRevisao();
    fireEvent.click(screen.getByRole("button", { name: "Criar empresa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar convite" }));
    expect(await screen.findByText("Envio não confirmado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Não recebi — reenviar convite" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("O reenvio pode gerar uma segunda mensagem");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.convidar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Não recebi — reenviar convite" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e reenviar" }));
    await waitFor(() => expect(mocks.convidar).toHaveBeenCalledTimes(2));
    expect(mocks.convidar).toHaveBeenLastCalledWith(expect.objectContaining({ confirmAmbiguousEmailRetry: true }));
  });

  it("bloqueia duplo clique síncrono na criação", async () => {
    let concluir: (id: string) => void = () => undefined;
    mocks.criar.mockImplementation(() => new Promise<string>((resolve) => { concluir = resolve; }));
    renderFlow();
    await chegarNaRevisao();
    const criar = screen.getByRole("button", { name: "Criar empresa" });
    fireEvent.click(criar);
    fireEvent.click(criar);
    expect(mocks.criar).toHaveBeenCalledTimes(1);
    concluir("org-controlada");
    await screen.findByText("Empresa criada — pronta para auditoria");
  });

  it("mantém a composição básica utilizável em larguras mobile e desktop", () => {
    const { rerender } = renderFlow();
    expect(screen.getByTestId("organization-onboarding-flow")).toBeInTheDocument();
    window.innerWidth = 390;
    fireEvent(window, new Event("resize"));
    rerender(<OrganizationOnboardingFlow onOpenAdmins={vi.fn()} onShowOrganization={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Etapas do cadastro" })).toBeInTheDocument();
  });
});