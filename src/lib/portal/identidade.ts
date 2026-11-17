/**
 * Utilitários de identidade visual do usuário compartilhados entre todos os
 * portais (interno, produtor, parceiro B2B e app mobile).
 * Apenas apresentação — não altera guards, rotas ou permissões.
 */
import { ROLE_LABELS } from "@/lib/permissions";

export type PortalParceiroPapelVisual = "gestor" | "tecnico" | "staff";

export function getIniciais(nome?: string | null, email?: string | null): string {
  const base = (nome || "").trim();
  if (base) {
    const partes = base.split(/\s+/).filter(Boolean);
    const primeira = partes[0]?.[0] ?? "";
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
    return (primeira + ultima).toUpperCase();
  }
  return (email?.[0] ?? "?").toUpperCase();
}

export function getPrimeiroNome(nome?: string | null, email?: string | null): string {
  const base = (nome || "").trim();
  if (base) return base.split(/\s+/)[0];
  if (email) return email.split("@")[0];
  return "Usuário";
}

export function getNomeExibicao(nome?: string | null, email?: string | null): string {
  const base = (nome || "").trim();
  if (base) return base;
  if (email) return email.split("@")[0];
  return "Usuário";
}

/** Rótulo do papel no portal do parceiro B2B. */
export function getPapelLabel(papel: PortalParceiroPapelVisual): string {
  if (papel === "staff") return "Visão interna";
  if (papel === "tecnico") return "Técnico B2B";
  return "Gestor B2B";
}

/**
 * Rótulo único para qualquer papel do sistema. Fonte canônica: ROLE_LABELS.
 * Ajustes de leitura para as superfícies internas/campo.
 */
const ROLE_LABEL_OVERRIDES: Record<string, string> = {
  cliente_produtor: "Produtor",
  parceiro_b2b: "Gestor B2B",
  parceiro_b2b_tecnico: "Técnico B2B",
  parceiro_b2b_financeiro: "Financeiro B2B",
};

export function getRoleLabel(role?: string | null): string {
  if (!role) return "Usuário";
  return ROLE_LABEL_OVERRIDES[role] ?? ROLE_LABELS[role] ?? role;
}
