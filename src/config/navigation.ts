/**
 * Fase 2 — Fonte declarativa única de navegação (desktop + mobile).
 *
 * Nesta fase NÃO reorganizamos grupos. Cada item mantém seu grupo atual do
 * `AppSidebar` (Menu Principal / Operação / Técnico / Financeiro / Financeiro B2B
 * / Comercial / Gestão e Estratégico) e sua rota original. A infraestrutura já
 * suporta `subSection`, `matchRoutes`, `legacyRoutes`, `searchKeywords`,
 * `allowedRoles`, `featureFlag`, `order` — para uso nas próximas fases.
 */
import {
  LayoutDashboard, Users, MapPin, FileText, ClipboardList, CalendarClock,
  FlaskConical, ShieldCheck, Package, Warehouse, Truck, Sprout, BarChart3,
  Settings, GitPullRequestArrow, BrainCircuit, CloudSun, Inbox, Activity,
  ClipboardCheck, Clock, ArrowDownCircle, ArrowUpCircle, FolderTree, Building2,
  Layers, CreditCard, PieChart, Repeat, FileSpreadsheet, Receipt, History, Cog,
  TrendingUp, FileBarChart2, Siren, Handshake, Factory, AlertTriangle, Home,
  User, Bell, BookOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppRole } from "@/lib/permissions";

export type NavSection =
  | "Menu Principal"
  | "Operação"
  | "Técnico / Auditoria"
  | "Financeiro"
  | "Financeiro B2B"
  | "Comercial"
  | "Gestão e Estratégico"
  | "Mobile Consultor"
  | "Mobile Produtor";

export type NavPlatform = "desktop" | "mobile-consultor" | "mobile-produtor";

export type NavBadgeSlot = "alertas";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  route: string;
  section: NavSection;
  subSection?: string;
  /** Se omitido, delega para `canAccess(role, route)` (compat com ACCESS_MAP). */
  allowedRoles?: AppRole[];
  /** Badge estático textual (ex.: "Técnico"). */
  badge?: string;
  /** Slot para badge dinâmico (renderizado por componente específico). */
  badgeSlot?: NavBadgeSlot;
  /** Rotas adicionais que também ativam este item (ex.: subrotas de detalhe). */
  matchRoutes?: string[];
  /** Rotas legadas que hoje redirecionam para este item. */
  legacyRoutes?: string[];
  featureFlag?: string;
  order?: number;
  /** Palavras-chave/aliases para a busca. */
  searchKeywords?: string[];
  platforms: NavPlatform[];
  children?: NavItem[];
}

/** Ordem dos grupos na sidebar desktop. Preserva ordem atual (Fase 2). */
export const DESKTOP_SECTION_ORDER: NavSection[] = [
  "Menu Principal",
  "Operação",
  "Técnico / Auditoria",
  "Financeiro",
  "Financeiro B2B",
  "Comercial",
  "Gestão e Estratégico",
];

