import { describe, it, expect, vi } from "vitest";
import {
  RPC_LISTAR_USUARIOS,
  RPC_STATUS_USUARIO,
  montarArgsListagem,
  carregarUsuariosAdmin,
  definirStatusUsuario,
  placeholderMesmaConsulta,
} from "@/lib/configuracoes/usuariosListQuery";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function clientMock(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  return { rpc };
}

describe("montarArgsListagem", () => {
  it("filtro 'todos' envia p_active null", () => {
    const args = montarArgsListagem({ search: "", role: "all", status: "all", pagina: 1, porPagina: 10 });
    expect(args).toEqual({ p_search: null, p_role: null, p_active: null, p_offset: 0, p_limit: 10 });
  });
  it("filtro 'ativo' envia p_active true", () => {
    expect(montarArgsListagem({ search: "", role: "all", status: "ativo", pagina: 1, porPagina: 10 }).p_active).toBe(true);
  });
  it("filtro 'inativo' envia p_active false", () => {
    expect(montarArgsListagem({ search: "", role: "all", status: "inativo", pagina: 1, porPagina: 10 }).p_active).toBe(false);
  });
  it("paginação calcula offset correto e normaliza página inválida", () => {
    expect(montarArgsListagem({ search: "", role: "all", status: "all", pagina: 3, porPagina: 10 }).p_offset).toBe(20);
    expect(montarArgsListagem({ search: "", role: "all", status: "all", pagina: 0, porPagina: 10 }).p_offset).toBe(0);
  });
  it("busca é aparada e vazia vira null; papel 'all' vira null", () => {
    const args = montarArgsListagem({ search: "  maria  ", role: "gestor", status: "all", pagina: 1, porPagina: 10 });
    expect(args.p_search).toBe("maria");
    expect(args.p_role).toBe("gestor");
  });
});

describe("carregarUsuariosAdmin", () => {
  it("retorna items e total do envelope válido", async () => {
    const client = clientMock({ data: { items: [{ user_id: USER_A }], total: 1 } });
    const page = await carregarUsuariosAdmin(client, montarArgsListagem({ search: "", role: "all", status: "all", pagina: 1, porPagina: 10 }));
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
    expect(client.rpc).toHaveBeenCalledWith(RPC_LISTAR_USUARIOS, expect.objectContaining({ p_limit: 10 }));
  });
  it("propaga o erro real da RPC sem mascarar", async () => {
    const erro = { message: "permission denied for function tenant_admin_list_users", code: "42501" };
    const client = clientMock({ error: erro });
    await expect(
      carregarUsuariosAdmin(client, montarArgsListagem({ search: "", role: "all", status: "all", pagina: 1, porPagina: 10 })),
    ).rejects.toBe(erro);
  });
  it("rejeita envelope sem items (resposta inválida)", async () => {
    const client = clientMock({ data: { total: 5 } });
    await expect(
      carregarUsuariosAdmin(client, montarArgsListagem({ search: "", role: "all", status: "all", pagina: 1, porPagina: 10 })),
    ).rejects.toThrow(/inválida/);
  });
});

describe("definirStatusUsuario (desativar e reativar usam o MESMO fluxo)", () => {
  it("desativa com p_active false e confirma user_id", async () => {
    const client = clientMock({ data: { success: true, user_id: USER_A } });
    await definirStatusUsuario(client, USER_A, false);
    expect(client.rpc).toHaveBeenCalledWith(RPC_STATUS_USUARIO, { p_user_id: USER_A, p_active: false });
  });
  it("reativa com p_active true pela mesma RPC (sem caminho alternativo)", async () => {
    const client = clientMock({ data: { success: true, user_id: USER_A } });
    await definirStatusUsuario(client, USER_A, true);
    expect(client.rpc).toHaveBeenCalledWith(RPC_STATUS_USUARIO, { p_user_id: USER_A, p_active: true });
  });
  it("propaga erro da RPC", async () => {
    const erro = { message: "not allowed" };
    await expect(definirStatusUsuario(clientMock({ error: erro }), USER_A, true)).rejects.toBe(erro);
  });
  it("rejeita retorno ambíguo (success false ou user_id divergente)", async () => {
    await expect(definirStatusUsuario(clientMock({ data: { success: false, user_id: USER_A } }), USER_A, true)).rejects.toThrow(/confirmar/);
    await expect(definirStatusUsuario(clientMock({ data: { success: true, user_id: USER_B } }), USER_A, true)).rejects.toThrow(/confirmar/);
  });
});

describe("placeholderMesmaConsulta (cache não mostra registros de outra consulta)", () => {
  const pagina = { items: [{ user_id: USER_A }], total: 1 };
  const key = (org: string, usr: string, status: string, pag: number) => ["admin-users", org, usr, "", "all", status, pag];

  it("reutiliza dados na recarga da MESMA consulta", () => {
    expect(placeholderMesmaConsulta(pagina, key(ORG_A, USER_A, "all", 1), key(ORG_A, USER_A, "all", 1))).toBe(pagina);
  });
  it("NÃO reutiliza quando o filtro de status muda (ex.: após desativar, filtro 'inativos')", () => {
    expect(placeholderMesmaConsulta(pagina, key(ORG_A, USER_A, "all", 1), key(ORG_A, USER_A, "inativo", 1))).toBeUndefined();
  });
  it("NÃO reutiliza quando a página muda", () => {
    expect(placeholderMesmaConsulta(pagina, key(ORG_A, USER_A, "all", 1), key(ORG_A, USER_A, "all", 2))).toBeUndefined();
  });
  it("NÃO reutiliza quando o tenant muda", () => {
    expect(placeholderMesmaConsulta(pagina, key(ORG_A, USER_A, "all", 1), key(ORG_B, USER_A, "all", 1))).toBeUndefined();
  });
  it("NÃO reutiliza quando a sessão/usuário muda", () => {
    expect(placeholderMesmaConsulta(pagina, key(ORG_A, USER_A, "all", 1), key(ORG_A, USER_B, "all", 1))).toBeUndefined();
  });
  it("NÃO reutiliza sem consulta anterior", () => {
    expect(placeholderMesmaConsulta(pagina, undefined, key(ORG_A, USER_A, "all", 1))).toBeUndefined();
  });
});
