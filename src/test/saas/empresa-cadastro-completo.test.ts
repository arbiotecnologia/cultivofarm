import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CAMPOS_CADASTRO, camposFaltantes, cepValido, dadosCadastroAtuais, divergenciasFiscais, errosCadastro,
  mascaraCep, mascaraTelefoneBR, montarPatchCadastro, telefoneValido, ufValida,
} from "@/components/plataforma/empresaEdicao";
import { ONBOARDING_CAMPOS, UFS_BRASIL } from "@/lib/saas/orgOnboarding";

describe("cadastro empresarial completo", () => {
  it("máscaras e validações BR", () => {
    expect(mascaraCep("01001000")).toBe("01001-000");
    expect(mascaraTelefoneBR("11987654321")).toBe("(11) 98765-4321");
    expect(mascaraTelefoneBR("1133334444")).toBe("(11) 3333-4444");
    expect(cepValido("0100100")).toBe(false);
    expect(telefoneValido("119")).toBe(false);
    expect(ufValida("sp")).toBe(true);
    expect(ufValida("XX")).toBe(false);
    expect(UFS_BRASIL).toHaveLength(27);
    expect(errosCadastro({ email_contato: "x" })).toContain("Informe um e-mail de contato válido.");
  });
  it("nova empresa exige telefone e endereço; complemento e IE opcionais", () => {
    const ok = { telefone: "1133334444", cep: "01001-000", logradouro: "Rua A", numero: "1", bairro: "Centro", cidade: "SP", uf: "SP" };
    expect(errosCadastro(ok, true)).toEqual([]);
    expect(errosCadastro({ ...ok, numero: "" }, true)[0]).toMatch(/Número/);
    expect(errosCadastro({ ...ok, complemento: "Sala 1", inscricao_estadual: "" }, true)).toEqual([]);
  });
  it("empresa antiga não é bloqueada por campos ausentes na edição", () => {
    expect(errosCadastro({})).toEqual([]);
    expect(camposFaltantes({ razao_social: "X", cnpj: "1", email_corporativo: "a@b.co" }, {})).toContain("CEP");
  });
  it("patch parcial envia só alterados, normaliza e ignora chaves fora da whitelist", () => {
    const atual = dadosCadastroAtuais({ onboarding_dados: { cep: "01001-000", idioma: "pt-BR", regime_tributario: "mei" }, fuso_horario: null });
    expect(atual).not.toHaveProperty("idioma");
    const patch = montarPatchCadastro({ ...atual, telefone: "(11) 3333-4444", uf: "sp", cnpj: "x" } as never, atual);
    expect(patch).toEqual({ telefone: "1133334444", uf: "SP" });
    expect(Object.keys(patch).every((k) => (CAMPOS_CADASTRO as readonly string[]).includes(k))).toBe(true);
  });
  it("complemento entra na whitelist do onboarding", () => {
    expect(ONBOARDING_CAMPOS.complemento).toBe(120);
  });
  it("divergência fiscal apontada, não resolvida", () => {
    expect(divergenciasFiscais({ razao_social: "A LTDA", cnpj: "11222333000181" }, { inscricao_estadual: "1" }, { configurado: true, razao_social: "a  ltda", cnpj: "11.222.333/0001-81", inscricao_estadual: "2" })).toEqual(["Inscrição estadual"]);
    expect(divergenciasFiscais({ razao_social: "A" }, {}, { configurado: false })).toEqual([]);
  });
  it("hooks usam RPCs canônicas; CNPJ não é enviado na edição", () => {
    const hook = readFileSync("src/hooks/usePlataformaSaaS.ts", "utf8");
    expect(hook).toContain('"platform_get_organization_fiscal_summary"');
    expect(hook).not.toMatch(/from\("company_fiscal_settings"\)/);
    const edit = hook.slice(hook.indexOf("export function useEditarEmpresa"), hook.indexOf("useResumoFiscalEmpresa"));
    expect(edit).not.toMatch(/_cnpj/);
  });
});
