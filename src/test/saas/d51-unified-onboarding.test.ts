import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const flow = readFileSync("src/pages/plataforma/OrganizationOnboardingFlow.tsx", "utf8");
const companies = readFileSync("src/pages/plataforma/PlataformaEmpresas.tsx", "utf8");
const admins = readFileSync("src/pages/plataforma/PlataformaAdmins.tsx", "utf8");
const home = readFileSync("src/pages/plataforma/PlataformaHome.tsx", "utf8");
const hook = readFileSync("src/hooks/usePlataformaSaaS.ts", "utf8");

describe("D51.2 — fluxo único Empresa → Responsável → Revisão → Convite", () => {
  it("orquestra operações server-side separadas sem repetir a empresa", () => {
    expect(flow).toContain("await criar.mutateAsync");
    expect(flow).toContain("await convidar.mutateAsync");
    expect(flow.indexOf("await criar.mutateAsync")).toBeLessThan(flow.indexOf("await convidar.mutateAsync"));
    expect(flow).toContain("if (!targetOrganizationId)");
    expect(flow).toContain("Tentar convite novamente");
    expect(hook).toMatch(/useCriarEmpresa[\s\S]*retry: false/);
    expect(hook).toMatch(/useConvidarAdminEmpresa[\s\S]*retry: false/);
  });

  it("distingue empresa e usuário, fixa link como padrão e impede clique concorrente", () => {
    expect(flow).toContain("E-mail corporativo da empresa");
    expect(flow).toContain("E-mail de acesso e convite");
    expect(flow).toContain('modo: "link"');
    expect(flow).toContain("processando = criar.isPending || convidar.isPending");
    expect(flow).toContain("disabled={!podeExecutar || processando}");
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