/**
 * Fase Corretiva 9 — Agrupamento de chaves de query por contexto.
 *
 * Ao trocar de portal, remover apenas as chaves do contexto que está saindo
 * (nunca cancelar todas as queries). Perfil, sessão e configurações globais
 * são preservados.
 *
 * A convenção é conservadora: qualquer chave cujo primeiro segmento comece
 * com um dos prefixos abaixo é considerada do respectivo grupo.
 */

export const B2B_QUERY_PREFIXES = [
  "portal-parceiro",
  "parceiro",
  "partner-",
  "my-partner",
  "b2b-",
] as const;

export const TECHNICAL_QUERY_PREFIXES = [
  "portal-tecnico",
  "app-mobile",
  "mobile-",
  "visita",
  "checkin",
  "produtor-selecionado",
  "registros-consultor",
  "fluxo-tecnico",
] as const;

/** Chaves globais/compartilhadas que NUNCA devem ser removidas na troca. */
export const GLOBAL_QUERY_PREFIXES = [
  "available-portal-contexts",
  "profile",
  "system-config",
  "sw-update",
] as const;

function firstSegment(key: unknown): string {
  if (!Array.isArray(key) || key.length === 0) return "";
  const head = key[0];
  return typeof head === "string" ? head : "";
}

function matchesPrefixes(prefixes: readonly string[], first: string): boolean {
  if (!first) return false;
  return prefixes.some((p) => first === p || first.startsWith(p));
}

export function isGlobalQueryKey(key: unknown): boolean {
  return matchesPrefixes(GLOBAL_QUERY_PREFIXES, firstSegment(key));
}

export function isB2BQueryKey(key: unknown): boolean {
  if (isGlobalQueryKey(key)) return false;
  return matchesPrefixes(B2B_QUERY_PREFIXES, firstSegment(key));
}

export function isTechnicalQueryKey(key: unknown): boolean {
  if (isGlobalQueryKey(key)) return false;
  return matchesPrefixes(TECHNICAL_QUERY_PREFIXES, firstSegment(key));
}

/** Chaves efêmeras em sessionStorage por contexto (limpas na troca). */
export const B2B_SESSION_KEYS = [
  "portal-parceiro:filtros",
  "portal-parceiro:paginacao",
];

export const TECHNICAL_SESSION_KEYS = [
  "portal-tecnico:filtros",
  "portal-tecnico:produtor-selecionado",
  "portal-tecnico:visita-temporaria",
];
