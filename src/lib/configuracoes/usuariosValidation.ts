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

  if (senha.length < SENHA_MIN || senha.length > SENHA_MAX || !/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
    erros.password = REGRA_SENHA;
  }

  if (roles.length === 0) {
    erros.roles = "Selecione ao menos um perfil de acesso.";
  } else if (roles.includes("cliente_produtor") && roles.length > 1) {
    erros.roles = "O perfil Produtor não pode ser combinado com outros perfis.";
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

/** Mensagens conhecidas devolvidas pela Edge Function (allowlist). */
const MENSAGENS_PERMITIDAS: Record<string, string> = {
  email_ja_cadastrado: "Já existe um usuário com este e-mail.",
  email_exists: "Já existe um usuário com este e-mail.",
  user_already_registered: "Já existe um usuário com este e-mail.",
  senha_invalida: REGRA_SENHA,
  weak_password: REGRA_SENHA,
  perfil_obrigatorio: "Selecione ao menos um perfil de acesso.",
  parceiro_obrigatorio: "Selecione o parceiro B2B vinculado.",
  cliente_obrigatorio: "Vincule pelo menos um cliente para o perfil Produtor.",
  nao_autorizado: "Você não tem permissão para cadastrar usuários.",
  unauthorized: "Você não tem permissão para cadastrar usuários.",
  forbidden: "Você não tem permissão para cadastrar usuários.",
};

export const ERRO_GENERICO_CRIACAO =
  "Não foi possível concluir o cadastro. Tente novamente; se persistir, avise o suporte.";

const MAX_MENSAGEM = 200;
const PADROES_SENSIVEIS =
  /(select\s|insert\s|update\s|delete\s|from\s+\w|pg_|sql|constraint|relation\s|duplicate key|stack|token|password=|service_role|supabase\.co|jwt)/i;

function mensagemSegura(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto) return null;
  const chave = texto.toLowerCase().replace(/\s+/g, "_");
  if (MENSAGENS_PERMITIDAS[chave]) return MENSAGENS_PERMITIDAS[chave];
  if (texto.length > MAX_MENSAGEM) return null;
  if (PADROES_SENSIVEIS.test(texto)) return null;
  if (/[{}<>]|\n/.test(texto)) return null;
  return texto;
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
