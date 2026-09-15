/**
 * Validação e mapeamento de erros da aba Configurações > Usuários.
 * Funções puras — sem acesso a rede, banco ou estado global.
 */
import { ACTIVE_ROLES } from "@/lib/permissions";



export type NovoUsuarioInput = {
  nome: string;
  email: string;
  password: string;
  roles: string[];
  partner_id?: string | null;
  cliente_ids?: string[];
};

export type CampoNovoUsuario = "nome" | "email" | "password" | "roles" | "partner_id" | "cliente_ids";

export type ErrosNovoUsuario = Partial<Record<CampoNovoUsuario, string>>;

export const ORDEM_CAMPOS_NOVO_USUARIO: CampoNovoUsuario[] = [
  "nome",
  "email",
  "password",
  "roles",
  "partner_id",
  "cliente_ids",
];

export const PARTNER_ROLES = ["parceiro_b2b", "parceiro_b2b_tecnico"] as const;

export const SENHA_MIN = 8;
export const SENHA_MAX = 128;
export const NOME_MIN = 2;
export const NOME_MAX = 150;
export const EMAIL_MAX = 254;

export const REGRA_SENHA = `A senha deve ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres, com ao menos uma letra e um número.`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Conjunto canônico de perfis aceitos (espelha `ACTIVE_ROLES`). */
export const PAPEIS_VALIDOS: ReadonlySet<string> = new Set(ACTIVE_ROLES as readonly string[]);

/** Mesma regra do servidor: 8–128, ao menos uma letra (inclusive acentuada) e um dígito. */
export function senhaValida(senha: string): boolean {
  const s = senha ?? "";
  return s.length >= SENHA_MIN && s.length <= SENHA_MAX && /[A-Za-zÀ-ÿ]/.test(s) && /[0-9]/.test(s);
}

export function temPapelParceiro(roles: string[]): boolean {
  return roles.some((r) => (PARTNER_ROLES as readonly string[]).includes(r));
}


export function validarNovoUsuario(input: NovoUsuarioInput): ErrosNovoUsuario {
  const erros: ErrosNovoUsuario = {};
  const nome = (input.nome ?? "").trim();
  const email = (input.email ?? "").trim();
  const senha = input.password ?? "";
  const roles = input.roles ?? [];
  const clienteIds = input.cliente_ids ?? [];

  if (nome.length < NOME_MIN || nome.length > NOME_MAX) {
    erros.nome = `Informe o nome completo (de ${NOME_MIN} a ${NOME_MAX} caracteres).`;
  }

  if (!email) erros.email = "Informe o e-mail.";
  else if (email.length > EMAIL_MAX) erros.email = `O e-mail deve ter no máximo ${EMAIL_MAX} caracteres.`;
  else if (!EMAIL_RE.test(email)) erros.email = "Informe um e-mail válido.";

  if (!senhaValida(senha)) {
    erros.password = REGRA_SENHA;
  }

  if (roles.length === 0) {
    erros.roles = "Selecione ao menos um perfil de acesso.";
  } else if (new Set(roles).size !== roles.length) {
    erros.roles = "Há perfis repetidos na seleção.";
  } else if (roles.some((r) => !PAPEIS_VALIDOS.has(r))) {
    erros.roles = "Há perfil de acesso inválido na seleção.";
  } else if (roles.includes("cliente_produtor") && roles.length > 1) {
    erros.roles = "O perfil Produtor não pode ser combinado com outros perfis.";
  } else if (roles.includes("parceiro_b2b") && roles.includes("parceiro_b2b_tecnico")) {
    erros.roles = "Escolha apenas um perfil de Parceiro B2B: Gestor ou Técnico.";
  }


  if (roles.includes("cliente_produtor") && clienteIds.length === 0) {
    erros.cliente_ids = "Vincule pelo menos um cliente para o perfil Produtor.";
  }

  if (temPapelParceiro(roles) && !input.partner_id) {
    erros.partner_id = "Selecione o parceiro B2B vinculado.";
  }

  return erros;
}

export function primeiroCampoInvalido(erros: ErrosNovoUsuario): CampoNovoUsuario | null {
  return ORDEM_CAMPOS_NOVO_USUARIO.find((c) => !!erros[c]) ?? null;
}

const MSG_EMAIL_DUPLICADO = "Já existe um usuário com este e-mail.";
const MSG_SEM_PERMISSAO = "Você não tem permissão para cadastrar usuários.";

/**
 * Allowlist ESTRITA: só códigos e mensagens conhecidas são exibidos.
 * Qualquer outro texto (inclusive vindo do servidor) cai no fallback seguro.
 */
