import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RPC_EDITAR_USUARIO,
  CLIENTE_IDS_MAX,
  construirProfilePayload,
  construirArgsEdicao,
  dedupClienteIds,
  validarLimiteClienteIds,
  resolverPrincipalClienteId,
  edicaoBemSucedida,
  mapearErroEdicaoUsuario,
  edicaoExigeRecargaAposErro,
  classificarErroRpcEdicao,
  erroLocalEdicao,
  erroAmbiguoEdicao,
  ErroEdicaoUsuario,
  MSG_EDICAO_NAO_CONFIRMADA,
  MSG_CLIENTES_ACIMA_DO_LIMITE,
} from "@/lib/configuracoes/edicaoUsuarioRpc";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const UUID_ALVO = "11111111-2222-3333-4444-555555555555";

describe("construirProfilePayload — payload completo do perfil", () => {
  it("envia TODOS os campos nome,telefone,cargo,cpf_cnpj,crea,especialidade", () => {
    const p = construirProfilePayload({
      nome: "  Maria Silva  ",
      telefone: "11987654321",
      cargo: "Agrônoma",
      cpf_cnpj: "12345678909",
      crea: "CREA-123",
      especialidade: "Fitossanidade",
    });
    expect(Object.keys(p).sort()).toEqual(
      ["cargo", "cpf_cnpj", "crea", "especialidade", "nome", "telefone"].sort(),
    );
    expect(p.nome).toBe("Maria Silva");
  });

  it("vazios/nulos viram null (omitidos são zerados no servidor) e nunca inclui email/ativo/senha/organization_id", () => {
    const p = construirProfilePayload({
      nome: "Maria Silva",
      telefone: "   ",
      cargo: null,
      cpf_cnpj: undefined,
      crea: "",
      especialidade: "  ",
    });
    expect(p).toEqual({
      nome: "Maria Silva",
      telefone: null,
      cargo: null,
      cpf_cnpj: null,
      crea: null,
      especialidade: null,
    });
    const chaves = Object.keys(construirProfilePayload({ nome: "x" } as any));
    expect(chaves).not.toContain("email");
    expect(chaves).not.toContain("ativo");
    expect(chaves).not.toContain("senha");
    expect(chaves).not.toContain("organization_id");
  });
});

describe("cliente_ids e principal", () => {
  it("deduplica preservando ordem", () => {
    expect(dedupClienteIds(["c", "a", "c", "", "a", "b"])).toEqual(["c", "a", "b"]);
  });

  it("principal marcado; senão o primeiro; null quando vazio", () => {
    const vinculos = [
      { cliente_id: "c1" },
      { cliente_id: "c2", principal: true },
      { cliente_id: "c3" },
    ];
    expect(resolverPrincipalClienteId(vinculos)).toBe("c2");
    expect(resolverPrincipalClienteId([{ cliente_id: "c9" }])).toBe("c9");
    expect(resolverPrincipalClienteId([])).toBeNull();
  });

  it("principal fora da lista cai para o primeiro", () => {
    const args = construirArgsEdicao({
      userId: UUID_ALVO,
      expectedUpdatedAt: "2026-09-22T00:00:00Z",
      profile: { nome: "Maria Silva" },
      roles: ["administrativo"],
      clienteIds: ["c1", "c2"],
      principalClienteId: "FORA-DA-LISTA",
      partnerId: null,
    });
    expect(args.p_principal_cliente_id).toBe("c1");
  });
});

describe("construirArgsEdicao — argumentos da RPC", () => {
  it("monta os 7 argumentos com a versão original e partner null sem papel B2B", () => {
    const args = construirArgsEdicao({
      userId: UUID_ALVO,
      expectedUpdatedAt: "2026-09-22T00:00:00Z",
      profile: { nome: "Maria Silva", telefone: "11987654321" },
      roles: ["administrativo", "administrativo"],
      clienteIds: ["c1", "c1", "c2"],
      partnerId: null,
    });
    expect(args).toEqual({
      p_user_id: UUID_ALVO,
      p_expected_updated_at: "2026-09-22T00:00:00Z",
      p_profile: expect.objectContaining({ nome: "Maria Silva", telefone: "11987654321" }),
      p_roles: ["administrativo"],
      p_cliente_ids: ["c1", "c2"],
      p_principal_cliente_id: "c1",
      p_partner_id: null,
    });
  });

  it("roles canônicos preservados e sem duplicação", () => {
    const args = construirArgsEdicao({
      userId: UUID_ALVO,
      expectedUpdatedAt: null,
      profile: { nome: "Maria Silva" },
      roles: ["parceiro_b2b", "financeiro", "parceiro_b2b"],
      clienteIds: [],
      partnerId: "p1",
    });
    expect(args.p_roles).toEqual(["parceiro_b2b", "financeiro"]);
    expect(args.p_partner_id).toBe("p1");
    expect(args.p_cliente_ids).toEqual([]);
    expect(args.p_principal_cliente_id).toBeNull();
  });
});

