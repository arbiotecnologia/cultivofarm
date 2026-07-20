import {
  LayoutDashboard, Users, MapPin, Grid3X3, FileText,
  ClipboardList, CalendarClock, FlaskConical, ShieldCheck, Package,
  Warehouse, Truck, Sprout, BarChart3, Settings, GitPullRequestArrow, BrainCircuit, CloudSun, Inbox, Activity, ClipboardCheck, Clock,
  Wallet, ArrowDownCircle, ArrowUpCircle, FolderTree, Building2, Layers, CreditCard, PieChart,
  Repeat, FileSpreadsheet, Receipt, History, Cog, TrendingUp, FileBarChart2, Siren, Handshake, Factory, AlertTriangle, ChevronDown

} from "lucide-react";

import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { canAccess } from "@/lib/permissions";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { LogoDisplay } from "@/components/LogoDisplay";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { AlertasBadgeMenu } from "@/components/alertas/AlertasBadgeMenu";

type MenuItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  badge?: string;
};

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Portal Executivo", url: "/executivo", icon: Activity },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Solicitações", url: "/solicitacoes", icon: Inbox },
  { title: "Agenda Técnica", url: "/agenda-tecnica", icon: CalendarClock },
  { title: "Visita Técnica", url: "/visita-tecnica", icon: ClipboardCheck },
  { title: "BI Agronômico", url: "/bi-agronomico", icon: BrainCircuit },
  { title: "Portal do Produtor", url: "/portal", icon: LayoutDashboard },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

const operationalItems: MenuItem[] = [
  { title: "Ordens de Serviço", url: "/ordens-servico", icon: ClipboardList },
  { title: "Cockpit Laboratório", url: "/cockpit-laboratorio", icon: FlaskConical },
  { title: "Planejamento Produção", url: "/operacao/planejamento", icon: Factory },
  { title: "Dashboard Produção", url: "/operacao/dashboard-producao", icon: Activity },
  { title: "Estoque", url: "/estoque", icon: Warehouse },
  { title: "Entregas", url: "/entregas", icon: Truck },
  { title: "Aplicações", url: "/aplicacoes", icon: Sprout },
  { title: "Painel Operacional", url: "/painel-operacional", icon: Activity },
];

const auxiliaryItems: MenuItem[] = [
  { title: "Lotes", url: "/lotes", icon: FlaskConical, badge: "Técnico" },
  { title: "Controle de Qualidade", url: "/controle-qualidade", icon: ShieldCheck, badge: "Técnico" },
  { title: "Envase", url: "/envase", icon: Package, badge: "Técnico" },
];

const secondaryItems: MenuItem[] = [
  { title: "Fazendas", url: "/fazendas", icon: MapPin },
  { title: "Protocolos", url: "/protocolos", icon: FileText },
  { title: "Equipe Técnica", url: "/consultor-tecnico", icon: Users },
  { title: "Fluxo Técnico", url: "/fluxo-tecnico", icon: GitPullRequestArrow },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  { title: "BI Operacional", url: "/bi-operacional", icon: Activity },
  { title: "Alertas", url: "/alertas-operacionais", icon: Siren },
  { title: "Monitoramento", url: "/monitoramento-alertas", icon: Clock },
  { title: "Previsão Climática", url: "/previsao-agronomica", icon: CloudSun },

  { title: "Auditorias", url: "/auditoria", icon: ShieldCheck },
];


const financialItems: MenuItem[] = [
 { title: "Financeiro", url: "/financeiro", icon: PieChart },
 { title: "Fluxo de Caixa", url: "/financeiro/fluxo-caixa", icon: TrendingUp },
 { title: "DRE Gerencial", url: "/financeiro/dre", icon: FileBarChart2 },
 { title: "Relatórios", url: "/financeiro/relatorios", icon: FileBarChart2 },
 { title: "Recibos", url: "/financeiro/recibos", icon: Receipt },
 { title: "Contas a Receber", url: "/financeiro/receber", icon: ArrowUpCircle },
 { title: "Contas a Pagar", url: "/financeiro/pagar", icon: ArrowDownCircle },
  { title: "Categorias", url: "/financeiro/categorias", icon: FolderTree },
  { title: "Centros de Custo", url: "/financeiro/centros-custo", icon: Building2 },
  { title: "Contas Bancárias", url: "/financeiro/contas-bancarias", icon: Layers },
  { title: "Formas de Pagamento", url: "/financeiro/formas-pagamento", icon: CreditCard },
  { title: "Recorrências", url: "/financeiro/recorrencias", icon: Repeat },
  { title: "Notas Fiscais", url: "/financeiro/notas-fiscais", icon: FileSpreadsheet },
  { title: "Entregas s/ Fatura", url: "/financeiro/entregas-nao-faturadas", icon: Receipt },
  { title: "Auditoria", url: "/financeiro/auditoria", icon: History },
  { title: "Configurações Fin.", url: "/financeiro/configuracoes", icon: Cog },
];

