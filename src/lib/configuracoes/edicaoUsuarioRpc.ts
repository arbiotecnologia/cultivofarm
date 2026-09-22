/**
 * Contrato da RPC `public.admin_edit_user_profile_v1` (edição pontual de Usuários).
 *
 * A RPC é SECURITY INVOKER, transacional e exige:
 *   p_user_id uuid, p_expected_updated_at timestamptz (versão original capturada ao abrir o
 *   diálogo), p_profile jsonb (TODOS os campos; omitidos são zerados), p_roles app_role[],
 *   p_cliente_ids uuid[] (único, até 100), p_principal_cliente_id uuid nullable,
 *   p_partner_id uuid nullable (somente quando há papel B2B).
 *
 * Retorno de sucesso estrito: { success: true, user_id, updated_at }.
 * Este módulo é puro — sem rede, banco ou estado global — para ser testável em Vitest.
 */

export const RPC_EDITAR_USUARIO = "admin_edit_user_profile_v1";

export interface PerfilEdicaoPayload {
  nome: string;
  telefone: string | null;
  cargo: string | null;
  cpf_cnpj: string | null;
  crea: string | null;
  especialidade: string | null;
}

export interface ArgsEdicaoUsuario {
  userId: string;
  /** Versão original da linha, capturada ao abrir o diálogo (nunca refeito antes de salvar). */
  expectedUpdatedAt: string | null | undefined;
  profile: {
    nome?: string | null;
    telefone?: string | null;
    cargo?: string | null;
    cpf_cnpj?: string | null;
    crea?: string | null;
    especialidade?: string | null;
  };
  roles: string[];
  clienteIds: string[];
  /** Cliente marcado como principal; se não marcado, usa o primeiro da lista. */
  principalClienteId?: string | null;
  /** Somente quando a seleção inclui papel B2B; caso contrário deve ser null. */
  partnerId?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENTE_IDS_MAX = 100;

/** Trim seguro: string vazia/só espaços/null → null. Campos vazios são zerados pela RPC. */
export function textoOuNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Payload completo do perfil: TODOS os campos são enviados (omitidos seriam zerados no servidor).
 * Nunca inclui email, ativo, senha ou organization_id (fluxo de criação/status/senha permanecem separados).
 */
export function construirProfilePayload(profile: ArgsEdicaoUsuario["profile"]): PerfilEdicaoPayload {
  return {
    nome: textoOuNull(profile.nome) ?? "",
    telefone: textoOuNull(profile.telefone),
    cargo: textoOuNull(profile.cargo),
    cpf_cnpj: textoOuNull(profile.cpf_cnpj),
    crea: textoOuNull(profile.crea),
    especialidade: textoOuNull(profile.especialidade),
  };
}

/** Remove duplicatas preservando a ordem; a RPC rejeita acima de 100. */
export function dedupClienteIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids ?? []) {
    if (typeof id === "string" && id && !out.includes(id)) out.push(id);
  }
  return out.slice(0, CLIENTE_IDS_MAX);
}

/** Principal: o marcado, se pertencer à lista; caso contrário o primeiro; null se vazio. */
export function resolverPrincipalClienteId(
  vinculos: Array<{ cliente_id: string; principal?: boolean }>,
): string | null {
  if (!vinculos?.length) return null;
  const ids = vinculos.map((v) => v.cliente_id);
  const marcado = vinculos.find((v) => v.principal);
  return (marcado && ids.includes(marcado.cliente_id) ? marcado.cliente_id : ids[0]) ?? null;
}

/** Monta os argumentos exatos da RPC a partir do estado do diálogo. */
export function construirArgsEdicao(a: ArgsEdicaoUsuario): Record<string, unknown> {
  const cliente_ids = dedupClienteIds(a.clienteIds);
  const principal =
    a.principalClienteId && cliente_ids.includes(a.principalClienteId)
      ? a.principalClienteId
      : (cliente_ids[0] ?? null);
  return {
    p_user_id: a.userId,
    p_expected_updated_at: a.expectedUpdatedAt ?? null,
    p_profile: construirProfilePayload(a.profile),
    p_roles: Array.from(new Set(a.roles ?? [])),
    p_cliente_ids: cliente_ids,
    p_principal_cliente_id: principal,
    p_partner_id: a.partnerId ?? null,
  };
}

