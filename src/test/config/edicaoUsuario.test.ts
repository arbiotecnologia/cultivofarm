import { describe, it, expect } from "vitest";
import {
  validarEdicaoUsuario,
  primeiroCampoInvalidoEdicao,
  diferencaPapeis,
  bloqueioAutoDesativacao,
  bloqueioAutoRemocaoAdmin,
  exigirUmaLinha,
  MSG_AUTO_DESATIVACAO,
  MSG_AUTO_REMOCAO_ADMIN,
  ERRO_EDICAO_PARCIAL,
} from "@/lib/configuracoes/usuariosValidation";
import { validatePhoneBR } from "@/lib/masks";

const tel = (v: unknown) => validatePhoneBR(v as any, { fieldLabel: "Telefone" });

describe("validarEdicaoUsuario", () => {
  it("aceita edição válida sem exigir senha", () => {
    const erros = validarEdicaoUsuario(
      { nome: "Maria Silva", telefone: "(11) 98765-4321", roles: ["administrativo"] },
      tel,
    );
    expect(erros).toEqual({});
  });

  it("rejeita nome curto e nome longo demais", () => {
    expect(validarEdicaoUsuario({ nome: "A", roles: ["administrativo"] }).nome).toBeTruthy();
    expect(
      validarEdicaoUsuario({ nome: "x".repeat(151), roles: ["administrativo"] }).nome,
    ).toBeTruthy();
  });

  it("rejeita lista de perfis vazia, duplicada e desconhecida", () => {
    expect(validarEdicaoUsuario({ nome: "Maria Silva", roles: [] }).roles).toBeTruthy();
    expect(
      validarEdicaoUsuario({ nome: "Maria Silva", roles: ["administrativo", "administrativo"] }).roles,
    ).toBeTruthy();
    expect(validarEdicaoUsuario({ nome: "Maria Silva", roles: ["inexistente"] }).roles).toBeTruthy();
  });

  it("rejeita perfis conflitantes de parceiro e produtor combinado", () => {
    expect(
      validarEdicaoUsuario({
        nome: "Maria Silva",
        roles: ["parceiro_b2b", "parceiro_b2b_tecnico"],
        partner_id: "p1",
      }).roles,
    ).toMatch(/apenas um perfil de Parceiro/i);
    expect(
      validarEdicaoUsuario({
        nome: "Maria Silva",
        roles: ["cliente_produtor", "administrativo"],
        cliente_ids: ["c1"],
      }).roles,
    ).toMatch(/Produtor/i);
  });

  it("exige cliente para Produtor e parceiro para perfis B2B", () => {
    expect(
      validarEdicaoUsuario({ nome: "Maria Silva", roles: ["cliente_produtor"], cliente_ids: [] })
        .cliente_ids,
    ).toBeTruthy();
    expect(
      validarEdicaoUsuario({ nome: "Maria Silva", roles: ["parceiro_b2b"], partner_id: "" })
        .partner_id,
    ).toBeTruthy();
  });

  it("valida telefone com validatePhoneBR", () => {
    const erros = validarEdicaoUsuario(
      { nome: "Maria Silva", telefone: "119", roles: ["administrativo"] },
      tel,
    );
    expect(erros.telefone).toContain("10 ou 11 dígitos");
    expect(primeiroCampoInvalidoEdicao(erros)).toBe("telefone");
  });

  it("ordem do primeiro campo inválido prioriza o nome", () => {
    const erros = validarEdicaoUsuario({ nome: "", roles: [] });
    expect(primeiroCampoInvalidoEdicao(erros)).toBe("nome");
  });
});

describe("diferencaPapeis", () => {
  it("insere apenas novos, remove apenas retirados e preserva comuns", () => {
    const d = diferencaPapeis(["administrativo", "financeiro"], ["administrativo", "producao"]);
    expect(d.inserir).toEqual(["producao"]);
    expect(d.remover).toEqual(["financeiro"]);
    expect(d.manter).toEqual(["administrativo"]);
  });

  it("sem mudanças não gera escrita", () => {
    const d = diferencaPapeis(["administrativo"], ["administrativo"]);
    expect(d.inserir).toEqual([]);
    expect(d.remover).toEqual([]);
  });
});

describe("proteções de auto-alteração (UX)", () => {
  it("bloqueia desativar a própria conta", () => {
    expect(bloqueioAutoDesativacao(true, false)).toBe(MSG_AUTO_DESATIVACAO);
    expect(bloqueioAutoDesativacao(true, true)).toBeNull();
    expect(bloqueioAutoDesativacao(false, false)).toBeNull();
  });

  it("bloqueia retirar o próprio papel de administrador", () => {
    expect(bloqueioAutoRemocaoAdmin(true, ["administrador"], ["administrativo"])).toBe(
      MSG_AUTO_REMOCAO_ADMIN,
    );
    expect(
      bloqueioAutoRemocaoAdmin(true, ["administrador"], ["administrador", "financeiro"]),
    ).toBeNull();
    expect(bloqueioAutoRemocaoAdmin(false, ["administrador"], [])).toBeNull();
  });
});

describe("exigirUmaLinha", () => {
  it("aceita exatamente uma linha", () => {
    expect(() => exigirUmaLinha([{ user_id: "u1" }], "perfil")).not.toThrow();
  });

  it("falha com zero linhas, várias linhas ou retorno inválido", () => {
    expect(() => exigirUmaLinha([], "perfil")).toThrow(/não foi possível confirmar/i);
    expect(() => exigirUmaLinha([{}, {}], "perfil")).toThrow();
    expect(() => exigirUmaLinha(null, "perfil")).toThrow();
  });
});

describe("mensagem de estado parcial", () => {
  it("orienta recarregar antes de reenviar e não promete atomicidade", () => {
    expect(ERRO_EDICAO_PARCIAL).toMatch(/parcialmente alterados/i);
    expect(ERRO_EDICAO_PARCIAL).toMatch(/recarregue/i);
  });
});
