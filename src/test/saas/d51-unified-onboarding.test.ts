import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const flow = readFileSync("src/pages/plataforma/OrganizationOnboardingFlow.tsx", "utf8");
const companies = readFileSync("src/pages/plataforma/PlataformaEmpresas.tsx", "utf8");
const admins = readFileSync("src/pages/plataforma/PlataformaAdmins.tsx", "utf8");
const home = readFileSync("src/pages/plataforma/PlataformaHome.tsx", "utf8");
const hook = readFileSync("src/hooks/usePlataformaSaaS.ts", "utf8");

describe("D51.2 — fluxo único Empresa → Responsável → Revisão → Convite", () => {
  it("mantém checkpoint explícito entre criação e convite", () => {
    expect(flow).toContain("const criarEmpresa = async");
    expect(flow).toContain("const enviarConvite = async");
    expect(flow).toContain("await criar.mutateAsync");
    expect(flow).toContain("await convidar.mutateAsync");
    expect(flow.indexOf("await criar.mutateAsync")).toBeLessThan(flow.indexOf("await convidar.mutateAsync"));
    expect(flow).toContain('setProgresso("empresa_pronta")');
    expect(flow).toContain('data-testid="create-organization"');
    expect(flow).toContain('data-testid="send-invite"');
    expect(flow).toContain("Criar empresa");
    expect(flow).toContain("Empresa criada — pronta para auditoria");
    expect(flow).toContain("Enviar convite");
    expect(flow).toContain("Tentar convite novamente");
    expect(flow).toContain("Não recebi — reenviar convite");
    expect(flow).toContain("Confirmar e reenviar");
    expect(flow).not.toContain("criarEConvidar");
    expect(flow).not.toContain("Criar empresa e enviar convite");
    expect(hook).toMatch(/useCriarEmpresa[\s\S]*retry: false/);
    expect(hook).toMatch(/useConvidarAdminEmpresa[\s\S]*retry: false/);
  });

  it("distingue empresa e usuário, fixa link como padrão e impede clique concorrente", () => {
    expect(flow).toContain("E-mail corporativo da empresa");
    expect(flow).toContain("E-mail de acesso e convite");
    expect(flow).toContain('modo: "link"');
    expect(flow).toContain("processando = criar.isPending || convidar.isPending");
    expect(flow).toContain("operacaoEmCurso.current");
    expect(flow).toContain("disabled={processando || Boolean(organizationId)}");
    expect(flow).toContain("Empresa que será criada");
    expect(flow).toContain("Responsável que receberá acesso");
    expect(flow).toContain("Confirme o CNPJ");
    expect(flow).toContain('autoComplete="off"');
    expect(flow).toContain("disabled={Boolean(origem) || buscando}");
    expect(flow).not.toMatch(/localStorage|sessionStorage/);
  });

  it("retry do convite reutiliza o organizationId e não recria a empresa", () => {
    const createBody = flow.slice(flow.indexOf("const criarEmpresa"), flow.indexOf("const enviarConvite"));
    const inviteBody = flow.slice(flow.indexOf("const enviarConvite"), flow.indexOf("return ("));
    expect(createBody).toContain("criar.mutateAsync");
    expect(createBody).not.toContain("convidar.mutateAsync");
    expect(inviteBody).toContain("convidar.mutateAsync");
    expect(inviteBody).not.toContain("criar.mutateAsync");
    expect(inviteBody).toContain("organizationId,");
  });

  it("mantém a aba histórica opcional e entrega contexto sem nova rota", () => {
    expect(companies).toContain("OrganizationOnboardingFlow");
    expect(home).toContain("setOrganizacaoEmContexto(organizationId)");
    expect(home).toContain("organizationIdInicial={organizacaoEmContexto}");
    expect(admins).toContain("if (organizationIdInicial) setOrg(organizationIdInicial)");
    expect(admins).not.toContain("<TableHead>Telefone</TableHead>");
    expect(admins).not.toContain("<TableHead>CPF</TableHead>");
  });

  it("não exibe link de ação, token ou detalhes SQL", () => {
    expect(flow).not.toMatch(/action_link|access_token|refresh_token/i);
    expect(admins).not.toMatch(/action_link|access_token|refresh_token/i);
  });
});