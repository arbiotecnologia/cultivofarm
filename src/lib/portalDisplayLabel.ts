/**
 * Rótulos de perfil coerentes com o portal de campo (/app) e com o contexto
 * ativo do usuário. NÃO altera guards/RLS — é apenas apresentação.
 *
 * Regras:
 *  - contexto b2b  → rótulo do papel B2B primário (Gestor/Técnico)
 *  - contexto producer → "Produtor"
 *  - portal técnico (contexto technical OU sem contexto) → deriva por papel:
 *      • consultor_tecnico         → "Consultor Técnico"
 *          (cobre usuário duplo parceiro_b2b + consultor_tecnico)
 *      • tecnico_agronomo          → "Técnico Agrônomo"
 *      • possui aplicador          → "Aplicador"
 *      • cliente_produtor          → "Produtor"
 *      • fallback                  → ROLE_LABELS[primaryRole] || "—"
 */
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";
import type { ActivePortalContext } from "@/lib/activePortalContext";

export interface PortalDisplayInput {
  activeCtx: ActivePortalContext | null;
  primaryRole: AppRole | null;
  roles: AppRole[];
}

export function getPortalDisplayLabel({
  activeCtx,
  primaryRole,
  roles,
}: PortalDisplayInput): string {
  if (activeCtx === "b2b") {
    if (primaryRole === "parceiro_b2b" || primaryRole === "parceiro_b2b_tecnico") {
      return ROLE_LABELS[primaryRole];
    }
    return "Parceiro B2B";
  }
  if (activeCtx === "producer") return "Produtor";

  // Portal técnico / campo — decide por papéis reais.
  // O papel primário tem precedência para distinguir consultor_tecnico de
  // tecnico_agronomo (rótulos diferentes, mesmas permissões).
  if (primaryRole === "tecnico_agronomo") return ROLE_LABELS.tecnico_agronomo;
  if (primaryRole === "consultor_tecnico") return ROLE_LABELS.consultor_tecnico;
  if (roles.includes("consultor_tecnico")) return ROLE_LABELS.consultor_tecnico;
  if (roles.includes("tecnico_agronomo")) return ROLE_LABELS.tecnico_agronomo;
  if (primaryRole === "aplicador" || roles.includes("aplicador")) {
    return "Aplicador";
  }
  if (primaryRole === "cliente_produtor") return "Produtor";
  return primaryRole ? ROLE_LABELS[primaryRole] || primaryRole : "—";
}

/** Versão minúscula para saudações ("Olá, aplicador"). */
export function getPortalGreetingLabel(input: PortalDisplayInput): string {
  const label = getPortalDisplayLabel(input);
  if (label === "Consultor Técnico") return "consultor";
  if (label === "Técnico Agrônomo") return "técnico agrônomo";
  if (label === "Aplicador") return "aplicador";
  if (label === "Produtor") return "produtor";
  return label.toLowerCase();
}