/**
 * Sucesso SÓ quando a RPC devolve explicitamente success===true, o user_id do alvo
 * e um updated_at válido (optimestamp). Qualquer outra forma é estado ambíguo.
 */
export function edicaoBemSucedida(data: unknown, expectedUserId: string): boolean {
  const d = data as any;
  return (
    !!d &&
    typeof d === "object" &&
    d.success === true &&
    typeof d.user_id === "string" &&
    d.user_id === expectedUserId &&
    typeof d.updated_at === "string" &&
    !Number.isNaN(Date.parse(d.updated_at))
  );
}

/** Estado ambíguo (falha de rede / resposta inválida): NÃO afirmar que nada foi salvo. */
export const MSG_EDICAO_NAO_CONFIRMADA =
  "Não foi possível confirmar se a alteração foi salva. Recarregue a lista de usuários e confira os dados antes de tentar novamente.";

/**
 * Allowlist estrita de erros conhecidos da RPC (prefixo user_edit_).
 * Mensagens desconhecidas NUNCA são exibidas cruas.
 */
const MENSAGENS_ERRO_EDICAO: Record<string, string> = {
  user_edit_forbidden: "Você não tem permissão para editar este usuário.",
  user_edit_self_admin_removal:
    "Você não pode retirar o seu próprio perfil de Administrador. Peça a outro administrador.",
  user_edit_conflict:
    "Este usuário foi alterado por outra pessoa. Recarregue a lista e confira os dados antes de tentar novamente.",
  user_edit_not_found: "Usuário não encontrado. Recarregue a lista de usuários.",
  user_edit_invalid_input: "Dados inválidos. Confira os campos destacados e tente novamente.",
  user_edit_invalid_fields: "Dados inválidos. Confira os campos destacados e tente novamente.",
  user_edit_invalid_name: "Informe o nome completo (de 2 a 150 caracteres).",
  user_edit_invalid_phone: "Telefone inválido: informe 10 ou 11 dígitos.",
  user_edit_invalid_roles: "Há perfil de acesso inválido na seleção.",
  user_edit_invalid_clients: "Há vínculo de cliente inválido na seleção.",
  user_edit_invalid_principal: "O cliente principal deve estar entre os clientes vinculados.",
  user_edit_field_too_long: "Algum campo excede o tamanho máximo permitido.",
  user_edit_producer_requires_client: "Vincule pelo menos um cliente para o perfil Produtor.",
  user_edit_conflicting_partner_roles:
    "Escolha apenas um perfil de Parceiro B2B: Gestor ou Técnico.",
  user_edit_invalid_partner: "Selecione um parceiro B2B válido.",
  user_edit_client_not_found:
    "Algum cliente vinculado não foi encontrado. Recarregue a lista e tente novamente.",
  user_edit_partner_unavailable: "O parceiro B2B informado não está disponível.",
};

const TOKEN_ERRO_EDICAO = /user_edit_[a-z0-9_]+/g;

/**
 * Mapeia um erro da RPC (PostgrestError ou qualquer exceção) para mensagem segura em português.
 * Token conhecido → mensagem fixa; qualquer outra coisa → estado ambíguo (pede recarga),
 * sem vazar texto cru do servidor, stack ou detalhes internos.
 */
export function mapearErroEdicaoUsuario(erro: unknown): string {
  const partes: string[] = [];
  if (typeof erro === "string") partes.push(erro);
  else if (erro && typeof erro === "object") {
    const e = erro as any;
    for (const k of ["message", "details", "hint", "code", "error_code"]) {
      if (typeof e[k] === "string") partes.push(e[k]);
    }
  }
  const tokens = partes.join(" ").match(TOKEN_ERRO_EDICAO) ?? [];
  for (const t of tokens) {
    const msg = MENSAGENS_ERRO_EDICAO[t];
    if (msg) return msg;
  }
  return MSG_EDICAO_NAO_CONFIRMADA;
}

/**
 * Conflito (outra pessoa salvou) e estado ambíguo exigem recarregar a lista
 * e reabrir o diálogo (nova versão original) antes de tentar novamente — sem retry automático.
 */
export function edicaoExigeRecargaAposErro(erro: unknown): boolean {
  const msg = mapearErroEdicaoUsuario(erro);
  return (
    msg === MSG_EDICAO_NAO_CONFIRMADA || msg === MENSAGENS_ERRO_EDICAO.user_edit_conflict
  );
}
