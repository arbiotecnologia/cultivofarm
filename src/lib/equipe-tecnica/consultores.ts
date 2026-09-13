/**
 * Helpers puros da Equipe Técnica (/consultor-tecnico).
 *
 * Contrato atual: a "equipe técnica" é derivada de `user_roles` + `profiles`.
 * Não existe tabela própria de consultores; portanto nenhum campo é inventado
 * aqui. Apenas `profiles.ativo` (existente no contrato) define o status.
 */

/** Papéis considerados equipe técnica, conforme consulta existente na página. */
export const ROLES_EQUIPE_TECNICA = [
  "tecnico_agronomo",
  "consultor_tecnico",
  "gestor",
] as const;

/** Prioridade de exibição quando o usuário acumula papéis. */
const PRIORIDADE: string[] = ["consultor_tecnico", "tecnico_agronomo", "gestor"];

export interface RoleRow {
  user_id: string;
  role: string;
}

export interface ConsultorItem {
  id?: string;
  user_id: string;
  nome?: string | null;
  email?: string | null;
  ativo?: boolean | null;
  role?: string;
  roles: string[];
  [key: string]: unknown;
}

/**
 * Combina papéis e perfis sem duplicar usuários multipapel e sem descartar
 * papéis adicionais (o mapeamento anterior mantinha apenas o primeiro papel).
 */
export function mapConsultores(
  roles: RoleRow[] | null | undefined,
  profiles: Array<Record<string, unknown>> | null | undefined,
): ConsultorItem[] {
  const porUsuario = new Map<string, string[]>();
  for (const r of roles ?? []) {
    if (!r?.user_id || !r?.role) continue;
    const atuais = porUsuario.get(r.user_id) ?? [];
    if (!atuais.includes(r.role)) atuais.push(r.role);
    porUsuario.set(r.user_id, atuais);
  }

  const vistos = new Set<string>();
  const saida: ConsultorItem[] = [];
  for (const p of profiles ?? []) {
    const userId = p?.user_id as string | undefined;
    if (!userId || vistos.has(userId)) continue;
    vistos.add(userId);
    const papeis = porUsuario.get(userId) ?? [];
    const principal = PRIORIDADE.find((r) => papeis.includes(r)) ?? papeis[0];
    saida.push({ ...(p as Record<string, unknown>), user_id: userId, roles: papeis, role: principal } as ConsultorItem);
  }
  return saida;
}

/** Status real do consultor: `ativo` só é falso quando explicitamente false. */
export function isConsultorAtivo(c: { ativo?: boolean | null } | null | undefined): boolean {
  return c?.ativo !== false;
}

/** Normaliza texto para busca: sem acento, sem caixa, sem espaços nas pontas. */
export function normalizarBusca(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Busca tolerante a espaços, caixa e acentuação sobre os campos realmente
 * existentes no perfil usado pela página: nome e e-mail.
 */
export function filtrarConsultores<T extends Record<string, any>>(lista: T[], termo: string): T[] {
  const q = normalizarBusca(termo);
  if (!q) return lista;
  return lista.filter((c) =>
    [c.nome, c.email].some((campo) => normalizarBusca(campo).includes(q)),
  );
}

/** Usuários com papel técnico porém sem perfil correspondente (registros órfãos). */
export function rolesOrfaos(
  roles: RoleRow[] | null | undefined,
  profiles: Array<Record<string, unknown>> | null | undefined,
): string[] {
  const comPerfil = new Set((profiles ?? []).map((p) => p?.user_id as string));
  const orfaos = new Set<string>();
  for (const r of roles ?? []) {
    if (r?.user_id && !comPerfil.has(r.user_id)) orfaos.add(r.user_id);
  }
  return Array.from(orfaos);
}

/** E-mails duplicados entre perfis técnicos (indício de cadastro duplicado). */
export function emailsDuplicados(lista: Array<{ email?: string | null }>): string[] {
  const contagem = new Map<string, number>();
  for (const c of lista) {
    const email = c?.email?.trim().toLowerCase();
    if (!email) continue;
    contagem.set(email, (contagem.get(email) ?? 0) + 1);
  }
  return Array.from(contagem.entries())
    .filter(([, n]) => n > 1)
    .map(([email]) => email);
}
