/**
 * Fase 6 — Inteligência, Controle e Administração.
 *
 * Continua sendo alteração exclusivamente declarativa/visual
 * (section/subSection/order/label/searchKeywords). Rotas, ícones, ids,
 * permissões, badges, matchRoutes, legacyRoutes e children permanecem intactos.
 * Financeiro, Financeiro B2B, Comercial, Campo, Produção e mobile ficam fora
 * do escopo desta fase.
 */
import {
  LayoutDashboard, Users, MapPin, FileText, ClipboardList, CalendarClock,
  FlaskConical, ShieldCheck, Package, Warehouse, Truck, Sprout, BarChart3,
  Settings, GitPullRequestArrow, BrainCircuit, CloudSun, Inbox, Activity,
  ClipboardCheck, Clock, ArrowDownCircle, ArrowUpCircle, FolderTree, Building2,
  Layers, CreditCard, PieChart, Repeat, FileSpreadsheet, Receipt,
  TrendingUp, FileBarChart2, Siren, Handshake, Factory, AlertTriangle, Home,
  User, Bell, BookOpen, Calculator, Boxes, ListChecks, Briefcase,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppRole } from "@/lib/permissions";

export type NavSection =
  | "Dashboard"
  | "Comercial e Relacionamento"
  | "Campo e Assistência Técnica"
  | "Produção"
  | "Financeiro"
  | "Financeiro B2B"
  | "Inteligência e Controle"
  | "Administração"
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
  /**
   * Marca o filho cujo deep-link corresponde ao valor padrão do parâmetro
   * (ex.: `?tab=produtos` é o padrão de `/base-tecnica`, e por isso a URL sem
   * o parâmetro também o considera ativo).
   */
  paramDefault?: boolean;
  platforms: NavPlatform[];
  children?: NavItem[];
}

/** Ordem dos grupos na sidebar desktop. */
export const DESKTOP_SECTION_ORDER: NavSection[] = [
  "Dashboard",
  "Comercial e Relacionamento",
  "Campo e Assistência Técnica",
  "Produção",
  "Financeiro",
  "Financeiro B2B",
  "Inteligência e Controle",
  "Administração",
];

