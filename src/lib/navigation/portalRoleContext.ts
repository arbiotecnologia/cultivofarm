/**
 * H9-G Bloco 2E — Fonte canônica única do papel efetivo por contexto ativo.
 *
 * Problema corrigido: guards diferentes decidiam com bases diferentes
 * (`VisitaRouteGuard` olhava TODOS os papéis; `RoleGuard` olhava apenas o
 * `primaryRole` calculado por prioridade fixa). Um usuário multipapel
 * (`consultor_tecnico` + `parceiro_b2b`) que escolheu explicitamente o Portal
 * Técnico era redirecionado ao portal B2B, perdendo o contexto escolhido.
 *
 * Regras:
 * - o contexto ativo (escolha explícita do seletor, persistida em sessão)
 *   restringe quais papéis de portal participam da decisão;
 * - papéis internos/administrativos (admin, gestor, financeiro, …) nunca são
 *   filtrados — usuários de papel único e admin não regridem;
 * - a autorização final continua sendo da RLS; aqui apenas evitamos decisões
 *   duplicadas e incompatíveis entre guards.
 */
import { canAccess, getHomeForRole } from "@/lib/permissions";
import { getActivePortalContext, type ActivePortalContext } from "@/lib/activePortalContext";
import { ROLE_PRIORITY } from "@/lib/navigation/safeHome";

/** Papéis pertencentes a cada contexto de portal. */
export const CONTEXT_ROLES: Record<"b2b" | "technical" | "producer", readonly string[]> = {
  b2b: ["parceiro_b2b", "parceiro_b2b_tecnico"],
  technical: [
    "consultor_tecnico",
    "tecnico_agronomo",
    "aplicador",
    "parceiro_b2b_tecnico",
  ],
  producer: ["cliente_produtor"],
};

/** Todos os papéis que pertencem a algum contexto de portal. */
const PORTAL_SCOPED_ROLES = new Set<string>([
  ...CONTEXT_ROLES.b2b,
  ...CONTEXT_ROLES.technical,
  ...CONTEXT_ROLES.producer,
]);

function rank(role: string): number {
  const i = ROLE_PRIORITY.indexOf(role);
  return i === -1 ? 999 : i;
}

/**
 * Papéis considerados válidos dado o contexto ativo.
 * Contexto ausente ou `admin` → nenhuma restrição.
 */
export function rolesForActiveContext(
  roles: readonly string[] | null | undefined,
  activeContext?: ActivePortalContext | null,
): string[] {
  const list = (roles ?? []).filter(Boolean);
  if (!activeContext || activeContext === "admin") return [...list];
  const allowed = CONTEXT_ROLES[activeContext];
  if (!allowed) return [...list];
  const filtered = list.filter(
    (r) => !PORTAL_SCOPED_ROLES.has(r) || allowed.includes(r),
  );
  // Nunca esvaziar a decisão: se o contexto não casa com papel algum,
  // devolvemos vazio de propósito (fail-closed para rotas do outro portal).
  return filtered;
}

export interface EffectiveRouteRoleInput {
  roles: readonly string[] | null | undefined;
  primaryRole?: string | null;
  path: string;
  activeContext?: ActivePortalContext | null;
}

/**
 * Papel efetivo para decidir uma rota: o papel de maior prioridade, dentre os
 * compatíveis com o contexto ativo, que realmente autoriza o caminho.
 * Se nenhum autoriza, devolve o de maior prioridade do contexto (para calcular
 * o destino de redirecionamento coerente) ou `primaryRole` como último recurso.
 */
export function resolveEffectiveRouteRole(
  input: EffectiveRouteRoleInput,
): { role: string | null; allowed: boolean } {
  const { roles, primaryRole, path, activeContext } = input;
  const candidates = rolesForActiveContext(roles, activeContext).sort(
    (a, b) => rank(a) - rank(b),
  );

  const granting = candidates.find((r) => canAccess(r, path));
  if (granting) return { role: granting, allowed: true };

  return { role: candidates[0] ?? primaryRole ?? null, allowed: false };
}

/** Destino de redirecionamento coerente com o contexto ativo. */
export function homeForActiveContext(
  roles: readonly string[] | null | undefined,
  primaryRole: string | null | undefined,
  activeContext?: ActivePortalContext | null,
): string {
  const candidates = rolesForActiveContext(roles, activeContext).sort(
    (a, b) => rank(a) - rank(b),
  );
  return getHomeForRole(candidates[0] ?? primaryRole ?? null);
}

/** Leitura do contexto ativo persistido (sessão) — sobrevive a refresh. */
export function readActiveContext(): ActivePortalContext | null {
  return getActivePortalContext();
}