const MENSAGENS_PERMITIDAS: Record<string, string> = {
  email_ja_cadastrado: MSG_EMAIL_DUPLICADO,
  email_exists: MSG_EMAIL_DUPLICADO,
  user_already_registered: MSG_EMAIL_DUPLICADO,
  email_address_already_registered: MSG_EMAIL_DUPLICADO,
  ja_existe_um_usuario_com_este_e_mail: MSG_EMAIL_DUPLICADO,
  senha_invalida: REGRA_SENHA,
  weak_password: REGRA_SENHA,
  a_senha_deve_ter_no_minimo_6_caracteres: REGRA_SENHA,
  perfil_obrigatorio: "Selecione ao menos um perfil de acesso.",
  perfil_invalido: "Há perfil de acesso inválido na seleção.",
  email_password_nome_e_ao_menos_um_perfil_sao_obrigatorios:
    "Preencha nome, e-mail, senha e ao menos um perfil de acesso.",
  parceiro_obrigatorio: "Selecione o parceiro B2B vinculado.",
  cliente_obrigatorio: "Vincule pelo menos um cliente para o perfil Produtor.",
  nao_autorizado: MSG_SEM_PERMISSAO,
  unauthorized: MSG_SEM_PERMISSAO,
  forbidden: MSG_SEM_PERMISSAO,
};

/**
 * Fallback de estado desconhecido: o cadastro pode ter sido criado parcialmente,
 * então NÃO recomendamos reenvio cego.
 */
export const ERRO_GENERICO_CRIACAO =
  "Não foi possível confirmar o cadastro. Verifique na lista de usuários se ele já foi criado antes de tentar novamente; se persistir, avise o suporte.";

/** Normaliza texto/código para casar com a allowlist (sem acentos, sem pontuação). */
function chaveNormalizada(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function mensagemSegura(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto) return null;
  return MENSAGENS_PERMITIDAS[chaveNormalizada(texto)] ?? null;
}


/**
 * Extrai uma mensagem exibível de um erro da Edge Function.
 * Faz parse seguro de `FunctionsHttpError.context` (Response com corpo JSON já lido em texto).
 */
export function mapearErroCriacaoUsuario(erro: unknown, corpoBruto?: unknown): string {
  const candidatos: unknown[] = [];

  const coletar = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    if (typeof obj.code === "string") candidatos.push(obj.code);
    if (typeof obj.error_code === "string") candidatos.push(obj.error_code);
    if (typeof obj.error === "string") candidatos.push(obj.error);
    if (obj.error && typeof obj.error === "object" && typeof obj.error.message === "string") {
      candidatos.push(obj.error.message);
    }
    if (typeof obj.message === "string") candidatos.push(obj.message);
  };

  if (typeof corpoBruto === "string") {
    try {
      coletar(JSON.parse(corpoBruto));
    } catch {
      candidatos.push(corpoBruto);
    }
  } else {
    coletar(corpoBruto);
  }

  coletar(erro as any);

  for (const c of candidatos) {
    const m = mensagemSegura(c);
    if (m) return m;
  }
  return ERRO_GENERICO_CRIACAO;
}