export const navigation: NavItem[] = [
  // ── Dashboard ──────────────────────────────────────────────────────────────
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    route: "/dashboard/geral",
    section: "Dashboard",
    matchRoutes: ["/dashboard", "/dashboard/geral", "/dashboard/executivo", "/dashboard/operacional"],
    legacyRoutes: ["/", "/executivo", "/portal-executivo", "/painel-operacional"],
    platforms: ["desktop"],
    order: 1,
    searchKeywords: ["home", "início", "painel", "visão geral", "dashboard"],
    children: [
      { id: "dashboard-geral", label: "Visão Geral", icon: LayoutDashboard, route: "/dashboard/geral", section: "Dashboard", legacyRoutes: ["/"], platforms: ["desktop"], searchKeywords: ["visão geral", "resumo"] },
      { id: "dashboard-executivo", label: "Visão Executiva", icon: BarChart3, route: "/dashboard/executivo", section: "Dashboard", legacyRoutes: ["/executivo", "/portal-executivo"], platforms: ["desktop"], searchKeywords: ["executivo", "portal executivo", "visão executiva", "visao executiva", "dashboard executivo", "gestão executiva", "gestao executiva", "kpi", "diretoria"] },
      { id: "dashboard-operacional", label: "Visão Operacional", icon: Activity, route: "/dashboard/operacional", section: "Dashboard", legacyRoutes: ["/painel-operacional"], platforms: ["desktop"], searchKeywords: ["painel operacional", "operacional"] },
    ],
  },
  { id: "portal-produtor", label: "Portal do Produtor", icon: Sprout, route: "/portal", section: "Dashboard", platforms: ["desktop"], order: 2, searchKeywords: ["produtor", "cliente", "portal do produtor"] },


  // ── Comercial e Relacionamento ─────────────────────────────────────────────
  { id: "com-consolidado", label: "Dashboard Consolidado", icon: BarChart3, route: "/comercial/dashboard-consolidado", section: "Comercial e Relacionamento", subSection: "Visão Comercial", order: 1, legacyRoutes: ["/comercial/dashboard-b2b"], platforms: ["desktop"], searchKeywords: ["consolidado", "comercial", "dashboard comercial", "visão comercial", "dashboard-b2b"] },
  { id: "com-indicadores", label: "Indicadores", icon: Activity, route: "/comercial/indicadores", section: "Comercial e Relacionamento", subSection: "Visão Comercial", order: 2, platforms: ["desktop"], searchKeywords: ["indicador comercial", "kpi", "indicadores comerciais", "métricas", "desempenho comercial"] },
  { id: "com-alertas", label: "Alertas Comerciais", icon: AlertTriangle, route: "/comercial/alertas", section: "Comercial e Relacionamento", subSection: "Visão Comercial", order: 3, platforms: ["desktop"], searchKeywords: ["alerta comercial", "alertas comerciais", "alertas vendas", "comercial"] },
  { id: "clientes", label: "Clientes", icon: Users, route: "/clientes", section: "Comercial e Relacionamento", subSection: "Clientes e Propriedades", order: 4, matchRoutes: ["/clientes/:id", "/parceiros/:id"], legacyRoutes: ["/comercial/parceiros"], platforms: ["desktop"], searchKeywords: ["produtor", "parceiro", "conta", "clientes", "produtores", "cadastro cliente"] },
  { id: "fazendas", label: "Fazendas", icon: MapPin, route: "/fazendas", matchRoutes: ["/fazendas/:id", "/talhoes", "/talhoes/:id"], section: "Comercial e Relacionamento", subSection: "Clientes e Propriedades", order: 5, platforms: ["desktop"], searchKeywords: ["fazenda", "talhão", "fazendas", "propriedades", "propriedades rurais"] },
  { id: "solicitacoes", label: "Solicitações", icon: Inbox, route: "/solicitacoes", section: "Comercial e Relacionamento", subSection: "Demandas e Vendas", order: 6, platforms: ["desktop"], searchKeywords: ["pedido interno", "demanda", "solicitações", "demandas", "atendimento"] },
  { id: "com-pedidos-b2b", label: "Pedidos B2B", icon: ClipboardCheck, route: "/comercial/pedidos-b2b", section: "Comercial e Relacionamento", subSection: "Demandas e Vendas", order: 7, platforms: ["desktop"], searchKeywords: ["pedido b2b", "pedidos b2b", "pedidos parceiro", "revenda"] },
  { id: "com-solicitacoes-b2b", label: "Solicitações B2B", icon: ClipboardList, route: "/comercial/solicitacoes-b2b", section: "Comercial e Relacionamento", subSection: "Demandas e Vendas", order: 8, platforms: ["desktop"], searchKeywords: ["solicitação b2b", "solicitações b2b", "parceiro", "revenda"] },
  { id: "com-campanhas", label: "Campanhas", icon: TrendingUp, route: "/comercial/campanhas", section: "Comercial e Relacionamento", subSection: "Demandas e Vendas", order: 9, platforms: ["desktop"], searchKeywords: ["campanha", "promoção", "campanhas", "comercial", "ações comerciais"] },
  // Fase 29: o item "Catálogo" (/comercial/catalogo) foi unificado ao
  // "Catálogo Técnico" de /base-tecnica — a rota antiga apenas redireciona.

  // Fase 26B: o rótulo permanece "Base Técnica" — há teste de contrato
  // Fase 26C: rótulo visual passa a ser "Catálogo". Rota canônica
  // (/base-tecnica), id, legacyRoutes (/protocolos), permissões e filhos
  // permanecem inalterados — apenas o texto exibido muda.
  {
    id: "protocolos", label: "Catálogo", icon: FileText, route: "/base-tecnica",
    section: "Comercial e Relacionamento", subSection: "Produtos e Planejamento", order: 11,
    platforms: ["desktop"], legacyRoutes: ["/protocolos", "/comercial/catalogo", "/configuracoes/produtos"],
    searchKeywords: ["base técnica", "base tecnica", "base técnica agronômica", "catálogo", "catalogo", "catálogo comercial", "catalogo comercial", "portfólio", "portfolio", "catálogo ar bio", "catalogo ar bio", "produtos", "produto", "microrganismos", "culturas", "alvos", "recomendações", "recomendacoes", "ficha técnica", "catálogo técnico", "catalogo tecnico", "protocolo", "protocolos", "manejo", "protocolo agronômico"],

    children: [
      { id: "protocolos-produtos", label: "Produtos", icon: Package, route: "/base-tecnica?tab=produtos", section: "Comercial e Relacionamento", subSection: "Produtos e Planejamento", platforms: ["desktop"], paramDefault: true, searchKeywords: ["produtos", "base técnica"] },
      { id: "protocolos-servicos", label: "Serviços", icon: Briefcase, route: "/base-tecnica?tab=servicos", section: "Comercial e Relacionamento", subSection: "Produtos e Planejamento", platforms: ["desktop"], searchKeywords: ["serviços", "servicos", "consultoria", "nfs-e", "nfse", "serviço prestado"] },
      { id: "protocolos-microrganismos", label: "Microrganismos", icon: FlaskConical, route: "/base-tecnica?tab=microrganismos", section: "Comercial e Relacionamento", subSection: "Produtos e Planejamento", platforms: ["desktop"], searchKeywords: ["microrganismos", "base técnica"] },
      { id: "protocolos-catalogo-tecnico", label: "Catálogo Técnico", icon: BookOpen, route: "/base-tecnica?tab=catalogo-tecnico", section: "Comercial e Relacionamento", subSection: "Produtos e Planejamento", platforms: ["desktop"], searchKeywords: ["catálogo técnico", "catalogo tecnico", "base técnica"] },
      { id: "protocolos-culturas", label: "Culturas", icon: Sprout, route: "/base-tecnica?tab=culturas", section: "Comercial e Relacionamento", subSection: "Produtos e Planejamento", platforms: ["desktop"], searchKeywords: ["culturas", "base técnica"] },
      { id: "protocolos-problemas", label: "Problemas", icon: AlertTriangle, route: "/base-tecnica?tab=problemas", section: "Comercial e Relacionamento", subSection: "Produtos e Planejamento", platforms: ["desktop"], searchKeywords: ["problemas", "alvos", "base técnica"] },
    ],
  },
  { id: "com-minha-carteira", label: "Minha carteira", icon: Briefcase, route: "/comercial/minha-carteira", section: "Comercial e Relacionamento", subSection: "Produtos e Planejamento", order: 11, platforms: ["desktop"], searchKeywords: ["carteira", "vendedor", "meus parceiros"] },
  { id: "com-simulador", label: "Simulador", icon: Calculator, route: "/comercial/simulador", section: "Comercial e Relacionamento", subSection: "Produtos e Planejamento", order: 12, platforms: ["desktop"], searchKeywords: ["simulador", "simulação", "proposta", "orçamento"] },
  { id: "com-condicoes-pagamento", label: "Condições e Preços", icon: CreditCard, route: "/comercial/condicoes-pagamento", section: "Comercial e Relacionamento", subSection: "Produtos e Planejamento", order: 13, platforms: ["desktop"], searchKeywords: ["condição de pagamento", "condicoes de pagamento", "condições financeiras", "matriz de preços", "matriz de precos", "preço por produto", "preco por microrganismo", "à vista", "a vista", "prazo", "safra", "sob consulta", "quote only", "plano de pagamento", "tabela de preços"] },


  // ── Campo e Assistência Técnica ────────────────────────────────────────────
  { id: "agenda-tecnica", label: "Agenda Técnica", icon: CalendarClock, route: "/agenda-tecnica", section: "Campo e Assistência Técnica", order: 1, platforms: ["desktop"], searchKeywords: ["calendário", "visita agendada", "agenda", "agenda técnica", "calendário técnico"] },
  { id: "visita-tecnica", label: "Visita Técnica", icon: ClipboardCheck, route: "/visita-tecnica", matchRoutes: ["/visita-tecnica/nova", "/visita-tecnica/:id"], section: "Campo e Assistência Técnica", order: 2, platforms: ["desktop"], searchKeywords: ["visita", "campo", "visita técnica", "atendimento em campo"] },
  { id: "aplicacoes", label: "Aplicações", icon: Sprout, route: "/aplicacoes", section: "Campo e Assistência Técnica", order: 3, platforms: ["desktop"], searchKeywords: ["aplicação", "manejo", "aplicações", "campo"] },
  { id: "equipe-tecnica", label: "Equipe Técnica", icon: Users, route: "/consultor-tecnico", section: "Campo e Assistência Técnica", order: 4, platforms: ["desktop"], searchKeywords: ["consultor", "técnico", "equipe", "técnicos", "consultores"] },
  { id: "fluxo-tecnico", label: "Fluxo Técnico", icon: GitPullRequestArrow, route: "/fluxo-tecnico", section: "Campo e Assistência Técnica", order: 5, platforms: ["desktop"], searchKeywords: ["fluxo", "processo técnico", "fluxo técnico", "atendimento técnico", "etapas técnicas"] },
  { id: "monitoramento", label: "Monitoramento", icon: Clock, route: "/monitoramento-alertas", section: "Campo e Assistência Técnica", order: 6, platforms: ["desktop"], searchKeywords: ["monitoramento", "sla", "acompanhamento", "retorno"] },
  { id: "previsao-climatica", label: "Previsão Climática", icon: CloudSun, route: "/previsao-agronomica", section: "Campo e Assistência Técnica", order: 7, platforms: ["desktop"], searchKeywords: ["clima", "previsão climática", "meteorologia", "previsão", "tempo"] },

  // ── Produção ───────────────────────────────────────────────────────
  { id: "dashboard-producao", label: "Dashboard Produção", icon: Activity, route: "/operacao/dashboard-producao", section: "Produção", subSection: "Acompanhamento", order: 1, platforms: ["desktop"], searchKeywords: ["produção", "dashboard", "dashboard produção", "indicadores produção"] },
  { id: "cockpit-lab", label: "Cockpit Laboratório", icon: FlaskConical, route: "/cockpit-laboratorio", section: "Produção", subSection: "Central Operacional", order: 2, platforms: ["desktop"], searchKeywords: ["laboratório", "laboratorio", "lab", "cockpit", "cockpit laboratório", "central operacional", "produção laboratório"] },
  { id: "planejamento-producao", label: "Planejamento Produção", icon: Factory, route: "/operacao/planejamento", matchRoutes: ["/operacao/planejamento/:id"], section: "Produção", subSection: "Fluxo de Produção", order: 3, platforms: ["desktop"], searchKeywords: ["planejamento", "produção", "planejamento produção", "programação produção"] },
  { id: "ordens-servico", label: "Ordens de Serviço", icon: ClipboardList, route: "/ordens-servico", section: "Produção", subSection: "Fluxo de Produção", order: 4, platforms: ["desktop"], searchKeywords: ["os", "ordem", "ordens de serviço", "produção"] },
  { id: "lotes", label: "Lotes", icon: Boxes, route: "/lotes", section: "Produção", subSection: "Fluxo de Produção", order: 5, platforms: ["desktop"], searchKeywords: ["lote", "produção", "lotes"] },
  { id: "cq", label: "Controle de Qualidade", icon: ShieldCheck, route: "/controle-qualidade", section: "Produção", subSection: "Fluxo de Produção", order: 6, platforms: ["desktop"], searchKeywords: ["cq", "qualidade", "controle", "controle de qualidade", "laboratório"] },
  { id: "envase", label: "Envase", icon: Package, route: "/envase", section: "Produção", subSection: "Fluxo de Produção", order: 7, platforms: ["desktop"], searchKeywords: ["envase", "envasar", "embalar", "embalagens", "produção"] },
  { id: "estoque", label: "Estoque", icon: Warehouse, route: "/estoque", matchRoutes: ["/estoque/embalagens"], section: "Produção", subSection: "Fluxo de Produção", order: 8, platforms: ["desktop"], searchKeywords: ["inventário", "insumo", "embalagem", "estoque", "insumos", "embalagens"] },
  { id: "entregas", label: "Entregas", icon: Truck, route: "/entregas", matchRoutes: ["/entregas/:id/formulario"], section: "Produção", subSection: "Fluxo de Produção", order: 9, platforms: ["desktop"], searchKeywords: ["entrega", "logística", "entregas", "expedição"] },

  // ── Financeiro ─────────────────────────────────────────────────────────────
  { id: "fin-dashboard", label: "Financeiro", icon: PieChart, route: "/financeiro", section: "Financeiro", subSection: "Visão Geral", order: 1, platforms: ["desktop"], searchKeywords: ["financeiro", "dashboard", "visão financeira", "dashboard financeiro"] },
  { id: "fin-fluxo", label: "Fluxo de Caixa", icon: TrendingUp, route: "/financeiro/fluxo-caixa", section: "Financeiro", subSection: "Visão Geral", order: 2, platforms: ["desktop"], searchKeywords: ["caixa", "cashflow", "fluxo de caixa", "entradas", "saídas", "saldo"] },
  { id: "fin-dre", label: "DRE Gerencial", icon: FileBarChart2, route: "/financeiro/dre", section: "Financeiro", subSection: "Visão Geral", order: 3, platforms: ["desktop"], searchKeywords: ["dre", "resultado", "demonstrativo", "receitas", "despesas"] },
  { id: "fin-relatorios", label: "Relatórios Financeiros", icon: FileText, route: "/financeiro/relatorios", matchRoutes: ["/financeiro/relatorios/mensal", "/financeiro/relatorios/contas-receber", "/financeiro/relatorios/contas-pagar", "/financeiro/relatorios/inadimplencia", "/financeiro/relatorios/nfe-pendente", "/financeiro/relatorios/entregas-faturamento", "/financeiro/relatorios/por-cliente", "/financeiro/relatorios/prestacao-contas"], section: "Financeiro", subSection: "Visão Geral", order: 4, platforms: ["desktop"], searchKeywords: ["relatório financeiro", "relatórios", "relatórios financeiros", "prestação de contas", "exportações"] },
  { id: "fin-receber", label: "Contas a Receber", icon: ArrowUpCircle, route: "/financeiro/receber", section: "Financeiro", subSection: "Movimentações", order: 5, platforms: ["desktop"], searchKeywords: ["receber", "ar", "cliente", "contas a receber", "recebimentos", "títulos", "parcelas"] },
  { id: "fin-pagar", label: "Contas a Pagar", icon: ArrowDownCircle, route: "/financeiro/pagar", section: "Financeiro", subSection: "Movimentações", order: 6, platforms: ["desktop"], searchKeywords: ["pagar", "ap", "fornecedor", "contas a pagar", "despesas", "pagamentos"] },
  { id: "fin-ent-nfat", label: "Entregas sem Fatura", icon: Truck, route: "/financeiro/entregas-nao-faturadas", section: "Financeiro", subSection: "Movimentações", order: 7, platforms: ["desktop"], searchKeywords: ["fatura", "entregas sem fatura", "não faturado", "não faturadas", "faturamento pendente"] },
  { id: "fin-nfe", label: "Notas Fiscais", icon: FileSpreadsheet, route: "/financeiro/notas-fiscais", section: "Financeiro", subSection: "Movimentações", order: 8, platforms: ["desktop"], searchKeywords: ["nota fiscal", "notas fiscais", "nfe", "nf-e", "nfs-e", "fiscal"] },
  { id: "fin-recibos", label: "Recibos", icon: Receipt, route: "/financeiro/recibos", section: "Financeiro", subSection: "Movimentações", order: 9, platforms: ["desktop"], searchKeywords: ["recibo", "recibos", "comprovantes", "recebimento"] },
  { id: "fin-recorrencias", label: "Recorrências", icon: Repeat, route: "/financeiro/recorrencias", section: "Financeiro", subSection: "Movimentações", order: 10, platforms: ["desktop"], searchKeywords: ["recorrente", "assinatura", "recorrências", "recorrentes", "automação financeira"] },
  { id: "fin-categorias", label: "Categorias", icon: FolderTree, route: "/financeiro/categorias", section: "Financeiro", subSection: "Cadastros Financeiros", order: 11, platforms: ["desktop"], searchKeywords: ["categoria financeira", "categorias", "categorias financeiras", "plano de contas"] },
  { id: "fin-cc", label: "Centros de Custo", icon: Building2, route: "/financeiro/centros-custo", section: "Financeiro", subSection: "Cadastros Financeiros", order: 12, platforms: ["desktop"], searchKeywords: ["centro de custo", "cc", "centros de custo", "rateio", "custos"] },
  { id: "fin-contas-bancarias", label: "Contas Bancárias", icon: Layers, route: "/financeiro/contas-bancarias", section: "Financeiro", subSection: "Cadastros Financeiros", order: 13, platforms: ["desktop"], searchKeywords: ["banco", "conta bancária", "contas bancárias", "bancos", "conta corrente"] },
  { id: "fin-formas-pgto", label: "Formas de Pagamento", icon: CreditCard, route: "/financeiro/formas-pagamento", section: "Financeiro", subSection: "Cadastros Financeiros", order: 14, platforms: ["desktop"], searchKeywords: ["forma de pagamento", "formas de pagamento", "pagamento", "condições"] },

  // ── Financeiro B2B ─────────────────────────────────────────────────────────
  { id: "b2b-visao", label: "Visão Geral B2B", icon: Handshake, route: "/financeiro/b2b", section: "Financeiro B2B", subSection: "Visão e Desempenho", order: 1, platforms: ["desktop"], searchKeywords: ["b2b", "visão geral", "visão geral b2b", "financeiro b2b", "parceiro"] },
  { id: "b2b-dashboard", label: "Dashboard B2B", icon: BarChart3, route: "/financeiro/b2b/dashboard", section: "Financeiro B2B", subSection: "Visão e Desempenho", order: 2, legacyRoutes: ["/comercial/dashboard-b2b"], platforms: ["desktop"], searchKeywords: ["dashboard b2b", "indicadores b2b"] },
  { id: "b2b-aging", label: "Aging", icon: Clock, route: "/financeiro/b2b/aging", section: "Financeiro B2B", subSection: "Visão e Desempenho", order: 3, platforms: ["desktop"], searchKeywords: ["aging", "vencido", "atraso", "inadimplência", "vencidos"] },
  { id: "b2b-previsao", label: "Previsão Receita", icon: CalendarClock, route: "/financeiro/b2b/previsao", section: "Financeiro B2B", subSection: "Visão e Desempenho", order: 4, platforms: ["desktop"], searchKeywords: ["previsão", "previsão de receita", "receita futura", "forecast", "projeção"] },
  { id: "b2b-rentabilidade", label: "Rentabilidade", icon: PieChart, route: "/financeiro/b2b/rentabilidade", section: "Financeiro B2B", subSection: "Visão e Desempenho", order: 5, platforms: ["desktop"], searchKeywords: ["rentabilidade", "margem", "lucro", "lucro b2b"] },
  { id: "b2b-alertas", label: "Alertas Financeiros", icon: AlertTriangle, route: "/financeiro/b2b/alertas", section: "Financeiro B2B", subSection: "Visão e Desempenho", order: 6, platforms: ["desktop"], searchKeywords: ["alerta financeiro", "alertas financeiros", "risco financeiro", "pendência financeira"] },
  { id: "b2b-governanca", label: "Governança", icon: ShieldCheck, route: "/financeiro/b2b/governanca", section: "Financeiro B2B", subSection: "Governança", order: 7, platforms: ["desktop"], searchKeywords: ["governança", "governanca", "aprovação", "fluxo de decisão"] },
  { id: "b2b-central-gov", label: "Central Governança", icon: ClipboardCheck, route: "/financeiro/b2b/central-governanca", section: "Financeiro B2B", subSection: "Governança", order: 8, platforms: ["desktop"], searchKeywords: ["central de governança", "central governança", "governança", "pendências de governança"] },
  { id: "b2b-regras-gov", label: "Regras Governança", icon: FileSpreadsheet, route: "/financeiro/b2b/regras", section: "Financeiro B2B", subSection: "Governança", order: 9, platforms: ["desktop"], searchKeywords: ["regras", "regras de governança", "governança", "políticas", "aprovação"] },
  { id: "b2b-socios", label: "Dashboard Sócios", icon: Users, route: "/executivo/socios-b2b", section: "Financeiro B2B", subSection: "Governança", order: 10, platforms: ["desktop"], searchKeywords: ["sócios", "socios", "dashboard sócios", "executivo", "visão societária"] },

  // ── Inteligência e Controle ────────────────────────────────────────────────
  { id: "bi-agronomico", label: "BI Agronômico", icon: BrainCircuit, route: "/bi-agronomico", section: "Inteligência e Controle", subSection: "Inteligência", order: 1, platforms: ["desktop"], searchKeywords: ["bi", "bi agronômico", "agronomia", "agronômico", "indicador agronômico", "indicadores agronômicos", "produtividade", "culturas", "fazendas", "aplicações", "manejo", "resultados agronômicos"] },
  { id: "bi-operacional", label: "BI Operacional", icon: Activity, route: "/bi-operacional", section: "Inteligência e Controle", subSection: "Inteligência", order: 2, platforms: ["desktop"], searchKeywords: ["bi", "bi operacional", "operacional", "indicadores operacionais", "desempenho", "produtividade operacional", "solicitações", "visitas", "produção", "entregas"] },
  { id: "relatorios", label: "Relatórios Gerenciais", icon: BarChart3, route: "/relatorios", section: "Inteligência e Controle", subSection: "Inteligência", order: 3, platforms: ["desktop"], searchKeywords: ["relatório", "relatórios", "relatório gerencial", "relatórios gerenciais", "relatórios estratégicos", "gestão", "exportações", "indicadores", "gerencial"] },
  { id: "alertas", label: "Alertas", icon: Siren, route: "/alertas-operacionais", section: "Inteligência e Controle", subSection: "Controle", order: 4, badgeSlot: "alertas", platforms: ["desktop"], searchKeywords: ["alerta", "alertas", "alertas gerais", "central de alertas", "ocorrências", "riscos", "pendências", "sla", "prioridades", "notificação"] },
  { id: "auditorias", label: "Auditorias", icon: ShieldCheck, route: "/auditoria", legacyRoutes: ["/auditoria-sync", "/financeiro/auditoria"], section: "Inteligência e Controle", subSection: "Controle", order: 5, platforms: ["desktop"], searchKeywords: ["auditoria", "auditorias", "auditoria geral", "auditorias gerais", "auditoria financeira", "trilha", "trilha financeira", "logs", "logs financeiros", "histórico", "rastreabilidade", "alterações", "eventos", "sync"] },

  // ── Administração ──────────────────────────────────────────────────────────
  { id: "configuracoes", label: "Configurações", icon: Settings, route: "/configuracoes", matchRoutes: ["/configuracoes/objetivos-visita", "/configuracoes/catalogo-ia", "/configuracoes/parametros-cq"], legacyRoutes: ["/financeiro/configuracoes"], section: "Administração", order: 1, platforms: ["desktop"], searchKeywords: ["configurações", "configuracoes", "config", "administração", "administracao", "ajustes", "parâmetros", "sistema", "preferências", "integrações", "usuários", "perfis", "configurações gerais", "configuracoes gerais", "administração geral", "administracao geral", "parâmetros gerais", "parametros gerais", "configurações financeiras", "configuracoes financeiras", "parâmetros financeiros", "parametros financeiros"] },
  { id: "config-fiscal", label: "Configuração Fiscal", icon: ShieldCheck, route: "/configuracoes/fiscal/empresa", section: "Administração", subSection: "Fiscal", order: 10.5, platforms: ["desktop"], searchKeywords: ["fiscal", "configuração fiscal", "configuracao fiscal", "nf-e", "nfe", "nfs-e", "nfse", "empresa fiscal", "homologação", "homologacao", "sefaz", "prefeitura", "certificado", "a1"] },

  // ── Fiscal (Fase 3.16 — preparação/homologação, sem emissão) ───────────────
  { id: "fiscal-prontidao", label: "Visão Geral Fiscal", icon: ListChecks, route: "/fiscal/prontidao", section: "Administração", subSection: "Fiscal", order: 10, platforms: ["desktop"], featureFlag: "fiscalReadinessCenterUi", searchKeywords: ["fiscal", "prontidão fiscal", "prontidao fiscal", "visão geral fiscal", "homologação", "homologacao", "nf-e", "nfs-e"] },
  { id: "fiscal-perfis-produtos", label: "Perfis Fiscais — Produtos", icon: Package, route: "/configuracoes/fiscal/produtos", legacyRoutes: ["/fiscal/perfis/produtos"], section: "Administração", subSection: "Fiscal", order: 11, platforms: ["desktop"], featureFlag: "fiscalProductProfilesUi", searchKeywords: ["perfil fiscal", "produtos", "ncm", "cest", "cfop", "fiscal", "nf-e", "/fiscal/perfis/produtos"] },
  { id: "fiscal-perfis-servicos", label: "Perfis Fiscais — Serviços", icon: ClipboardList, route: "/configuracoes/fiscal/servicos", legacyRoutes: ["/fiscal/perfis/servicos"], section: "Administração", subSection: "Fiscal", order: 12, platforms: ["desktop"], featureFlag: "fiscalServiceProfilesUi", searchKeywords: ["perfil fiscal", "serviços", "servicos", "iss", "lc116", "cnae", "nfs-e", "nfse", "/fiscal/perfis/servicos"] },
  { id: "fiscal-perfis-clientes", label: "Perfis Fiscais — Clientes", icon: Users, route: "/configuracoes/fiscal/clientes", legacyRoutes: ["/fiscal/perfis/clientes"], section: "Administração", subSection: "Fiscal", order: 13, platforms: ["desktop"], featureFlag: "fiscalCustomerProfilesUi", searchKeywords: ["perfil fiscal", "clientes", "destinatário", "destinatario", "contribuinte", "ie", "fiscal", "/fiscal/perfis/clientes"] },
  { id: "fiscal-rascunhos", label: "Rascunhos NF-e e NFS-e", icon: FileText, route: "/fiscal/documentos", section: "Administração", subSection: "Fiscal", order: 14, platforms: ["desktop"], featureFlag: "fiscalDocumentWorkflowUi", searchKeywords: ["rascunho", "rascunhos", "nf-e", "nfe", "nfs-e", "nfse", "homologação", "homologacao", "documento fiscal", "wizard fiscal"] },
  { id: "comunicacao-admin", label: "Comunicação", icon: Bell, route: "/comunicacao", section: "Administração", order: 20, platforms: ["desktop"], featureFlag: "comunicacaoModule", allowedRoles: ["administrador", "gestor"], searchKeywords: ["comunicação", "notificações", "templates", "regras", "outbox"] },




  // ── Mobile Consultor (tabs) ────────────────────────────────────────────────
  { id: "m-c-inicio", label: "Início", icon: Home, route: "/app", section: "Mobile Consultor", platforms: ["mobile-consultor", "mobile-produtor"], order: 1 },
  // Workspace único de atendimento técnico — substitui as abas separadas
  // "Demandas" (/app/solicitacoes) e "Registros" (/app/registros).
  { id: "m-c-atendimentos", label: "Atendimentos", icon: ClipboardList, route: "/app/atendimentos", section: "Mobile Consultor", platforms: ["mobile-consultor"], order: 2 },
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

/** Retorna todos os itens desktop agrupados por `section`, respeitando `DESKTOP_SECTION_ORDER` e `order`. */
export function desktopItemsBySection(): Array<{ section: NavSection; items: NavItem[] }> {
  const bySection = new Map<NavSection, NavItem[]>();
  for (const item of itemsForPlatform("desktop")) {
    const arr = bySection.get(item.section) ?? [];
    arr.push(item);
    bySection.set(item.section, arr);
  }
  return DESKTOP_SECTION_ORDER
    .map((section) => ({
      section,
      items: (bySection.get(section) ?? []).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    }))
    .filter((g) => g.items.length > 0);
}