describe("sucesso estrito", () => {
  const ok = { success: true, user_id: UUID_ALVO, updated_at: "2026-09-22T00:30:00Z" };

  it("aceita success===true, user_id do alvo e updated_at válido", () => {
    expect(edicaoBemSucedida(ok, UUID_ALVO)).toBe(true);
  });

  it("rejeita user_id divergente, success ausente ou updated_at inválido", () => {
    expect(edicaoBemSucedida({ ...ok, user_id: "99999999-2222-3333-4444-555555555555" }, UUID_ALVO)).toBe(false);
    expect(edicaoBemSucedida({ ...ok, success: "true" }, UUID_ALVO)).toBe(false);
    expect(edicaoBemSucedida({ ...ok, updated_at: "não-é-data" }, UUID_ALVO)).toBe(false);
    expect(edicaoBemSucedida(null, UUID_ALVO)).toBe(false);
  });
});

describe("mapearErroEdicaoUsuario — mensagens seguras", () => {
  const casos: Array<[string, RegExp]> = [
    ["user_edit_forbidden", /não tem permissão/i],
    ["user_edit_self_admin_removal", /próprio perfil de Administrador/i],
    ["user_edit_conflict", /alterado por outra pessoa/i],
    ["user_edit_not_found", /não encontrado/i],
    ["user_edit_invalid_input", /Dados inválidos/i],
    ["user_edit_invalid_name", /2 a 150/i],
    ["user_edit_invalid_phone", /10 ou 11 dígitos/i],
    ["user_edit_invalid_roles", /perfil de acesso inválido/i],
    ["user_edit_invalid_clients", /vínculo de cliente inválido/i],
    ["user_edit_invalid_principal", /cliente principal/i],
    ["user_edit_field_too_long", /tamanho máximo/i],
    ["user_edit_producer_requires_client", /pelo menos um cliente/i],
    ["user_edit_conflicting_partner_roles", /apenas um perfil de Parceiro/i],
    ["user_edit_invalid_partner", /parceiro B2B válido/i],
    ["user_edit_client_not_found", /não foi encontrado/i],
    ["user_edit_partner_unavailable", /não está disponível/i],
  ];

  it.each(casos)("%s → mensagem segura em português", (token, re) => {
    expect(mapearErroEdicaoUsuario({ code: "42501", message: token })).toMatch(re);
  });

  it("extrai o token de mensagens compostas com detalhes internos", () => {
    expect(
      mapearErroEdicaoUsuario({
        code: "40001",
        message: 'new row violates user_edit_conflict ao aplicar "detalhe"',
      }),
    ).toMatch(/alterado por outra pessoa/i);
  });

  it("erro desconhecido NUNCA mostra texto cru — informa não confirmado e pede recarga", () => {
    const cru = "function public.secreta() does not exist /var/stack trace CNPJ 123";
    expect(mapearErroEdicaoUsuario(new Error(cru))).toBe(MSG_EDICAO_NAO_CONFIRMADA);
    expect(mapearErroEdicaoUsuario({ message: cru, details: cru, hint: cru })).toBe(
      MSG_EDICAO_NAO_CONFIRMADA,
    );
    expect(mapearErroEdicaoUsuario({ message: "user_edit_algo_novo_desconhecido" })).toBe(
      MSG_EDICAO_NAO_CONFIRMADA,
    );
  });

  it("recarga exigida apenas para conflito e estado incerto — sem retry automático", () => {
    expect(edicaoExigeRecargaAposErro({ message: "user_edit_conflict" })).toBe(true);
    expect(edicaoExigeRecargaAposErro(new Error("fetch failed"))).toBe(true);
    expect(edicaoExigeRecargaAposErro({ message: "user_edit_invalid_phone" })).toBe(false);
  });
});

