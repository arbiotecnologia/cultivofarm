import { describe, it, expect } from "vitest";
import {
  validarNovoUsuario,
  primeiroCampoInvalido,
  mapearErroCriacaoUsuario,
  lerCorpoErroFuncao,
  criacaoBemSucedida,
  filtrarUsuariosPorBusca,
  paginar,
  ERRO_GENERICO_CRIACAO,
  REGRA_SENHA,
} from "@/lib/configuracoes/usuariosValidation";

const base = {
  nome: "Maria Silva",
  email: "maria@exemplo.com",
  password: "Senha1234",
  roles: ["administrativo"],
  partner_id: "",
  cliente_ids: [] as string[],
};

describe("validarNovoUsuario", () => {
  it("aceita entrada válida", () => {
    expect(validarNovoUsuario(base)).toEqual({});
  });

  it("rejeita nome curto e nome longo", () => {
    expect(validarNovoUsuario({ ...base, nome: "A" }).nome).toBeTruthy();
    expect(validarNovoUsuario({ ...base, nome: "a".repeat(151) }).nome).toBeTruthy();
  });

  it("valida e-mail (formato e tamanho)", () => {
    expect(validarNovoUsuario({ ...base, email: "invalido" }).email).toBeTruthy();
    expect(validarNovoUsuario({ ...base, email: "" }).email).toBeTruthy();
    const longo = `${"a".repeat(250)}@x.com`;
    expect(validarNovoUsuario({ ...base, email: longo }).email).toBeTruthy();
  });

  it("exige senha 8-128 com letra e número", () => {
    expect(validarNovoUsuario({ ...base, password: "Senha1" }).password).toBe(REGRA_SENHA);
    expect(validarNovoUsuario({ ...base, password: "somenteletras" }).password).toBe(REGRA_SENHA);
    expect(validarNovoUsuario({ ...base, password: "12345678" }).password).toBe(REGRA_SENHA);
    expect(validarNovoUsuario({ ...base, password: `a1${"x".repeat(127)}` }).password).toBe(REGRA_SENHA);
    expect(validarNovoUsuario({ ...base, password: "abcd1234" }).password).toBeUndefined();
  });

  it("exige ao menos um perfil e produtor exclusivo", () => {
    expect(validarNovoUsuario({ ...base, roles: [] }).roles).toBeTruthy();
    expect(validarNovoUsuario({ ...base, roles: ["cliente_produtor", "administrativo"] }).roles).toBeTruthy();
  });

  it("produtor exige cliente vinculado", () => {
    const e = validarNovoUsuario({ ...base, roles: ["cliente_produtor"], cliente_ids: [] });
    expect(e.cliente_ids).toBeTruthy();
    const ok = validarNovoUsuario({ ...base, roles: ["cliente_produtor"], cliente_ids: ["c1"] });
    expect(ok).toEqual({});
  });

  it("papel B2B exige parceiro", () => {
    expect(validarNovoUsuario({ ...base, roles: ["parceiro_b2b"] }).partner_id).toBeTruthy();
    expect(validarNovoUsuario({ ...base, roles: ["parceiro_b2b_tecnico"], partner_id: "p1" }).partner_id).toBeUndefined();
  });

  it("primeiroCampoInvalido respeita a ordem visual", () => {
    const erros = validarNovoUsuario({ ...base, nome: "", password: "x" });
    expect(primeiroCampoInvalido(erros)).toBe("nome");
    expect(primeiroCampoInvalido({})).toBeNull();
  });
});

