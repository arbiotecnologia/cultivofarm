import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errosFormEmpresa, formEmpresaAlterado, formatarCnpj, mensagemErroEdicaoEmpresa } from "@/components/plataforma/empresaEdicao";

const editar = vi.fn();
const refetch = vi.fn().mockResolvedValue({});
const rolesRef = { current: ["superadmin"] as string[] };
const orgs = [
  { id: "org-a", nome: "AR BIOTECNOLOGIA LTDA", nome_fantasia: "AR Bio", cnpj: "12345678000190", email_corporativo: "a@ar.com", status: "ativa", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z" },
  { id: "org-b", nome: "REFIL INFORMATICA LTDA", nome_fantasia: null, cnpj: "98765432000110", email_corporativo: "b@refil.com", status: "onboarding", created_at: "2026-01-02T00:00:00Z", updated_at: "2026-02-02T00:00:00Z" },
];
const detalhe = (id: string) => {
  const o = orgs.find((x) => x.id === id)!;
  return { ...o, razao_social: o.nome, fuso_horario: "America/Sao_Paulo", responsavel_user_id: null, responsavel_definido_em: null, onboarding_concluido_em: null, ativada_em: null };
};

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: rolesRef.current }) }));
vi.mock("@/pages/plataforma/OrganizationOnboardingFlow", () => ({
  default: ({ onShowOrganization }: { onShowOrganization: (id: string) => void }) => (
    <div data-testid="onboarding-flow"><button onClick={() => onShowOrganization("org-a")}>Ver empresa</button></div>
  ),
}));
vi.mock("@/hooks/usePlataformaSaaS", () => ({
  mensagemErroPlataforma: () => "Erro",
  useOrganizacoesSaaS: () => ({ data: orgs, refetch }),
  useAlterarStatusEmpresa: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEmpresaDetalhe: (id: string) => ({ data: detalhe(id), refetch }),
  useAssinaturasSaaS: () => ({ data: [{ id: "s1", organization_id: "org-a", plan_id: "p1", plan_version_id: null, status: "TRIAL", started_at: "2026-01-05T00:00:00Z" }] }),
  usePlanosSaaS: () => ({ data: [{ id: "p1", name: "Plano Base" }] }),
  useConvitesAdminEmpresa: () => ({ data: [{ id: "c1", organization_id: "org-a", nome: "Maria", email: "maria@ar.com", responsavel_principal: true, status: "ativo" }] }),
  useAuditoriaEmpresa: () => ({ data: [{ id: "e1", tipo: "situacao", created_at: "2026-02-01T00:00:00Z", motivo: "Ativação", resumo: "Situação: onboarding → ativa" }], refetch }),
  useEditarEmpresa: () => ({ mutateAsync: editar, isPending: false }),
}));

import PlataformaEmpresas, { filtrarEmpresas } from "@/pages/plataforma/PlataformaEmpresas";

const handlers = () => ({ onAbrirAdministradores: vi.fn(), onAbrirAssinaturas: vi.fn(), onAbrirHistorico: vi.fn() });