describe("integração Configuracoes.tsx — um único caminho de escrita (RPC)", () => {
  const src = read("src/pages/Configuracoes.tsx");
  const inicio = src.indexOf("const saveEditUser");
  const fim = src.indexOf("const senhaForte");
  const blocoSalvar = inicio >= 0 && fim > inicio ? src.slice(inicio, fim) : "";

  it("sem syncUserRolesAndPartner nem fallback de escrita direta no fluxo de edição", () => {
    expect(src).not.toContain("syncUserRolesAndPartner");
    expect(src).not.toMatch(/from\("user_roles"\)\s*\.\s*(insert|delete)/);
    expect(src).not.toMatch(/from\("user_clientes"\)\s*\.\s*(insert|update|delete)/);
    expect(src).not.toMatch(/from\("partner_users"\)\s*\.\s*(insert|update|delete)/);
    // O fluxo de edição não faz escrita direta em profiles (status próprio é outro fluxo):
    expect(blocoSalvar.length).toBeGreaterThan(0);
    expect(blocoSalvar).not.toContain(".from(");
  });

  it("chama exatamente a RPC com a versão original capturada e sucesso estrito", () => {
    expect(blocoSalvar).toContain("rpc(RPC_EDITAR_USUARIO");
    expect(blocoSalvar).toContain("expectedUpdatedAt: editUser.updated_at");
    expect(blocoSalvar).toContain("edicaoBemSucedida");
    expect(blocoSalvar).toContain("classificarErroRpcEdicao");
    expect(blocoSalvar).toContain("retry: false");
    expect(src).toContain('broadcastPortalEvent({ type: "roles_updated"');
    expect(src).toContain('queryKey: ["admin-users"]');
    expect(src).toContain('queryKey: ["partner-users-links"]');
  });

  it("sem usuário em edição lança erro local (nunca cai em onSuccess) e onError não remapeia", () => {
    expect(blocoSalvar).toMatch(/if \(!editUser\) throw erroLocalEdicao\(/);
    expect(blocoSalvar).not.toMatch(/if \(!editUser\) return/);
    const onError = blocoSalvar.slice(blocoSalvar.indexOf("onError:"));
    expect(onError).toContain("classificarErroRpcEdicao");
    expect(onError).not.toContain("mapearErroEdicaoUsuario");
    expect(onError).not.toContain("edicaoExigeRecargaAposErro");
    // a mutation nunca lança Error cru com texto do servidor
    expect(blocoSalvar).not.toContain("throw new Error(");
  });

  it("valida o limite de clientes antes da RPC, sem truncar", () => {
    expect(blocoSalvar).toContain("validarLimiteClienteIds");
  });

  it("consulta de usuários inclui updated_at e o salvamento não refaz fetch antes de salvar", () => {
    expect(src).toContain('rpc("tenant_admin_list_users"');
    expect(src).toContain("user_id e updated_at");
    expect(blocoSalvar).not.toContain("refetchUsers");
  });
});

describe("limite de clientes vinculados — nunca truncar", () => {
  const ids = (n: number, p = "c") => Array.from({ length: n }, (_, i) => `${p}${i}`);

  it("100 únicos são aceitos integralmente", () => {
    const cem = ids(CLIENTE_IDS_MAX);
    expect(dedupClienteIds(cem)).toHaveLength(CLIENTE_IDS_MAX);
    expect(validarLimiteClienteIds(cem)).toBeNull();
  });

  it("101 únicos são rejeitados localmente, sem perder IDs silenciosamente", () => {
    const cento1 = ids(CLIENTE_IDS_MAX + 1);
    expect(dedupClienteIds(cento1)).toHaveLength(CLIENTE_IDS_MAX + 1);
    expect(validarLimiteClienteIds(cento1)).toBe(MSG_CLIENTES_ACIMA_DO_LIMITE);
    expect(MSG_CLIENTES_ACIMA_DO_LIMITE).toMatch(/máximo 100/i);
  });

  it("duplicados acima de 100 no bruto, mas 100 únicos, continuam válidos", () => {
    const comDuplicados = [...ids(CLIENTE_IDS_MAX), ...ids(20)];
    expect(dedupClienteIds(comDuplicados)).toHaveLength(CLIENTE_IDS_MAX);
    expect(validarLimiteClienteIds(comDuplicados)).toBeNull();
  });

  it("construirArgsEdicao envia todos os IDs únicos sem corte", () => {
    const args = construirArgsEdicao({
      userId: UUID_ALVO,
      expectedUpdatedAt: "2026-09-22T00:00:00Z",
      profile: { nome: "Maria Silva" },
      roles: ["administrativo"],
      clienteIds: ids(CLIENTE_IDS_MAX + 1),
    });
    expect((args.p_cliente_ids as string[]).length).toBe(CLIENTE_IDS_MAX + 1);
  });
});

describe("sucesso estrito — UUID e timestamptz reais", () => {
  const base = { success: true, user_id: UUID_ALVO, updated_at: "2026-09-22T00:30:00.123456+00:00" };

  it("aceita timestamptz com fração e offset", () => {
    expect(edicaoBemSucedida(base, UUID_ALVO)).toBe(true);
    expect(edicaoBemSucedida({ ...base, updated_at: "2026-09-22T00:30:00Z" }, UUID_ALVO)).toBe(true);
    expect(edicaoBemSucedida({ ...base, updated_at: "2026-09-22 00:30:00-03" }, UUID_ALVO)).toBe(true);
  });

  it("rejeita UUID inválido no retorno e no alvo", () => {
    expect(edicaoBemSucedida({ ...base, user_id: "nao-e-uuid" }, UUID_ALVO)).toBe(false);
    expect(edicaoBemSucedida({ ...base, user_id: "nao-e-uuid" }, "nao-e-uuid")).toBe(false);
  });

  it('rejeita timestamp não ISO como "1", "2026" ou texto solto', () => {
    for (const ts of ["1", "2026", "ontem", "22/09/2026", ""]) {
      expect(edicaoBemSucedida({ ...base, updated_at: ts }, UUID_ALVO)).toBe(false);
    }
  });
});

describe("classificação única ponta a ponta (mutationFn → onError)", () => {
  /** Simula o trajeto real: mutationFn lança; onError apenas classifica uma vez. */
  const trajeto = (lancar: () => never) => {
    try {
      lancar();
    } catch (e) {
      const erro = classificarErroRpcEdicao(e);
      return { mensagem: erro.message, codigo: erro.codigo, recarga: erro.exigeRecarga };
    }
    throw new Error("deveria ter lançado");
  };

  const locais: Array<[string, string]> = [
    ["nome", "Informe o nome completo (de 2 a 150 caracteres)."],
    ["telefone", "Telefone deve ter 10 ou 11 dígitos."],
    ["perfis", "Selecione ao menos um perfil de acesso."],
    ["clientes", MSG_CLIENTES_ACIMA_DO_LIMITE],
    ["parceiro", "Selecione o parceiro B2B do usuário."],
  ];

  it.each(locais)("validação local de %s preserva a mensagem específica e não exige recarga", (_c, msg) => {
    const r = trajeto(() => { throw erroLocalEdicao(msg); });
    expect(r.mensagem).toBe(msg);
    expect(r.codigo).toBe("local_validation");
    expect(r.recarga).toBe(false);
  });

  it("erro conhecido da RPC (forbidden) mantém a mensagem específica, sem recarga", () => {
    const r = trajeto(() => {
      throw classificarErroRpcEdicao({ code: "42501", message: "user_edit_forbidden" });
    });
    expect(r.mensagem).toMatch(/não tem permissão/i);
    expect(r.codigo).toBe("user_edit_forbidden");
    expect(r.recarga).toBe(false);
  });

  it("invalid_phone da RPC continua específico após re-classificação (idempotente)", () => {
    const uma = classificarErroRpcEdicao({ code: "22023", message: "user_edit_invalid_phone" });
    const duas = classificarErroRpcEdicao(uma);
    expect(duas).toBe(uma);
    expect(duas.message).toMatch(/10 ou 11 dígitos/i);
    expect(duas.exigeRecarga).toBe(false);
  });

  it("conflito exige recarga e preserva o token", () => {
    const r = trajeto(() => {
      throw classificarErroRpcEdicao({ code: "40001", message: "user_edit_conflict" });
    });
    expect(r.codigo).toBe("user_edit_conflict");
    expect(r.recarga).toBe(true);
  });

  it("timeout/rede vira estado ambíguo com recarga e sem texto cru", () => {
    const cru = "TypeError: fetch failed ECONNRESET /var/task/stack";
    const r = trajeto(() => { throw classificarErroRpcEdicao(new Error(cru)); });
    expect(r.mensagem).toBe(MSG_EDICAO_NAO_CONFIRMADA);
    expect(r.mensagem).not.toContain("fetch");
    expect(r.codigo).toBe("ambiguous_result");
    expect(r.recarga).toBe(true);
  });

  it("resposta inválida da RPC vira ambíguo explícito", () => {
    const r = trajeto(() => { throw erroAmbiguoEdicao(); });
    expect(r.mensagem).toBe(MSG_EDICAO_NAO_CONFIRMADA);
    expect(r.recarga).toBe(true);
    expect(erroAmbiguoEdicao()).toBeInstanceOf(ErroEdicaoUsuario);
  });

  it("mapearErroEdicaoUsuario reflete a mesma classificação", () => {
    expect(mapearErroEdicaoUsuario(erroLocalEdicao("Telefone inválido: informe 10 ou 11 dígitos."))).toBe(
      "Telefone inválido: informe 10 ou 11 dígitos.",
    );
    expect(edicaoExigeRecargaAposErro(erroLocalEdicao("qualquer coisa local"))).toBe(false);
  });
});
