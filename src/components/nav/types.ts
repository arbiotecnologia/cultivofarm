import type { LucideIcon } from "lucide-react";

/**
 * Contrato mínimo de item de navegação lateral compartilhado por todos os
 * portais (admin, produtor, parceiro). `NavItem` de `@/config/navigation`
 * é estruturalmente compatível — nenhuma rota/permissão vive aqui.
 */
export interface SidebarNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  route: string;
  /** Cabeçalho intermediário dentro da seção. */
  subSection?: string;
  badge?: string;
  badgeSlot?: "alertas";
  /** Contador dinâmico (ex.: recomendações aguardando no portal do produtor). */
  badgeCount?: number;
  matchRoutes?: string[];
  legacyRoutes?: string[];
  paramDefault?: boolean;
  searchKeywords?: string[];
  children?: SidebarNavItem[];
}

export interface SidebarNavGroup {
  section: string;
  items: SidebarNavItem[];
}

/** Identificador do portal — compõe as chaves de persistência. */
export type SidebarPortalId = "admin" | "produtor" | "parceiro";
