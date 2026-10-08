import type { AppRole } from "@/lib/permissions";
import type { PortalContext } from "@/hooks/useAvailableContexts";

/**
 * Destinos fixos por contexto de portal (Bloco 2 — Fase Corretiva 3).
 * Nunca derivar destino do papel principal: sempre do contexto.
 */
export const PORTAL_CONTEXT_HOME: Record<PortalContext, string> = {
  b2b: "/portal-parceiro/dashboard",
  technical: "/app",
  admin: "/dashboard/geral",
} as const;

/**
 * Ordem determinística para calcular `primaryRole` a partir de `roles[]`.
 * Serve APENAS para compatibilidade com telas legadas que ainda esperam
 * um papel único. NUNCA usar para autorização multiportal.
 */
const ROLE_PRIORITY: AppRole[] = [
  // Papel de plataforma SaaS: reconhecido no saneamento para não ser
  // descartado, sem conceder qualquer acesso operacional.
  "superadmin",
  "administrador",
  "gestor",
  "gestor_comercial",
  "financeiro",
  "administrativo",
  "producao",
  "operador_onfarm",
  "cliente_produtor",
  "parceiro_b2b",
  "parceiro_b2b_tecnico",
  "tecnico_agronomo",
  "consultor_tecnico",
  "aplicador",
];

/** Set com todos os papéis válidos, usado para saneamento. */
const VALID_ROLES = new Set<string>(ROLE_PRIORITY);

/**
 * Normaliza a lista de roles vinda do banco:
 * - remove nulos/duplicados;
 * - descarta valores fora do enum;
 * - preserva a ordem de chegada apenas para debug (não define prioridade).
 */
export function normalizeRoles(raw: Array<{ role: string | null } | string | null>): AppRole[] {
  const set = new Set<AppRole>();
  for (const r of raw) {
    const value = typeof r === "string" ? r : r?.role ?? null;
    if (value && VALID_ROLES.has(value)) set.add(value as AppRole);
  }
  return Array.from(set);
}

/** Determina o papel prioritário para fluxos legados (compat). */
export function pickPrimaryRole(roles: AppRole[]): AppRole | null {
  if (!roles.length) return null;
  for (const candidate of ROLE_PRIORITY) {
    if (roles.includes(candidate)) return candidate;
  }
  return roles[0] ?? null;
}

/** Roles que participam do fluxo multiportal via RPC. */
const PORTAL_ROLES: AppRole[] = [
  "parceiro_b2b",
  "parceiro_b2b_tecnico",
  "consultor_tecnico",
  "tecnico_agronomo",
  "aplicador",
];

/** Indica se algum dos papéis do usuário precisa passar pelo resolver de portal. */
export function hasPortalRole(roles: AppRole[]): boolean {
  return roles.some((r) => PORTAL_ROLES.includes(r));
}

/** Manual intent bypasses saved preference only; it never grants a context. */
export function automaticPortalContext(contexts: readonly PortalContext[], preferred: PortalContext | null | undefined, skip: boolean | undefined, manual: boolean): PortalContext | null {
  if (contexts.length === 1) return contexts[0];
  return !manual && skip && preferred && contexts.includes(preferred) ? preferred : null;
}
