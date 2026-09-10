/**
 * H9-G Bloco 2C — Decisão de acesso às rotas internas de visita técnica.
 *
 * Regra fail-closed: a decisão é tomada ANTES de qualquer leitura de dados.
 * Nenhum estado depende do UUID solicitado — logo, um id existente e um
 * inexistente produzem exatamente a mesma resposta para perfis sem permissão.
 *
 * Estados possíveis (mutuamente exclusivos, sem spinner infinito):
 * - `carregando`  → sessão/papéis ainda resolvendo, dentro do prazo;
 * - `erro`        → falha ao resolver sessão/papéis, ou prazo esgotado;
 * - `nao_autenticado` → sem sessão;
 * - `negado`      → autenticado sem permissão para o módulo interno;
 * - `permitido`   → autorizado (RLS continua sendo a autoridade final).
 */
import { getAccessLevel } from "@/lib/permissions";

/** Prazo máximo de espera antes de assumir falha (nunca spinner infinito). */
export const VISITA_GUARD_TIMEOUT_MS = 8000;

/** Caminho canônico usado para consultar a matriz de permissões. */
export const VISITA_PERMISSION_PATH = "/visita-tecnica";

export type VisitaRouteAccessState =
  | "carregando"
  | "erro"
  | "nao_autenticado"
  | "negado"
  | "permitido";

export interface VisitaRouteAccessInput {
  loading: boolean;
  /** Prazo de carregamento esgotado. */
  timedOut?: boolean;
  /** Erro de sessão/rede reportado pela camada de autenticação. */
  error?: unknown;
  hasUser: boolean;
  roles: readonly string[];
}

export function hasVisitaModuleAccess(roles: readonly string[]): boolean {
  return roles.some((r) => getAccessLevel(r, VISITA_PERMISSION_PATH) !== "none");
}

export function resolveVisitaRouteAccess(
  input: VisitaRouteAccessInput,
): VisitaRouteAccessState {
  const { loading, timedOut, error, hasUser, roles } = input;

  if (error) return "erro";
  if (loading) return timedOut ? "erro" : "carregando";
  if (!hasUser) return "nao_autenticado";
  if (!roles || roles.length === 0) return "negado";
  return hasVisitaModuleAccess(roles) ? "permitido" : "negado";
}
