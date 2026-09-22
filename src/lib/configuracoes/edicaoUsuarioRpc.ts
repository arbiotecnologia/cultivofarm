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
/** timestamptz do Postgres/Supabase: ISO-8601 com fração opcional e offset opcional. */
const TIMESTAMPTZ_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;
export const CLIENTE_IDS_MAX = 100;

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

/**
 * Remove duplicatas preservando a ordem. NUNCA trunca: perder vínculo silenciosamente
 * é inaceitável. O excesso acima de CLIENTE_IDS_MAX é rejeitado antes da RPC
 * (ver `validarLimiteClienteIds`).
 */
export function dedupClienteIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids ?? []) {
    if (typeof id === "string" && id && !out.includes(id)) out.push(id);
  }
  return out;
}

export const MSG_CLIENTES_ACIMA_DO_LIMITE = `Selecione no máximo ${CLIENTE_IDS_MAX} clientes vinculados. Remova os excedentes e tente novamente.`;

/** Erro local claro quando a seleção única excede o limite aceito pela RPC. */
export function validarLimiteClienteIds(ids: string[]): string | null {
  return dedupClienteIds(ids).length > CLIENTE_IDS_MAX ? MSG_CLIENTES_ACIMA_DO_LIMITE : null;
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
 * (UUID válido) e um updated_at em formato timestamptz real. Qualquer outra forma é
 * estado ambíguo — `Date.parse("1")` não pode ser aceito como timestamp.
 */
export function edicaoBemSucedida(data: unknown, expectedUserId: string): boolean {
  const d = data as any;
  return (
    !!d &&
    typeof d === "object" &&
    d.success === true &&
    typeof d.user_id === "string" &&
    UUID_RE.test(d.user_id) &&
    UUID_RE.test(expectedUserId ?? "") &&
    d.user_id.toLowerCase() === String(expectedUserId).toLowerCase() &&
    typeof d.updated_at === "string" &&
    TIMESTAMPTZ_RE.test(d.updated_at.trim()) &&
    !Number.isNaN(Date.parse(d.updated_at.trim()))
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
  // Papel de plataforma SaaS: reservado, fora do alcance do administrador de empresa.
  user_edit_superadmin_forbidden:
    "O perfil de plataforma não pode ser atribuído nem removido por um administrador de empresa.",
  user_edit_superadmin_target:
    "Este usuário é de plataforma e não pode ser editado por um administrador de empresa.",

  // Proteção do último administrador ativo (servidor, SQLSTATE PT409).
  user_last_active_admin:
    "Não é possível remover ou desativar o último administrador ativo. Mantenha outro administrador ativo antes de continuar.",
};

/** Mensagem segura da proteção do último administrador ativo (edição e status). */
export const MSG_ULTIMO_ADMIN_ATIVO = MENSAGENS_ERRO_EDICAO.user_last_active_admin;

const TOKEN_ERRO_EDICAO = /user_edit_[a-z0-9_]+|user_last_active_admin/g;

/** Origem da falha, para classificação única ponta a ponta (mutationFn → onError). */
export type OrigemErroEdicao = "local" | "rpc" | "ambiguo";

/**
 * Erro tipado da edição de usuário: carrega mensagem SEGURA já classificada, o código
 * (token allowlist da RPC ou `local_validation`) e se exige recarga. A mutation lança
 * SEMPRE esta classe; o onError apenas lê — sem remapear e sem perder o token original.
 */
export class ErroEdicaoUsuario extends Error {
  readonly origem: OrigemErroEdicao;
  readonly codigo: string;
  readonly exigeRecarga: boolean;

  constructor(mensagem: string, origem: OrigemErroEdicao, codigo: string, exigeRecarga: boolean) {
    super(mensagem);
    this.name = "ErroEdicaoUsuario";
    this.origem = origem;
    this.codigo = codigo;
    this.exigeRecarga = exigeRecarga;
  }
}

/** Falha de validação local (mensagem já é segura e específica): não exige recarga. */
export function erroLocalEdicao(mensagem: string): ErroEdicaoUsuario {
  return new ErroEdicaoUsuario(mensagem, "local", "local_validation", false);
}

/** Estado ambíguo explícito (resposta inválida da RPC, rede, timeout): exige recarga. */
export function erroAmbiguoEdicao(): ErroEdicaoUsuario {
  return new ErroEdicaoUsuario(MSG_EDICAO_NAO_CONFIRMADA, "ambiguo", "ambiguous_result", true);
}

/**
 * Classificação ÚNICA do erro bruto da RPC: extrai o token da allowlist e devolve o erro
 * tipado com mensagem segura. Token desconhecido/ausente → estado ambíguo (pede recarga),
 * sem vazar texto cru do servidor, stack ou detalhes internos.
 */
export function classificarErroRpcEdicao(erro: unknown): ErroEdicaoUsuario {
  if (erro instanceof ErroEdicaoUsuario) return erro;
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
    if (msg) return new ErroEdicaoUsuario(msg, "rpc", t, t === "user_edit_conflict");
  }
  return erroAmbiguoEdicao();
}

/**
 * Mensagem final exibida ao usuário. Erros já classificados preservam a mensagem
 * específica (inclusive validações locais); o resto passa pela allowlist.
 */
export function mapearErroEdicaoUsuario(erro: unknown): string {
  return classificarErroRpcEdicao(erro).message;
}

/**
 * Conflito (outra pessoa salvou) e estado ambíguo exigem recarregar a lista
 * e reabrir o diálogo (nova versão original) antes de tentar novamente — sem retry automático.
 * Validações locais e erros conhecidos de dados NÃO exigem recarga.
 */
export function edicaoExigeRecargaAposErro(erro: unknown): boolean {
  return classificarErroRpcEdicao(erro).exigeRecarga;
}

/** Prazo máximo da edição de usuário (cobre pré-fetch/auth + RPC). */
export const DEADLINE_EDICAO_MS = 20_000;

export interface DeadlineEdicaoOpcoes {
  timeoutMs?: number;
  /** Injetável em teste; por padrão setTimeout/clearTimeout. */
  agendar?: (cb: () => void, ms: number) => unknown;
  cancelar?: (handle: unknown) => void;
}

/**
 * Executa a operação de edição com prazo rígido. O relógio cobre TODA a promise
 * (inclusive espera por sessão/pré-fetch), aborta o request via AbortSignal quando
 * o executor souber usá-lo e rejeita com estado ambíguo (exige recarga, nunca afirma
 * rollback). Resolução/rejeição tardias são descartadas: não viram sucesso nem
 * unhandled rejection, e nenhuma escrita adicional é disparada.
 */
export function executarComDeadlineEdicao<T>(
  executor: (signal: AbortSignal | undefined) => Promise<T>,
  opcoes: DeadlineEdicaoOpcoes = {},
): Promise<T> {
  const ms = opcoes.timeoutMs ?? DEADLINE_EDICAO_MS;
  const agendar = opcoes.agendar ?? ((cb, t) => setTimeout(cb, t));
  const cancelar = opcoes.cancelar ?? ((h) => clearTimeout(h as any));
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;

  return new Promise<T>((resolve, reject) => {
    let liquidado = false;
    let handle: unknown;

    const finalizar = (fn: () => void) => {
      if (liquidado) return; // late resolve/reject é descartado
      liquidado = true;
      if (handle !== undefined) cancelar(handle);
      fn();
    };

    handle = agendar(() => {
      finalizar(() => {
        try {
          controller?.abort();
        } catch {
          /* abort best-effort */
        }
        reject(erroAmbiguoEdicao());
      });
    }, ms);

    let promessa: Promise<T>;
    try {
      promessa = Promise.resolve(executor(controller?.signal));
    } catch (e) {
      finalizar(() => reject(e));
      return;
    }
    promessa.then(
      (v) => finalizar(() => resolve(v)),
      (e) => finalizar(() => reject(e)),
    );
  });
}


/**
 * Erro de validação LOCAL do fluxo de status (autodesativação, zero linhas confirmadas).
 * A mensagem já é segura e específica, então é exibida como está.
 */
export class ErroStatusLocal extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroStatusLocal";
  }
}

