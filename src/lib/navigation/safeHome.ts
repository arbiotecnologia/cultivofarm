/**
 * H9-G Bloco 2D — Destino canônico e seguro do botão "Voltar" após bloqueio.
 *
 * Regras (sem criar rotas novas — todos os destinos já existem no App):
 * - anônimo → `/auth`;
 * - papéis administrativos/internos → home do papel de maior acesso;
 * - multipapel de portal (≥ 2 contextos reais) → `/selecionar-portal`;
 * - contexto único B2B → `/portal-parceiro/dashboard`;
 * - `cliente_produtor` → `/app` (portal operacional canônico, igual ao login);
 * - `/acesso-pendente` SOMENTE quando o usuário não possui papel algum.
 *
 * Nunca usa histórico do navegador, logo jamais retorna à rota negada.
 */
import { getHomeForRole } from "@/lib/permissions";

export const ACESSO_PENDENTE_PATH = "/acesso-pendente";
export const SEM_PERMISSAO_PATH = "/sem-permissao";
export const SELECIONAR_PORTAL_PATH = "/selecionar-portal";
export const AUTH_PATH = "/auth";
export const PRODUTOR_HOME_PATH = "/app";
export const B2B_HOME_PATH = "/portal-parceiro/dashboard";

/** Ordem de precedência quando o usuário possui múltiplos papéis. */
export const ROLE_PRIORITY: readonly string[] = [
  "administrador",
  "gestor",
  "gestor_comercial",
  "vendedor",
  "financeiro",
  "producao",
  "operador_onfarm",
  "administrativo",
  "consultor_tecnico",
  "tecnico_agronomo",
  "aplicador",
  "parceiro_b2b_tecnico",
  "parceiro_b2b",
  "parceiro_b2b_financeiro",
  "cliente_produtor",
];

/** Papéis cuja home administrativa prevalece mesmo havendo portais. */
const ADMIN_HOME_ROLES: readonly string[] = [
  "administrador",
  "gestor",
  "gestor_comercial",
  "vendedor",
  "financeiro",
  "administrativo",
  "producao",
  "operador_onfarm",
];

export function getEffectiveRole(
  roles: readonly string[] | null | undefined,
  primaryRole?: string | null,
): string | null {
  const list = (roles ?? []).filter(Boolean);
  if (list.length === 0) return primaryRole ?? null;
  const ranked = [...list].sort(
    (a, b) =>
      (ROLE_PRIORITY.indexOf(a) === -1 ? 999 : ROLE_PRIORITY.indexOf(a)) -
      (ROLE_PRIORITY.indexOf(b) === -1 ? 999 : ROLE_PRIORITY.indexOf(b)),
  );
  return ranked[0] ?? primaryRole ?? null;
}

export interface SafeHomeInput {
  hasUser: boolean;
  roles?: readonly string[] | null;
  primaryRole?: string | null;
  /** Contextos de portal resolvidos pela RPC segura (opcional). */
  availableContexts?: readonly ("b2b" | "technical" | "admin" | "producer")[] | null;
}

export function resolveSafeHome(input: SafeHomeInput): string {
  const { hasUser, roles, primaryRole, availableContexts } = input;
  if (!hasUser) return AUTH_PATH;

  const effective = getEffectiveRole(roles, primaryRole);

  // Papel administrativo/interno tem home própria e não depende de contextos.
  if (effective && ADMIN_HOME_ROLES.includes(effective)) {
    return getHomeForRole(effective);
  }

  const contexts = availableContexts ?? null;
  if (contexts && contexts.length >= 2) return SELECIONAR_PORTAL_PATH;
  if (contexts && contexts.length === 1 && contexts[0] === "b2b") return B2B_HOME_PATH;
  if (contexts && contexts.length === 1 && contexts[0] === "producer") return PRODUTOR_HOME_PATH;

  if (effective === "cliente_produtor") return PRODUTOR_HOME_PATH;
  if (effective) return getHomeForRole(effective);

  // Sem papel algum: único caso legítimo de acesso pendente.
  return ACESSO_PENDENTE_PATH;
}
