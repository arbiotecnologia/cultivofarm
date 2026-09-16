/**
 * Fonte declarativa dos menus laterais dos portais Produtor e Parceiro B2B.
 *
 * Migração puramente estrutural: rotas, rótulos, ícones, `permissionPath`
 * (ACCESS_MAP) e `showFor` são exatamente os que existiam nos arrays locais
 * de `PortalLayout.tsx` e `PortalParceiroLayout.tsx`. Os guards/redirects
 * continuam nos layouts — nada de permissão foi movido para cá.
 */
import {
  LayoutDashboard, MapPin, FileText, ClipboardList, FlaskConical, Sprout,
  User, PlusCircle, Stethoscope, Calendar, CreditCard,
  ShoppingCart, ListOrdered, History, Wallet, Star, TrendingUp, UserCog,
} from "lucide-react";
import type { SidebarNavGroup, SidebarNavItem } from "@/components/nav/types";

export interface PortalMenuItem extends SidebarNavItem {
  /** Rota usada para checagem no ACCESS_MAP. `null` = sempre visível. */
  permissionPath?: string | null;
  /** Público do item no portal parceiro. */
  showFor?: "all" | "gestor" | "tecnico";
}

export interface PortalMenuGroup extends SidebarNavGroup {
  items: PortalMenuItem[];
}

/** Portal do Produtor — 11 itens (conjunto idêntico ao anterior). */
export const PRODUTOR_MENU_GROUPS: PortalMenuGroup[] = [
  {
    section: "Painel",
    items: [
      { id: "pp-dashboard", label: "Dashboard", icon: LayoutDashboard, route: "/portal", permissionPath: null },
      { id: "pp-titulos", label: "Meus Títulos", icon: CreditCard, route: "/portal/financeiro", permissionPath: null },
    ],
  },
  {
    section: "Minhas Propriedades",
    items: [
      { id: "pp-fazendas", label: "Fazendas", icon: MapPin, route: "/portal/fazendas", permissionPath: null },
      { id: "pp-agenda", label: "Minha Agenda", icon: Calendar, route: "/portal/agenda", permissionPath: null },
    ],
  },
  {
    section: "Acompanhamento Técnico",
    items: [
      { id: "pp-registros", label: "Registros Técnicos", icon: Stethoscope, route: "/portal/registros", permissionPath: null },
      { id: "pp-recomendacoes", label: "Recomendações", icon: FileText, route: "/portal/recomendacoes", permissionPath: null },
      { id: "pp-acompanhamento", label: "Acompanhamento", icon: ClipboardList, route: "/portal/acompanhamento", permissionPath: null },
      { id: "pp-aplicacoes", label: "Aplicações", icon: Sprout, route: "/portal/aplicacoes", permissionPath: null },
    ],
  },
  {
    section: "Atendimento e Conta",
    items: [
      { id: "pp-solicitar", label: "Solicitar Atendimento", icon: PlusCircle, route: "/portal/solicitar", permissionPath: null },
      { id: "pp-perfil", label: "Meu Perfil", icon: User, route: "/portal/perfil", permissionPath: null },
    ],
  },
];

/** Parceiro B2B — visão do gestor (8 itens, conjunto idêntico ao anterior). */
export const PARCEIRO_GESTOR_GROUPS: PortalMenuGroup[] = [
  {
    section: "Painel",
    items: [
      { id: "pb-dashboard", label: "Dashboard", icon: LayoutDashboard, route: "/portal-parceiro/dashboard", showFor: "gestor" },
    ],
  },
  {
    section: "Comercial",
    items: [
      { id: "pb-pedidos", label: "Meus Pedidos", icon: ListOrdered, route: "/portal-parceiro/pedidos", showFor: "gestor" },
      { id: "pb-simulacoes-equipe", label: "Simulações", icon: FlaskConical, route: "/portal-parceiro/simulacoes-equipe", showFor: "gestor" },
      { id: "pb-catalogo", label: "Catálogo", icon: ShoppingCart, route: "/portal-parceiro/catalogo", showFor: "gestor" },
      { id: "pb-favoritos", label: "Favoritos", icon: Star, route: "/portal-parceiro/favoritos", showFor: "gestor" },
    ],
  },
  {
    section: "Conteúdo Técnico",
    items: [
      { id: "pb-fichas", label: "Fichas Técnicas", icon: FileText, route: "/portal-parceiro/fichas", showFor: "gestor" },
    ],
  },
  {
    section: "Desempenho e Financeiro",
    items: [
      { id: "pb-meu-historico", label: "Meu Histórico", icon: TrendingUp, route: "/portal-parceiro/meu-historico", showFor: "gestor" },
      { id: "pb-financeiro", label: "Financeiro", icon: Wallet, route: "/portal-parceiro/financeiro", showFor: "gestor" },
    ],
  },
  {
    section: "Conta",
    items: [
      { id: "pb-perfil", label: "Perfil e identidade", icon: UserCog, route: "/portal-parceiro/perfil", showFor: "gestor" },
    ],
  },
];

/** Parceiro B2B — visão do técnico (4 itens, conjunto idêntico ao anterior). */
export const PARCEIRO_TECNICO_GROUPS: PortalMenuGroup[] = [
  {
    section: "Painel",
    items: [
      { id: "pbt-dashboard", label: "Dashboard", icon: LayoutDashboard, route: "/portal-parceiro/dashboard", showFor: "tecnico" },
    ],
  },
  {
    section: "Simulações",
    items: [
      { id: "pbt-simulador", label: "Simulador", icon: FlaskConical, route: "/portal-parceiro/simulador", showFor: "tecnico" },
      { id: "pbt-simulacoes", label: "Minhas Simulações", icon: History, route: "/portal-parceiro/simulacoes", showFor: "tecnico" },
    ],
  },
  {
    section: "Conteúdo Técnico",
    items: [
      { id: "pbt-fichas", label: "Fichas Técnicas", icon: FileText, route: "/portal-parceiro/fichas", showFor: "tecnico" },
    ],
  },
];

/** Lista plana de itens de um conjunto de grupos (ordem preservada). */
export function flattenPortalMenu(groups: PortalMenuGroup[]): PortalMenuItem[] {
  return groups.flatMap((g) => g.items);
}