describe("mapearErroCriacaoUsuario", () => {
  it("usa mensagem permitida por código", () => {
    expect(mapearErroCriacaoUsuario(null, '{"code":"email_ja_cadastrado"}')).toMatch(/já existe/i);
  });

  it("reconhece mensagem conhecida do servidor (com acento/pontuação)", () => {
    expect(
      mapearErroCriacaoUsuario(null, '{"error":"email, password, nome e ao menos um perfil são obrigatórios"}'),
    ).toMatch(/preencha nome/i);
  });

  it("rejeita QUALQUER texto desconhecido do servidor", () => {
    expect(mapearErroCriacaoUsuario(null, '{"error":"Perfil informado não existe"}')).toBe(ERRO_GENERICO_CRIACAO);
    expect(mapearErroCriacaoUsuario(null, '{"message":"debug_secret=EXEMPLO_FICTICIO"}')).toBe(ERRO_GENERICO_CRIACAO);
    expect(mapearErroCriacaoUsuario({ message: "debug_secret=EXEMPLO_FICTICIO" })).toBe(ERRO_GENERICO_CRIACAO);
  });

  it("nunca expõe SQL ou segredos", () => {
    const sql = '{"error":"duplicate key value violates unique constraint \\"profiles_pkey\\" INSERT INTO profiles"}';
    expect(mapearErroCriacaoUsuario(null, sql)).toBe(ERRO_GENERICO_CRIACAO);
    expect(mapearErroCriacaoUsuario(null, '{"error":"jwt malformed token abc"}')).toBe(ERRO_GENERICO_CRIACAO);
  });

  it("cai no genérico com corpo não-JSON ou vazio", () => {
    expect(mapearErroCriacaoUsuario(null, "<html>erro</html>")).toBe(ERRO_GENERICO_CRIACAO);
    expect(mapearErroCriacaoUsuario(null, undefined)).toBe(ERRO_GENERICO_CRIACAO);
    expect(mapearErroCriacaoUsuario(new Error("Edge Function returned a non-2xx status code"))).toBe(
      ERRO_GENERICO_CRIACAO,
    );
  });

  it("fallback orienta verificar o cadastro, sem sugerir reenvio cego", () => {
    expect(ERRO_GENERICO_CRIACAO).toMatch(/verifique/i);
    expect(ERRO_GENERICO_CRIACAO).toMatch(/lista de usuários/i);
  });


  it("lê o corpo do FunctionsHttpError", async () => {
    const erro = { context: { text: async () => '{"code":"nao_autorizado"}' } };
    const corpo = await lerCorpoErroFuncao(erro);
    expect(mapearErroCriacaoUsuario(erro, corpo)).toMatch(/permissão/i);
  });

  it("tolera context que falha ao ler", async () => {
    const erro = { context: { text: async () => { throw new Error("boom"); } } };
    expect(await lerCorpoErroFuncao(erro)).toBeUndefined();
  });
});

describe("criacaoBemSucedida", () => {
  const uuid = "3f1c5e2a-8b4d-4c7a-9f10-2b6d7e8a1c34";
  it("aceita apenas success true com user_id válido", () => {
    expect(criacaoBemSucedida({ success: true, user_id: uuid })).toBe(true);
  });
  it("rejeita contratos incompletos", () => {
    expect(criacaoBemSucedida(null)).toBe(false);
    expect(criacaoBemSucedida({})).toBe(false);
    expect(criacaoBemSucedida({ success: true })).toBe(false);
    expect(criacaoBemSucedida({ success: "true", user_id: uuid })).toBe(false);
    expect(criacaoBemSucedida({ success: true, user_id: "123" })).toBe(false);
    expect(criacaoBemSucedida({ user_id: uuid })).toBe(false);
  });
});

describe("busca e paginação", () => {
  const usuarios = [
    { nome: "Ana", email: "ana@x.com" },
    { nome: "Bruno", email: "bruno@y.com" },
    { nome: null, email: "carlos@z.com" },
  ];
  it("faz trim e ignora maiúsculas", () => {
    expect(filtrarUsuariosPorBusca(usuarios, "  ANA ")).toHaveLength(1);
    expect(filtrarUsuariosPorBusca(usuarios, "   ")).toHaveLength(3);
    expect(filtrarUsuariosPorBusca(usuarios, "z.com")).toHaveLength(1);
  });
  it("pagina sem truncar silenciosamente", () => {
    const itens = Array.from({ length: 60 }, (_, i) => i);
    const p1 = paginar(itens, 1, 25);
    expect(p1.itens).toHaveLength(25);
    expect(p1.total).toBe(60);
    expect(p1.totalPaginas).toBe(3);
    const p3 = paginar(itens, 3, 25);
    expect(p3.itens).toHaveLength(10);
    expect(p3.fim).toBe(60);
    expect(paginar(itens, 99, 25).paginaAtual).toBe(3);
    expect(paginar([], 1, 25)).toMatchObject({ total: 0, totalPaginas: 1, inicio: 0 });
  });
});
