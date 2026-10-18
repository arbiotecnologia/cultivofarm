/**
 * Contrato das RPCs de listagem e status de usuários (Configurações › Usuários).
 *
 * `tenant_admin_list_users` e `tenant_admin_set_user_active` não constam do schema
 * gerado; por isso usamos interfaces estreitas de cliente (sem `as never`/`as any`
 * soltos) e validação estrita do retorno. Este módulo é puro/testável: recebe o
 * cliente por injeção e nunca importa o cliente canônico.
 */

export const RPC_LISTAR_USUARIOS = "tenant_admin_list_users";
export const RPC_STATUS_USUARIO = "tenant_admin_set_user_active";

export interface UsuarioListado {
  user_id: string;
  nome?: string | null;
  email?: string | null;
  roles?: string[] | null;
  ativo?: boolean | null;
  updated_at?: string | null;
  [campo: string]: unknown;
}

export interface PaginaUsuarios {
  items: UsuarioListado[];
  total: number;
}

export interface ArgsListagemUsuarios {
  p_search: string | null;
  p_role: string | null;
  p_active: boolean | null;
  p_offset: number;
  p_limit: number;
}

/** Monta os argumentos da listagem a partir dos filtros da tela (sem estado React). */
export function montarArgsListagem(input: {
  search: string;
  role: string;
  status: string;
  pagina: number;
  porPagina: number;
}): ArgsListagemUsuarios {
  const pagina = Number.isInteger(input.pagina) && input.pagina >= 1 ? input.pagina : 1;
  const porPagina = Number.isInteger(input.porPagina) && input.porPagina >= 1 ? input.porPagina : 1;
  return {
    p_search: input.search.trim() || null,
    p_role: input.role === "all" ? null : input.role,
    p_active: input.status === "all" ? null : input.status === "ativo",
    p_offset: (pagina - 1) * porPagina,
    p_limit: porPagina,
  };
}

interface ListUsersRpcClient {
  rpc(fn: typeof RPC_LISTAR_USUARIOS, args: ArgsListagemUsuarios): PromiseLike<{ data: unknown; error: unknown }>;
}

/** Executa a listagem e valida o envelope { items: unknown[], total: number }. */
export async function carregarUsuariosAdmin(client: ListUsersRpcClient, args: ArgsListagemUsuarios): Promise<PaginaUsuarios> {
  const { data, error } = await client.rpc(RPC_LISTAR_USUARIOS, args);
  // Não mascaramos o erro: o detalhe real chega à tela.
  if (error) throw error;
  const payload = (data ?? {}) as { items?: unknown; total?: unknown };
  if (!Array.isArray(payload.items)) throw new Error("Resposta da listagem de usuários inválida.");
  return { items: payload.items as UsuarioListado[], total: Number(payload.total ?? 0) };
}

interface SetActiveRpcClient {
  rpc(fn: typeof RPC_STATUS_USUARIO, args: { p_user_id: string; p_active: boolean }): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Ativa OU desativa via a mesma RPC transacional — a reativação usa exatamente o
 * mesmo fluxo/confirmação server-side da desativação (não há caminho alternativo).
 */
export async function definirStatusUsuario(client: SetActiveRpcClient, userId: string, ativo: boolean): Promise<void> {
  const { data, error } = await client.rpc(RPC_STATUS_USUARIO, { p_user_id: userId, p_active: ativo });
  if (error) throw error;
  const row = (data ?? {}) as { success?: unknown; user_id?: unknown };
  if (row.success !== true || row.user_id !== userId) {
    throw new Error("Não foi possível confirmar a atualização do status.");
  }
}

/**
 * placeholderData seguro: reutiliza a página anterior SOMENTE quando a consulta é
 * exatamente a mesma (mesmo escopo identidade+tenant e mesmos filtros/página).
 * Assim, uma recarga da mesma consulta nunca "esvazia" a lista, mas trocar filtro,
 * página, tenant ou sessão nunca exibe registros desatualizados de outra consulta.
 */
export function placeholderMesmaConsulta<T>(prev: T | undefined, prevQueryKey: readonly unknown[] | undefined, currentKey: readonly unknown[]): T | undefined {
  if (!prevQueryKey) return undefined;
  if (prevQueryKey.length !== currentKey.length) return undefined;
  for (let i = 0; i < currentKey.length; i++) {
    if (JSON.stringify(prevQueryKey[i]) !== JSON.stringify(currentKey[i])) return undefined;
  }
  return prev;
}