/** Mensagem genérica de falha remota no toggle de status (nunca texto cru do servidor). */
export const MSG_STATUS_ERRO_GENERICO =
  "Não foi possível alterar o status do usuário. Recarregue a lista e tente novamente.";

/** Mensagem segura para falta de permissão ao alterar o status. */
export const MSG_STATUS_SEM_PERMISSAO =
  "Você não tem permissão para alterar o status deste usuário.";

/**
 * Mensagem segura do toggle de status. Validação local conhecida preserva o texto;
 * erro remoto vira mensagem específica (último administrador, permissão) ou genérica.
 * Nunca expõe SQL, detalhes internos ou `message` bruto do servidor.
 */
export function mapearErroStatusUsuario(erro: unknown): string {
  if (erro instanceof ErroStatusLocal) return erro.message;
  const partes: string[] = [];
  if (typeof erro === "string") partes.push(erro);
  else if (erro && typeof erro === "object") {
    const e = erro as any;
    for (const k of ["message", "details", "hint", "code", "error_code"]) {
      if (typeof e[k] === "string") partes.push(e[k]);
    }
  }
  const texto = partes.join(" ");
  if (/user_last_active_admin/.test(texto)) return MSG_ULTIMO_ADMIN_ATIVO;
  if (/\b42501\b|permission denied|row-level security/i.test(texto)) return MSG_STATUS_SEM_PERMISSAO;
  return MSG_STATUS_ERRO_GENERICO;
}
