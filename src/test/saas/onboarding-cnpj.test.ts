import { describe, expect, it } from "vitest";
import { aplicarPlano, mensagemConsulta, planejarAplicacao } from "@/lib/saas/onboardingCnpj";
import type { DadosEmpresa } from "@/lib/saas/onboardingCnpj";
import type { OnboardingDados } from "@/lib/saas/orgOnboarding";

const base: OnboardingDados = {
  razao_social: "", cnpj: "19131243/0001-97", cep: "", logradouro: "", numero: "",
  bairro: "", cidade: "", uf: "", telefone: "", email_contato: "", confirmado: false,
};

const dados: DadosEmpresa = {
  cnpj: "19131243000197", razao_social: "OPEN KNOWLEDGE BRASIL", nome_fantasia: null,
  situacao_cadastral: "ATIVA", matriz_filial: "MATRIZ", porte: "DEMALLOC", natureza_juridica: null,
  data_abertura: null, cnae_principal: "9430800", cnae_descricao: null,
  cep: "05434-090", logradouro: "Rua Fradique Coutinho", numero: "1252", complemento: null,
  bairro: "Vila Madalena", cidade: "SAO PAULO", uf: "SP",
  telefone: "1138509662", email_contato: null, regime_tributario: null, socios_sugeridos: [],
};

describe("planejarAplicacao", () => {
  it("aplica apenas campos vazios como 'vazio' e preserva preenchidos", () => {
    const atual = { ...base, cidade: "Campinas" };
    const plano = planejarAplicacao(atual, dados);
    const cidades = plano.filter((p) => p.campo === "cidade");
    expect(cidades).toHaveLength(1);
    expect(cidades[0].tipo).toBe("conflito");
  });

  it("ignora campos sem retorno da API", () => {
    const plano = planejarAplicacao(base, dados);
    expect(plano.some((p) => p.campo === "nome_fantasia")).toBe(false);
    expect(plano.some((p) => p.campo === "email_contato")).toBe(false);
  });

  it("trata cidades equivalentes (máscara/caixa) como iguais", () => {
    const plano = planejarAplicacao({ ...base, cidade: "são paulo" }, { ...dados, cidade: "SAO PAULO" });
    expect(plano.some((p) => p.campo === "cidade")).toBe(false);
  });
});

describe("aplicarPlano", () => {
  it("aplica vazios e só os conflitos escolhidos", () => {
    const atual = { ...base, cidade: "são paulo", logradouro: "Rua manual" };
    const plano = planejarAplicacao(atual, dados);
    const soVazios = aplicarPlano(atual, plano, new Set());
    expect(soVazios.cep).toBe("05434-090");
    expect(soVazios.logradouro).toBe("Rua manual");
    const comEscolhas = aplicarPlano(atual, plano, new Set(["logradouro"]));
    expect(comEscolhas.logradouro).toBe("Rua Fradique Coutinho");
    // cidade equivalente não gera conflito nem é alterada
    expect(comEscolhas.cidade).toBe("são paulo");
  });

  it("nunca altera o CNPJ já digitado", () => {
    const plano = planejarAplicacao(base, dados);
    const r = aplicarPlano(base, plano, new Set(plano.map((p) => p.campo)));
    expect(r.cnpj).toBe("19131243/0001-97");
  });
});

describe("mensagemConsulta", () => {
  it("traduz códigos conhecidos e tem fallback", () => {
    expect(mensagemConsulta("not_found")).toMatch(/não encontrado/i);
    expect(mensagemConsulta("rate_limited")).toMatch(/limite/i);
    expect(mensagemConsulta("codigo_desconhecido")).toBeTruthy();
  });
});