const financialB2BItems: MenuItem[] = [
  { title: "Visão Geral B2B", url: "/financeiro/b2b", icon: Handshake },
  { title: "Dashboard B2B", url: "/financeiro/b2b/dashboard", icon: TrendingUp },
  { title: "Governança", url: "/financeiro/b2b/governanca", icon: ShieldCheck },
  { title: "Aging", url: "/financeiro/b2b/aging", icon: BarChart3 },
  { title: "Previsão Receita", url: "/financeiro/b2b/previsao", icon: TrendingUp },
  { title: "Rentabilidade", url: "/financeiro/b2b/rentabilidade", icon: BarChart3 },
  { title: "Alertas Financeiros", url: "/financeiro/b2b/alertas", icon: AlertTriangle },
  { title: "Central Governança", url: "/financeiro/b2b/central-governanca", icon: ShieldCheck },
  { title: "Regras Governança", url: "/financeiro/b2b/regras", icon: ShieldCheck },
  { title: "Dashboard Sócios", url: "/executivo/socios-b2b", icon: TrendingUp },
];

const comercialItems: MenuItem[] = [
  { title: "Dashboard Consolidado", url: "/comercial/dashboard-consolidado", icon: BarChart3 },
  { title: "Indicadores", url: "/comercial/indicadores", icon: BarChart3 },
  { title: "Pedidos B2B", url: "/comercial/pedidos-b2b", icon: ClipboardCheck },
  { title: "Solicitações B2B", url: "/comercial/solicitacoes-b2b", icon: Inbox },

  
  { title: "Campanhas", url: "/comercial/campanhas", icon: TrendingUp },
  { title: "Catálogo", url: "/comercial/catalogo", icon: FlaskConical },
  { title: "Simulador", url: "/comercial/simulador", icon: BarChart3 },
  { title: "Alertas Comerciais", url: "/comercial/alertas", icon: AlertTriangle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  const { role } = useAuth();
  const { config } = useSystemConfig();

  const logoUrl = config?.logo_url;
  const nomeEmpresa = config?.nome_empresa || "AR Bio";

  const isActive = (path: string) => {
    if (path === "/") return currentPath === "/";
    return currentPath.startsWith(path);
  };

  const visibleItems = menuItems.filter(item => canAccess(role, item.url));
  const visibleOperational = operationalItems.filter(item => canAccess(role, item.url));
  const visibleAuxiliary = auxiliaryItems.filter(item => canAccess(role, item.url));
  const visibleSecondary = secondaryItems.filter(item => canAccess(role, item.url));
  const visibleFinancial = financialItems.filter(item => canAccess(role, item.url));
  const visibleFinancialB2B = financialB2BItems.filter(item => canAccess(role, item.url));
  const visibleComercial = comercialItems.filter(item => canAccess(role, item.url));
  const isB2BFinanceiroActive = currentPath.startsWith("/financeiro/b2b") || currentPath === "/executivo/socios-b2b";
  // Grupo "Financeiro B2B" inicia aberto por padrão (espelha os demais grupos).
  const [b2bFinOpen, setB2bFinOpen] = useState(true);
  // Mantém referência para destacar o item ativo mesmo com o grupo aberto.
  void isB2BFinanceiroActive;

  const renderItem = (item: MenuItem) => {
    const isCockpit = item.url === "/cockpit-laboratorio";
    const isProducao = role === "producao" || role === "operador_onfarm";

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton 
          asChild 
          isActive={isActive(item.url)}
          className={cn(
            isCockpit && isProducao && "bg-primary/5 hover:bg-primary/10 border border-primary/20"
          )}
        >
          <NavLink
            to={item.url}
            end={item.url === "/"}
            className="hover:bg-sidebar-accent"
            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
          >
            <item.icon className={cn("h-4 w-4", isCockpit && isProducao && "text-primary")} />
            {!collapsed && (
              <span className="flex items-center gap-2 flex-1 min-w-0">
                <span className={cn("truncate", isCockpit && isProducao && "font-bold text-primary")}>
                  {item.title}
                </span>
                {item.url === "/alertas-operacionais" ? (
                  <AlertasBadgeMenu />
                ) : (
                  item.badge && (
                    <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      {item.badge}
                    </span>
                  )
                )}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };


  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <LogoDisplay size="sm" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-accent-foreground">{nomeEmpresa}</span>
              <span className="text-[10px] text-sidebar-foreground">On-Farm Manager</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{visibleItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleOperational.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Operação</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{visibleOperational.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleAuxiliary.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Técnico / Auditoria</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{visibleAuxiliary.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleFinancial.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Financeiro</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{visibleFinancial.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleFinancialB2B.length > 0 && (
          <Collapsible open={b2bFinOpen} onOpenChange={setB2bFinOpen}>
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer flex items-center justify-between hover:text-foreground">
                  <span>Financeiro B2B</span>
                  <ChevronDown className={cn("h-3 w-3 transition-transform", b2bFinOpen && "rotate-180")} />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>{visibleFinancialB2B.map(renderItem)}</SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {visibleComercial.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Comercial</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{visibleComercial.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}


        {visibleSecondary.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Gestão e Estratégico</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{visibleSecondary.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