/** Lê com segurança o corpo de um FunctionsHttpError (context é uma Response). */
export async function lerCorpoErroFuncao(erro: unknown): Promise<unknown> {
  const ctx: any = (erro as any)?.context;
  if (!ctx) return undefined;
  if (typeof ctx.text === "function") {
    try {
      return await ctx.text();
    } catch {
      return undefined;
    }
  }
  return ctx;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sucesso só quando a função devolve explicitamente success===true e um user_id válido. */
export function criacaoBemSucedida(data: unknown): data is { success: true; user_id: string } {
  const d = data as any;
  return !!d && typeof d === "object" && d.success === true && typeof d.user_id === "string" && UUID_RE.test(d.user_id);
}

/** Busca por nome/email com trim e case-insensitive. */
export function filtrarUsuariosPorBusca<T extends { nome?: string | null; email?: string | null }>(
  usuarios: T[],
  termo: string,
): T[] {
  const s = (termo ?? "").trim().toLowerCase();
  if (!s) return usuarios;
  return usuarios.filter(
    (u) => (u.nome || "").toLowerCase().includes(s) || (u.email || "").toLowerCase().includes(s),
  );
}

export const USUARIOS_POR_PAGINA = 25;

export function paginar<T>(itens: T[], pagina: number, tamanho = USUARIOS_POR_PAGINA) {
  const total = itens.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
  const paginaAtual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (paginaAtual - 1) * tamanho;
  return {
    total,
    totalPaginas,
    paginaAtual,
    itens: itens.slice(inicio, inicio + tamanho),
    inicio: total === 0 ? 0 : inicio + 1,
    fim: Math.min(inicio + tamanho, total),
  };
}

/* ===================== Edição de usuário ===================== */

export type CampoEdicaoUsuario = "nome" | "telefone" | "roles" | "partner_id" | "cliente_ids";
export type ErrosEdicaoUsuario = Partial<Record<CampoEdicaoUsuario, string>>;

export const ORDEM_CAMPOS_EDICAO: CampoEdicaoUsuario[] = [
  "nome",
  "telefone",
  "roles",
  "partner_id",
  "cliente_ids",
];

export type EdicaoUsuarioInput = {
  nome: string;
  telefone?: string | null;
  roles: string[];
  partner_id?: string | null;
  cliente_ids?: string[];
};

/**
 * Valida TODOS os dados da edição ANTES da primeira escrita.
 * Senha não faz parte da edição comum (fluxo separado).
 * `validarTelefone` é injetado para manter esta função pura/testável.
 */
export function validarEdicaoUsuario(
  input: EdicaoUsuarioInput,
  validarTelefone?: (v: unknown) => { ok: true; value: string | null } | { ok: false; error: string },
): ErrosEdicaoUsuario {
  const erros: ErrosEdicaoUsuario = {};
  const nome = (input.nome ?? "").trim();
  const roles = input.roles ?? [];
  const clienteIds = input.cliente_ids ?? [];

  if (nome.length < NOME_MIN || nome.length > NOME_MAX) {
    erros.nome = `Informe o nome completo (de ${NOME_MIN} a ${NOME_MAX} caracteres).`;
  }

  if (validarTelefone) {
    const r = validarTelefone(input.telefone ?? "");
    if (!r.ok) erros.telefone = r.error;
  }

  if (roles.length === 0) {
    erros.roles = "Selecione ao menos um perfil de acesso.";
  } else if (new Set(roles).size !== roles.length) {
    erros.roles = "Há perfis repetidos na seleção.";
  } else if (roles.some((r) => !PAPEIS_VALIDOS.has(r))) {
    erros.roles = "Há perfil de acesso inválido na seleção.";
  } else if (roles.includes("cliente_produtor") && roles.length > 1) {
    erros.roles = "O perfil Produtor não pode ser combinado com outros perfis.";
  } else if (roles.includes("parceiro_b2b") && roles.includes("parceiro_b2b_tecnico")) {
    erros.roles = "Escolha apenas um perfil de Parceiro B2B: Gestor ou Técnico.";
  }

  if (roles.includes("cliente_produtor") && clienteIds.length === 0) {
    erros.cliente_ids = "Vincule pelo menos um cliente para o perfil Produtor.";
  }

  if (temPapelParceiro(roles) && !input.partner_id) {
    erros.partner_id = "Selecione o parceiro B2B vinculado.";
  }

  return erros;
}

export function primeiroCampoInvalidoEdicao(erros: ErrosEdicaoUsuario): CampoEdicaoUsuario | null {
  return ORDEM_CAMPOS_EDICAO.find((c) => !!erros[c]) ?? null;
}

/** Diferença de papéis: insere só os novos, remove só os retirados, preserva os comuns. */
export function diferencaPapeis(atuais: string[], desejados: string[]) {
  const a = new Set(atuais ?? []);
  const d = new Set(desejados ?? []);
  return {
    inserir: Array.from(d).filter((r) => !a.has(r)),
    remover: Array.from(a).filter((r) => !d.has(r)),
    manter: Array.from(d).filter((r) => a.has(r)),
  };
}

/**
 * Proteções de UX (NÃO substituem autorização do servidor):
 * o administrador não desativa a própria conta nem retira o próprio papel de administrador.
 */
export const MSG_AUTO_DESATIVACAO =
  "Você não pode desativar a sua própria conta. Peça a outro administrador.";
export const MSG_AUTO_REMOCAO_ADMIN =
  "Você não pode retirar o seu próprio perfil de Administrador. Peça a outro administrador.";

export function bloqueioAutoDesativacao(isSelf: boolean, ativoDesejado: boolean): string | null {
  return isSelf && ativoDesejado === false ? MSG_AUTO_DESATIVACAO : null;
}

export function bloqueioAutoRemocaoAdmin(
  isSelf: boolean,
  rolesAtuais: string[],
  rolesDesejados: string[],
): string | null {
  if (!isSelf) return null;
  const eraAdmin = (rolesAtuais ?? []).includes("administrador");
  const continuaAdmin = (rolesDesejados ?? []).includes("administrador");
  return eraAdmin && !continuaAdmin ? MSG_AUTO_REMOCAO_ADMIN : null;
}

/** Estado possivelmente parcial: houve escrita antes da falha. */
export const ERRO_EDICAO_PARCIAL =
  "A alteração falhou depois que parte dos dados já havia sido gravada. Os dados podem estar parcialmente alterados: recarregue a lista e confira antes de enviar novamente.";

/** Confirma que a atualização atingiu exatamente UMA linha (evita sucesso falso com zero linhas). */
export function exigirUmaLinha(linhas: unknown, contexto: string): void {
  const qtd = Array.isArray(linhas) ? linhas.length : 0;
  if (qtd !== 1) {
    throw new Error(
      `Não foi possível confirmar a atualização (${contexto}). Recarregue a lista e verifique antes de tentar novamente.`,
    );
  }
}