export const navigation: NavItem[] = [
  // ── Menu Principal ─────────────────────────────────────────────────────────
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, route: "/", section: "Menu Principal", platforms: ["desktop"], searchKeywords: ["home", "início", "painel", "visão geral"] },
  { id: "executivo", label: "Portal Executivo", icon: Activity, route: "/executivo", section: "Menu Principal", platforms: ["desktop"], searchKeywords: ["executivo", "visão executiva", "kpi", "diretoria"] },
  { id: "clientes", label: "Clientes", icon: Users, route: "/clientes", section: "Menu Principal", matchRoutes: ["/clientes/:id", "/parceiros/:id"], legacyRoutes: ["/comercial/parceiros"], platforms: ["desktop"], searchKeywords: ["produtor", "parceiro", "conta"] },
  { id: "solicitacoes", label: "Solicitações", icon: Inbox, route: "/solicitacoes", section: "Menu Principal", platforms: ["desktop"], searchKeywords: ["pedido interno", "demanda"] },
  { id: "agenda-tecnica", label: "Agenda Técnica", icon: CalendarClock, route: "/agenda-tecnica", section: "Menu Principal", platforms: ["desktop"], searchKeywords: ["calendário", "visita agendada"] },
  { id: "visita-tecnica", label: "Visita Técnica", icon: ClipboardCheck, route: "/visita-tecnica", matchRoutes: ["/visita-tecnica/nova", "/visita-tecnica/:id"], section: "Menu Principal", platforms: ["desktop"], searchKeywords: ["visita", "campo"] },
  { id: "bi-agronomico", label: "BI Agronômico", icon: BrainCircuit, route: "/bi-agronomico", section: "Menu Principal", platforms: ["desktop"], searchKeywords: ["bi", "agronomia", "indicador agronômico"] },
  { id: "portal-produtor", label: "Portal do Produtor", icon: LayoutDashboard, route: "/portal", section: "Menu Principal", platforms: ["desktop"], searchKeywords: ["produtor", "cliente"] },
  { id: "configuracoes", label: "Configurações", icon: Settings, route: "/configuracoes", matchRoutes: ["/configuracoes/objetivos-visita", "/configuracoes/catalogo-ia", "/configuracoes/parametros-cq"], section: "Menu Principal", platforms: ["desktop"], searchKeywords: ["config", "ajustes", "usuários", "sistema"] },

  // ── Operação ───────────────────────────────────────────────────────────────
  { id: "ordens-servico", label: "Ordens de Serviço", icon: ClipboardList, route: "/ordens-servico", section: "Operação", platforms: ["desktop"], searchKeywords: ["os", "ordem"] },
  { id: "cockpit-lab", label: "Cockpit Laboratório", icon: FlaskConical, route: "/cockpit-laboratorio", section: "Operação", platforms: ["desktop"], searchKeywords: ["laboratório", "laboratorio", "lab", "cockpit"] },
  { id: "planejamento-producao", label: "Planejamento Produção", icon: Factory, route: "/operacao/planejamento", matchRoutes: ["/operacao/planejamento/:id"], section: "Operação", platforms: ["desktop"], searchKeywords: ["planejamento", "produção"] },
  { id: "dashboard-producao", label: "Dashboard Produção", icon: Activity, route: "/operacao/dashboard-producao", section: "Operação", platforms: ["desktop"], searchKeywords: ["produção", "dashboard"] },
  { id: "estoque", label: "Estoque", icon: Warehouse, route: "/estoque", matchRoutes: ["/estoque/embalagens"], section: "Operação", platforms: ["desktop"], searchKeywords: ["inventário", "insumo", "embalagem"] },
  { id: "entregas", label: "Entregas", icon: Truck, route: "/entregas", matchRoutes: ["/entregas/:id/formulario"], section: "Operação", platforms: ["desktop"], searchKeywords: ["entrega", "logística"] },
  { id: "aplicacoes", label: "Aplicações", icon: Sprout, route: "/aplicacoes", section: "Operação", platforms: ["desktop"], searchKeywords: ["aplicação", "manejo"] },
  { id: "painel-operacional", label: "Painel Operacional", icon: Activity, route: "/painel-operacional", section: "Operação", platforms: ["desktop"], searchKeywords: ["operacional", "painel", "visão operacional"] },

  // ── Técnico / Auditoria ────────────────────────────────────────────────────
  { id: "lotes", label: "Lotes", icon: FlaskConical, route: "/lotes", section: "Técnico / Auditoria", badge: "Técnico", platforms: ["desktop"], searchKeywords: ["lote", "produção"] },
  { id: "cq", label: "Controle de Qualidade", icon: ShieldCheck, route: "/controle-qualidade", section: "Técnico / Auditoria", badge: "Técnico", platforms: ["desktop"], searchKeywords: ["cq", "qualidade", "controle"] },
  { id: "envase", label: "Envase", icon: Package, route: "/envase", section: "Técnico / Auditoria", badge: "Técnico", platforms: ["desktop"], searchKeywords: ["envase", "envasar", "embalar"] },

  // ── Financeiro ─────────────────────────────────────────────────────────────
  { id: "fin-dashboard", label: "Financeiro", icon: PieChart, route: "/financeiro", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["financeiro", "dashboard"] },
  { id: "fin-fluxo", label: "Fluxo de Caixa", icon: TrendingUp, route: "/financeiro/fluxo-caixa", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["caixa", "cashflow"] },
  { id: "fin-dre", label: "DRE Gerencial", icon: FileBarChart2, route: "/financeiro/dre", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["dre", "resultado"] },
  { id: "fin-relatorios", label: "Relatórios", icon: FileBarChart2, route: "/financeiro/relatorios", matchRoutes: ["/financeiro/relatorios/mensal", "/financeiro/relatorios/contas-receber", "/financeiro/relatorios/contas-pagar", "/financeiro/relatorios/inadimplencia", "/financeiro/relatorios/nfe-pendente", "/financeiro/relatorios/entregas-faturamento", "/financeiro/relatorios/por-cliente", "/financeiro/relatorios/prestacao-contas"], section: "Financeiro", platforms: ["desktop"], searchKeywords: ["relatório financeiro", "prestação de contas"] },
  { id: "fin-recibos", label: "Recibos", icon: Receipt, route: "/financeiro/recibos", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["recibo"] },
  { id: "fin-receber", label: "Contas a Receber", icon: ArrowUpCircle, route: "/financeiro/receber", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["receber", "ar", "cliente"] },
  { id: "fin-pagar", label: "Contas a Pagar", icon: ArrowDownCircle, route: "/financeiro/pagar", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["pagar", "ap", "fornecedor"] },
  { id: "fin-categorias", label: "Categorias", icon: FolderTree, route: "/financeiro/categorias", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["categoria financeira"] },
  { id: "fin-cc", label: "Centros de Custo", icon: Building2, route: "/financeiro/centros-custo", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["centro de custo", "cc"] },
  { id: "fin-contas-bancarias", label: "Contas Bancárias", icon: Layers, route: "/financeiro/contas-bancarias", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["banco", "conta bancária"] },
  { id: "fin-formas-pgto", label: "Formas de Pagamento", icon: CreditCard, route: "/financeiro/formas-pagamento", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["forma de pagamento", "pagamento"] },
  { id: "fin-recorrencias", label: "Recorrências", icon: Repeat, route: "/financeiro/recorrencias", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["recorrente", "assinatura"] },
  { id: "fin-nfe", label: "Notas Fiscais", icon: FileSpreadsheet, route: "/financeiro/notas-fiscais", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["nota fiscal", "nfe", "nf"] },
  { id: "fin-ent-nfat", label: "Entregas s/ Fatura", icon: Receipt, route: "/financeiro/entregas-nao-faturadas", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["fatura", "entregas sem fatura", "não faturado"] },
  { id: "fin-auditoria", label: "Auditoria", icon: History, route: "/financeiro/auditoria", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["auditoria financeira", "trilha"] },
  { id: "fin-config", label: "Configurações Fin.", icon: Cog, route: "/financeiro/configuracoes", section: "Financeiro", platforms: ["desktop"], searchKeywords: ["configuração financeira"] },

  // ── Financeiro B2B ─────────────────────────────────────────────────────────
  { id: "b2b-visao", label: "Visão Geral B2B", icon: Handshake, route: "/financeiro/b2b", section: "Financeiro B2B", platforms: ["desktop"], searchKeywords: ["b2b", "visão geral"] },
  { id: "b2b-dashboard", label: "Dashboard B2B", icon: TrendingUp, route: "/financeiro/b2b/dashboard", section: "Financeiro B2B", legacyRoutes: ["/comercial/dashboard-b2b"], platforms: ["desktop"], searchKeywords: ["dashboard b2b"] },
  { id: "b2b-governanca", label: "Governança", icon: ShieldCheck, route: "/financeiro/b2b/governanca", section: "Financeiro B2B", platforms: ["desktop"], searchKeywords: ["governança", "governanca"] },
  { id: "b2b-aging", label: "Aging", icon: BarChart3, route: "/financeiro/b2b/aging", section: "Financeiro B2B", platforms: ["desktop"], searchKeywords: ["aging", "vencido", "atraso"] },
  { id: "b2b-previsao", label: "Previsão Receita", icon: TrendingUp, route: "/financeiro/b2b/previsao", section: "Financeiro B2B", platforms: ["desktop"], searchKeywords: ["previsão", "receita futura", "forecast"] },
  { id: "b2b-rentabilidade", label: "Rentabilidade", icon: BarChart3, route: "/financeiro/b2b/rentabilidade", section: "Financeiro B2B", platforms: ["desktop"], searchKeywords: ["rentabilidade", "margem", "lucro"] },
  { id: "b2b-alertas", label: "Alertas Financeiros", icon: AlertTriangle, route: "/financeiro/b2b/alertas", section: "Financeiro B2B", platforms: ["desktop"], searchKeywords: ["alerta financeiro"] },
  { id: "b2b-central-gov", label: "Central Governança", icon: ShieldCheck, route: "/financeiro/b2b/central-governanca", section: "Financeiro B2B", platforms: ["desktop"], searchKeywords: ["central de governança", "governança"] },
  { id: "b2b-regras-gov", label: "Regras Governança", icon: ShieldCheck, route: "/financeiro/b2b/regras", section: "Financeiro B2B", platforms: ["desktop"], searchKeywords: ["regras", "governança", "políticas"] },
  { id: "b2b-socios", label: "Dashboard Sócios", icon: TrendingUp, route: "/executivo/socios-b2b", section: "Financeiro B2B", platforms: ["desktop"], searchKeywords: ["sócios", "socios", "executivo"] },

  // ── Comercial ──────────────────────────────────────────────────────────────
  { id: "com-consolidado", label: "Dashboard Consolidado", icon: BarChart3, route: "/comercial/dashboard-consolidado", section: "Comercial", legacyRoutes: ["/comercial/dashboard-b2b"], platforms: ["desktop"], searchKeywords: ["consolidado", "comercial"] },
  { id: "com-indicadores", label: "Indicadores", icon: BarChart3, route: "/comercial/indicadores", section: "Comercial", platforms: ["desktop"], searchKeywords: ["indicador comercial", "kpi"] },
  { id: "com-pedidos-b2b", label: "Pedidos B2B", icon: ClipboardCheck, route: "/comercial/pedidos-b2b", section: "Comercial", platforms: ["desktop"], searchKeywords: ["pedido b2b"] },
  { id: "com-solicitacoes-b2b", label: "Solicitações B2B", icon: Inbox, route: "/comercial/solicitacoes-b2b", section: "Comercial", platforms: ["desktop"], searchKeywords: ["solicitação b2b"] },
  { id: "com-campanhas", label: "Campanhas", icon: TrendingUp, route: "/comercial/campanhas", section: "Comercial", platforms: ["desktop"], searchKeywords: ["campanha", "promoção"] },
  { id: "com-catalogo", label: "Catálogo", icon: FlaskConical, route: "/comercial/catalogo", section: "Comercial", platforms: ["desktop"], searchKeywords: ["catálogo", "produto"] },
  { id: "com-simulador", label: "Simulador", icon: BarChart3, route: "/comercial/simulador", section: "Comercial", platforms: ["desktop"], searchKeywords: ["simulador", "simulação"] },
  { id: "com-alertas", label: "Alertas Comerciais", icon: AlertTriangle, route: "/comercial/alertas", section: "Comercial", platforms: ["desktop"], searchKeywords: ["alerta comercial"] },

  // ── Gestão e Estratégico ───────────────────────────────────────────────────
  { id: "fazendas", label: "Fazendas", icon: MapPin, route: "/fazendas", matchRoutes: ["/fazendas/:id", "/talhoes", "/talhoes/:id"], section: "Gestão e Estratégico", platforms: ["desktop"], searchKeywords: ["fazenda", "talhão"] },
  { id: "protocolos", label: "Protocolos", icon: FileText, route: "/protocolos", section: "Gestão e Estratégico", platforms: ["desktop"], searchKeywords: ["protocolo"] },
  { id: "equipe-tecnica", label: "Equipe Técnica", icon: Users, route: "/consultor-tecnico", section: "Gestão e Estratégico", platforms: ["desktop"], searchKeywords: ["consultor", "técnico", "equipe"] },
  { id: "fluxo-tecnico", label: "Fluxo Técnico", icon: GitPullRequestArrow, route: "/fluxo-tecnico", section: "Gestão e Estratégico", platforms: ["desktop"], searchKeywords: ["fluxo", "processo técnico"] },
  { id: "relatorios", label: "Relatórios", icon: BarChart3, route: "/relatorios", section: "Gestão e Estratégico", platforms: ["desktop"], searchKeywords: ["relatório gerencial"] },
  { id: "bi-operacional", label: "BI Operacional", icon: Activity, route: "/bi-operacional", section: "Gestão e Estratégico", platforms: ["desktop"], searchKeywords: ["bi", "operacional"] },
  { id: "alertas", label: "Alertas", icon: Siren, route: "/alertas-operacionais", section: "Gestão e Estratégico", badgeSlot: "alertas", platforms: ["desktop"], searchKeywords: ["alerta", "notificação"] },
  { id: "monitoramento", label: "Monitoramento", icon: Clock, route: "/monitoramento-alertas", section: "Gestão e Estratégico", platforms: ["desktop"], searchKeywords: ["monitoramento", "sla"] },
  { id: "previsao-climatica", label: "Previsão Climática", icon: CloudSun, route: "/previsao-agronomica", section: "Gestão e Estratégico", platforms: ["desktop"], searchKeywords: ["clima", "previsão climática", "meteorologia"] },
  { id: "auditorias", label: "Auditorias", icon: ShieldCheck, route: "/auditoria", legacyRoutes: ["/auditoria-sync"], section: "Gestão e Estratégico", platforms: ["desktop"], searchKeywords: ["auditoria", "sync", "trilha"] },

  // ── Mobile Consultor (tabs) ────────────────────────────────────────────────
  { id: "m-c-inicio", label: "Início", icon: Home, route: "/app", section: "Mobile Consultor", platforms: ["mobile-consultor", "mobile-produtor"], order: 1 },
  { id: "m-c-demandas", label: "Demandas", icon: ClipboardList, route: "/app/solicitacoes", section: "Mobile Consultor", platforms: ["mobile-consultor"], order: 2 },
  { id: "m-c-fazendas", label: "Fazendas", icon: MapPin, route: "/app/fazendas", section: "Mobile Consultor", platforms: ["mobile-consultor"], order: 3 },
  { id: "m-c-catalogo", label: "Catálogo", icon: BookOpen, route: "/app/catalogo", section: "Mobile Consultor", platforms: ["mobile-consultor"], order: 4 },
  { id: "m-perfil", label: "Perfil", icon: User, route: "/app/perfil", section: "Mobile Consultor", platforms: ["mobile-consultor", "mobile-produtor"], order: 5 },

  // ── Mobile Produtor (tabs) ─────────────────────────────────────────────────
  { id: "m-p-recomendacoes", label: "Recom.", icon: FileText, route: "/app/recomendacoes", section: "Mobile Produtor", platforms: ["mobile-produtor"], order: 2 },
  { id: "m-p-entregas", label: "Entregas", icon: Truck, route: "/app/entregas", section: "Mobile Produtor", platforms: ["mobile-produtor"], order: 3 },
  { id: "m-p-notificacoes", label: "Alertas", icon: Bell, route: "/app/notificacoes", section: "Mobile Produtor", platforms: ["mobile-produtor"], order: 4 },
];

/** Retorna itens visíveis numa dada plataforma, ordenados por `order` (asc). */
export function itemsForPlatform(platform: NavPlatform): NavItem[] {
  const filtered = navigation.filter((n) => n.platforms.includes(platform));
  return filtered.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

/** Retorna todos os itens desktop agrupados por `section`, respeitando `DESKTOP_SECTION_ORDER`. */
export function desktopItemsBySection(): Array<{ section: NavSection; items: NavItem[] }> {
  const bySection = new Map<NavSection, NavItem[]>();
  for (const item of itemsForPlatform("desktop")) {
    const arr = bySection.get(item.section) ?? [];
    arr.push(item);
    bySection.set(item.section, arr);
  }
  return DESKTOP_SECTION_ORDER
    .map((section) => ({ section, items: bySection.get(section) ?? [] }))
    .filter((g) => g.items.length > 0);
}