describe("Gestão da plataforma — aba Empresa", () => {
  beforeEach(() => { editar.mockReset(); rolesRef.current = ["superadmin"]; });

  it("rotula a aba como Empresa e mantém a chave interna", () => {
    const home = readFileSync("src/pages/plataforma/PlataformaHome.tsx", "utf8");
    expect(home).toMatch(/value="empresas">[\s\S]*?Empresa\s*<\/TabsTrigger>/);
    expect(home).not.toContain("Nova Empresa");
    expect(home).toContain('aria-label="Seções da gestão da plataforma"');
    for (const tab of ["planos", "assinaturas", "excecoes", "admins", "comunicacao", "historico"]) {
      expect(home).toContain(`value="${tab}"`);
    }
  });

  it("lista primeiro; Nova Empresa abre o onboarding e Voltar preserva a lista", () => {
    render(<PlataformaEmpresas {...handlers()} />);
    expect(screen.getByRole("heading", { name: "Empresas" })).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-flow")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Nova Empresa" }));
    expect(screen.getByTestId("onboarding-flow")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Voltar para a lista/ }));
    expect(screen.getAllByText("AR BIOTECNOLOGIA LTDA").length).toBeGreaterThan(0);
  });

  it("após criar, o fluxo oferece abrir a empresa criada", () => {
    render(<PlataformaEmpresas {...handlers()} />);
    fireEvent.click(screen.getByRole("button", { name: "Nova Empresa" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver empresa" }));
    expect(screen.getByRole("heading", { name: "AR BIOTECNOLOGIA LTDA" })).toBeInTheDocument();
  });

  it("busca por razão social, nome fantasia e CNPJ", () => {
    expect(filtrarEmpresas(orgs, "refil").map((o) => o.id)).toEqual(["org-b"]);
    expect(filtrarEmpresas(orgs, "ar bio").map((o) => o.id)).toEqual(["org-a"]);
    expect(filtrarEmpresas(orgs, "98.765.432").map((o) => o.id)).toEqual(["org-b"]);
  });

  it("Abrir empresa mostra dados, assinatura, administradores e histórico; atalhos levam o contexto", () => {
    const h = handlers();
    render(<PlataformaEmpresas {...h} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir empresa AR BIOTECNOLOGIA LTDA" })[0]);
    expect(screen.getAllByText("12.345.678/0001-90").length).toBeGreaterThan(0);
    expect(screen.getByText("a@ar.com")).toBeInTheDocument();
    expect(screen.getByText("Plano Base")).toBeInTheDocument();
    expect(screen.getByText("Regularização pendente")).toBeInTheDocument();
    expect(screen.getByText(/Maria · maria@ar.com/, { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("Situação: onboarding → ativa")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Administradores" }));
    fireEvent.click(screen.getByRole("button", { name: "Assinaturas" }));
    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    expect(h.onAbrirAdministradores).toHaveBeenCalledWith("org-a");
    expect(h.onAbrirAssinaturas).toHaveBeenCalledWith("org-a");
    expect(h.onAbrirHistorico).toHaveBeenCalledWith("org-a");
  });

  it("menu de ações da linha não abre a empresa", () => {
    render(<PlataformaEmpresas {...handlers()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Mais ações para AR BIOTECNOLOGIA LTDA" })[0]);
    expect(screen.queryByRole("heading", { name: "AR BIOTECNOLOGIA LTDA" })).toBeNull();
  });

  it("edição: só campos seguros, CNPJ somente leitura, motivo ≥ 2 e envio único em duplo clique", async () => {
    let resolver: () => void = () => {};
    editar.mockImplementation(() => new Promise<void>((r) => { resolver = r; }));
    render(<PlataformaEmpresas {...handlers()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir empresa AR BIOTECNOLOGIA LTDA" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Editar empresa" }));
    expect(screen.getByLabelText("CNPJ")).toBeDisabled();
    expect(screen.queryByLabelText(/Situação|Plano|Assinatura|Administrador/)).toBeNull();
    const salvar = screen.getByRole("button", { name: "Salvar alterações" });
    fireEvent.change(screen.getByLabelText("Nome fantasia"), { target: { value: "AR Bio Nova" } });
    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "a" } });
    expect(salvar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "ok" } });
    expect(salvar).toBeEnabled();
    fireEvent.click(salvar); fireEvent.click(salvar);
    expect(editar).toHaveBeenCalledTimes(1);
    expect(editar.mock.calls[0][0]).toMatchObject({ organizationId: "org-a", nomeFantasia: "AR Bio Nova", motivo: "ok", expectedUpdatedAt: "2026-02-01T00:00:00Z" });
    expect(editar.mock.calls[0][0]).not.toHaveProperty("cnpj");
    resolver();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Salvar alterações" })).toBeNull());
  });

  it("sem papel de Platform Superadmin não exibe Editar empresa", () => {
    rolesRef.current = ["administrador"];
    render(<PlataformaEmpresas {...handlers()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir empresa AR BIOTECNOLOGIA LTDA" })[0]);
    expect(screen.queryByRole("button", { name: "Editar empresa" })).toBeNull();
  });

  it("validação e mensagens de erro seguras", () => {
    expect(errosFormEmpresa({ razaoSocial: "A", nomeFantasia: "", email: "x", motivo: "" })).toHaveLength(3);
    expect(errosFormEmpresa({ razaoSocial: "AR", nomeFantasia: "", email: "a@b.co", motivo: "ok" })).toEqual([]);
    expect(formEmpresaAlterado({ razaoSocial: " AR  LTDA ", nomeFantasia: "", email: "A@B.CO", motivo: "" }, { razao_social: "AR LTDA", nome: null, nome_fantasia: null, email_corporativo: "a@b.co" })).toBe(false);
    expect(formatarCnpj("12345678000190")).toBe("12.345.678/0001-90");
    expect(mensagemErroEdicaoEmpresa(new Error("platform_conflict: a empresa foi alterada por outra pessoa; recarregue"))).toMatch(/outra pessoa/);
    expect(mensagemErroEdicaoEmpresa(Object.assign(new Error("x"), { code: "42501" }))).toMatch(/acesso/);
    expect(mensagemErroEdicaoEmpresa(new Error("syntax error at SELECT"))).not.toMatch(/SELECT/);
  });
});
