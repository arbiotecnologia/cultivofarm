import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { PwaUpdateNotifier } from "@/pwa/PwaUpdateNotifier";
import { PwaUpdateControl } from "@/pwa/PwaUpdateControl";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import { isPathEntitled } from "@/lib/saas/featureRouteMap";
import ForaDoPlano from "@/components/guards/ForaDoPlano";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { canAccess, getHomeForRole } from "@/lib/permissions";
import {
  readActiveContext,
  resolveEffectiveRouteRole,
} from "@/lib/navigation/portalRoleContext";

import { AppLayout } from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import Index from "@/pages/Index";
import DashboardUnificado from "@/pages/dashboard/DashboardUnificado";
import { PreservedNavigate } from "@/components/PreservedNavigate";
import SelecionarPortal from "@/pages/SelecionarPortal";
import AcessoPendente from "@/pages/AcessoPendente";
import SemPermissao from "@/pages/SemPermissao";
import PlataformaHome from "@/pages/plataforma/PlataformaHome";
import { PlataformaGuard } from "@/components/guards/PlataformaGuard";
import { B2BRouteGuard } from "@/components/guards/B2BRouteGuard";
import { AppPortalGuard } from "@/components/guards/AppPortalGuard";
import { TechnicalFeatureGuard } from "@/components/guards/TechnicalFeatureGuard";
import { ProducerFeatureGuard } from "@/components/guards/ProducerFeatureGuard";
import { VisitaRouteGuard } from "@/components/guards/VisitaRouteGuard";
import { EntitlementOutlet } from "@/components/guards/EntitlementOutlet";
import Clientes from "@/pages/Clientes";
import Fazendas from "@/pages/Fazendas";
import Talhoes from "@/pages/Talhoes";
import FazendaDetalhe from "@/pages/FazendaDetalhe";
import Protocolos from "@/pages/Protocolos";

import OrdensServico from "@/pages/OrdensServico";
import ClienteDetalhe from "@/pages/ClienteDetalhe";
import ParceiroDetalhe from "@/pages/ParceiroDetalhe";

import Lotes from "@/pages/Lotes";
import ControleQualidade from "@/pages/ControleQualidade";
import EnvasePage from "@/pages/EnvasePage";
import Estoque from "@/pages/Estoque";
import EstoqueEmbalagens from "@/pages/EstoqueEmbalagens";
import Entregas from "@/pages/Entregas";
import Aplicacoes from "@/pages/Aplicacoes";
import Configuracoes from "@/pages/Configuracoes";
import ObjetivosVisita from "@/pages/configuracoes/ObjetivosVisita";
import ConfigCatalogoIA from "@/pages/configuracoes/ConfigCatalogoIA";
import ParametrosCQPage from "@/pages/configuracoes/ParametrosCQPage";
import FiscalEmpresa from "@/pages/configuracoes/FiscalEmpresa";
import FiscalProdutos from "@/pages/configuracoes/FiscalProdutos";
import FiscalServicos from "@/pages/configuracoes/FiscalServicos";
import FiscalClientes from "@/pages/configuracoes/FiscalClientes";
import FiscalDocumentos from "@/pages/fiscal/FiscalDocumentos";
import FiscalReconciliacao from "@/pages/fiscal/FiscalReconciliacao";
import FiscalProntidao from "@/pages/fiscal/FiscalProntidao";
import Relatorios from "@/pages/Relatorios";
import ConsultorTecnico from "@/pages/ConsultorTecnico";
import FinanceiroDashboard from "@/pages/financeiro/FinanceiroDashboard";
import ContasReceber from "@/pages/financeiro/ContasReceber";
import ContasPagar from "@/pages/financeiro/ContasPagar";
import FinCategorias from "@/pages/financeiro/Categorias";
import FinCentrosCusto from "@/pages/financeiro/CentrosCusto";
import FinContasBancarias from "@/pages/financeiro/ContasBancarias";
import FinFormasPagamento from "@/pages/financeiro/FormasPagamento";
import FinRecorrencias from "@/pages/financeiro/Recorrencias";
import FinNotasFiscais from "@/pages/financeiro/NotasFiscais";
import FinEntregasNaoFaturadas from "@/pages/financeiro/EntregasNaoFaturadas";
import FinFluxoCaixa from "@/pages/financeiro/FluxoCaixa";
import FinDRE from "@/pages/financeiro/DRE";
import FinRelatorios from "@/pages/financeiro/FinanceiroRelatorios";
import FinRecibos from "@/pages/financeiro/RecibosList";
import RelMensal from "@/pages/financeiro/relatorios/RelatorioMensal";
import RelReceber from "@/pages/financeiro/relatorios/RelatorioContasReceber";
import RelPagar from "@/pages/financeiro/relatorios/RelatorioContasPagar";
import RelInadimplencia from "@/pages/financeiro/relatorios/RelatorioInadimplencia";
import RelNFePendente from "@/pages/financeiro/relatorios/RelatorioNFePendente";
import RelEntregasFat from "@/pages/financeiro/relatorios/RelatorioEntregasFaturamento";
import RelPorCliente from "@/pages/financeiro/relatorios/RelatorioPorCliente";
import RelPrestacaoContas from "@/pages/financeiro/relatorios/PrestacaoContas";
import PortalFinanceiro from "@/pages/portal/PortalFinanceiro";

import FluxoTecnico from "@/pages/FluxoTecnico";
import BIAgronomico from "@/pages/BIAgronomico";

import PrevisaoAgronomica from "@/pages/PrevisaoAgronomica";
import TalhaoHistorico from "@/pages/TalhaoHistorico";
import AuditoriaSync from "@/pages/AuditoriaSync";
import Auditoria from "@/pages/Auditoria";
import VisitaTecnica from "@/pages/VisitaTecnica";
import VisitaTecnicaLista from "@/pages/VisitaTecnicaLista";

import MonitoramentoAlertas from "@/pages/MonitoramentoAlertas";
import CockpitLaboratorio from "@/pages/CockpitLaboratorio";
import BIOperacional from "@/pages/BIOperacional";
import AlertasOperacionais from "@/pages/AlertasOperacionais";
import NotFound from "@/pages/NotFound";
import FormularioEntregaPrint from "@/pages/entregas/FormularioEntregaPrint";
import ValidarEntrega from "@/pages/public/ValidarEntrega";
import EtiquetaProdutoPrintPage from "@/pages/etiquetas/EtiquetaProdutoPrintPage";
import RastrearProduto from "@/pages/public/RastrearProduto";


// Portal do Produtor
import PortalLayout from "@/pages/portal/PortalLayout";
import PortalDashboard from "@/pages/portal/PortalDashboard";

// Mobile App
import MobileLayout from "@/pages/app/MobileLayout";
import MobileLogin from "@/pages/app/MobileLogin";
import MobileDashboard from "@/pages/app/MobileDashboard";
import MobilePerfil from "@/pages/app/MobilePerfil";
import MobilePlaceholder from "@/pages/app/MobilePlaceholder";
import MobileFazendas from "@/pages/app/MobileFazendas";
import MobileRegistrarOcorrencia from "@/pages/app/MobileRegistrarOcorrencia";
import MobileOrdens from "@/pages/app/MobileOrdens";
import MobileNotificacoes from "@/pages/app/MobileNotificacoes";
import MobileEntregas from "@/pages/app/MobileEntregas";
import MobileAtendimentos from "@/pages/app/MobileAtendimentos";
import MobileRecomendacoesProdutor from "@/pages/app/MobileRecomendacoesProdutor";
import MobileAplicacoes from "@/pages/app/MobileAplicacoes";
import MobileListaAplicacoes from "@/pages/app/MobileListaAplicacoes";
import MobileSolicitar from "@/pages/app/MobileSolicitar";
import MobileCheckin from "@/pages/app/MobileCheckin";
import MobileVisita from "@/pages/app/MobileVisita";
import MobileTalhaoHistorico from "@/pages/app/MobileTalhaoHistorico";
import MobileCatalogoTecnico from "@/pages/app/MobileCatalogoTecnico";
import { ComunicacaoRouteGuard } from "@/features/comunicacao/RouteGuard";
import ComunicacaoAdminPage from "@/features/comunicacao/ui/ComunicacaoAdminPage";
import CentralNotificacoes from "@/pages/CentralNotificacoes";


import PedidosB2B from "@/pages/comercial/PedidosB2B";
import DashboardB2B from "@/pages/comercial/DashboardB2B";
import PlanejamentoProducao from "@/pages/operacao/PlanejamentoProducao";
import PlanejamentoProducaoDetalhe from "@/pages/operacao/PlanejamentoProducaoDetalhe";
import DashboardProducao from "@/pages/operacao/DashboardProducao";
import PortalParceiroLayout from "@/pages/portal-parceiro/PortalParceiroLayout";
import ParceiroMeusPedidos from "@/pages/portal-parceiro/MeusPedidos";
import ParceiroNovoPedido from "@/pages/portal-parceiro/NovoPedido";
import ParceiroHistorico from "@/pages/portal-parceiro/Historico";
import ParceiroFinanceiro from "@/pages/portal-parceiro/Financeiro";
import ParceiroDashboardRouter from "@/pages/portal-parceiro/DashboardRouter";
import ParceiroFavoritos from "@/pages/portal-parceiro/Favoritos";
import ParceiroMeuHistorico from "@/pages/portal-parceiro/MeuHistorico";
import ParceiroFichasTecnicas from "@/pages/portal-parceiro/FichasTecnicas";
import ParceiroHistoricoSimulacoes from "@/pages/portal-parceiro/HistoricoSimulacoes";
import ParceiroSimulacoesEquipe from "@/pages/portal-parceiro/SimulacoesEquipe";
import ParceiroMeusProdutoresTecnico from "@/pages/portal-parceiro/MeusProdutoresTecnico";
import ParceiroDetalheProdutorTecnico from "@/pages/portal-parceiro/DetalheProdutorTecnico";
import ParceiroTecnicosProdutores from "@/pages/portal-parceiro/TecnicosProdutores";
import ParceiroUsuariosClientesB2B from "@/pages/portal-parceiro/UsuariosClientesB2B";
import ParceiroSolicitacoes from "@/pages/portal-parceiro/Solicitacoes";
import PortalParceiroPerfil from "@/pages/portal-parceiro/PortalParceiroPerfil";
import ComercialSolicitacoesB2B from "@/pages/comercial/SolicitacoesB2B";
// PortalMeusPedidos removido do fluxo do produtor (Fase 2 - reformulação B2B). Componente preservado para uso interno futuro.
import CampanhasComerciais from "@/pages/comercial/CampanhasComerciais";
import SimuladorComercial from "@/pages/comercial/SimuladorComercial";
import IndicadoresComerciais from "@/pages/comercial/IndicadoresComerciais";
import AlertasComerciais from "@/pages/comercial/AlertasComerciais";

import DashboardConsolidadoB2B from "@/pages/comercial/DashboardConsolidadoB2B";
import CommercialPaymentPlansPage from "@/pages/comercial/CommercialPaymentPlansPage";
import AuditoriaMotorB2B from "@/pages/comercial/AuditoriaMotorB2B";
import FinanceiroB2B from "@/pages/financeiro/FinanceiroB2B";
import DashboardFinanceiroB2B from "@/pages/financeiro/DashboardFinanceiroB2B";
import GovernancaFinanceiraB2B from "@/pages/financeiro/GovernancaFinanceiraB2B";
import AgingFinanceiroB2B from "@/pages/financeiro/AgingFinanceiroB2B";
import PrevisaoReceitaB2B from "@/pages/financeiro/PrevisaoReceitaB2B";
import RentabilidadeParceirosB2B from "@/pages/financeiro/RentabilidadeParceirosB2B";
import AlertasFinanceirosB2B from "@/pages/financeiro/AlertasFinanceirosB2B";
import CentralGovernancaB2B from "@/pages/financeiro/CentralGovernancaB2B";
import RegrasGovernancaB2B from "@/pages/financeiro/RegrasGovernancaB2B";
import DashboardSociosB2B from "@/pages/executivo/DashboardSociosB2B";
import Solicitacoes from "@/pages/Solicitacoes";
import AgendaTecnica from "@/pages/AgendaTecnica";
import PortalFazendas from "@/pages/portal/PortalFazendas";
import PortalFazendaDetalhe from "@/pages/portal/PortalFazendaDetalhe";
import PortalRegistros from "@/pages/portal/PortalRegistros";
import PortalRegistroDetalhe from "@/pages/portal/PortalRegistroDetalhe";
import PortalRecomendacoes from "@/pages/portal/PortalRecomendacoes";
import PortalFilaAprovacao from "@/pages/portal/PortalFilaAprovacao";
import PortalOrdensServico from "@/pages/portal/PortalOrdensServico";
import PortalTalhaoDetalhe from "@/pages/portal/PortalTalhaoDetalhe";
import PortalProducao from "@/pages/portal/PortalProducao";
import PortalEntregas from "@/pages/portal/PortalEntregas";
import PortalAcompanhamento from "@/pages/portal/PortalAcompanhamento";

import PortalAplicacoes from "@/pages/portal/PortalAplicacoes";
import PortalSolicitacao from "@/pages/portal/PortalSolicitacao";
import PortalAgenda from "@/pages/portal/PortalAgenda";
import PortalPerfil from "@/pages/portal/PortalPerfil";
import { ErrorRecovery } from "@/components/ErrorRecovery";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Fase 2B/C — reduz Disk I/O evitando refetch em cada foco/mount.
      // Hooks que precisam de dados frescos (polling, tempo real) sobrescrevem localmente.
      staleTime: 5 * 60 * 1000, // 5 min
      gcTime: 10 * 60 * 1000,   // 10 min
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

function RoleGuard({ children }: { children: React.ReactNode }) {
  const { role, roles } = useAuth();
  const location = useLocation();
  const entitlements = useEntitlements();

  // H9-G Bloco 2E — decisão canônica considerando o contexto de portal ativo,
  // evitando que o `primaryRole` (prioridade fixa) descarte o portal escolhido.
  const activeContext = readActiveContext();
  const { allowed } = resolveEffectiveRouteRole({
    roles,
    primaryRole: role,
    path: location.pathname,
    activeContext,
  });

  if (!allowed) {
    return <Navigate to="/sem-permissao" state={{ from: location.pathname }} replace />;
  }

  // Fase S3 — plano contratado restringe (nunca amplia) o que o perfil permite.
  if (!isPathEntitled(location.pathname, entitlements)) {
    return <ForaDoPlano status={entitlements.status} />;
  }

  return <>{children}</>;
}


function ProtectedRoutes() {
  const { user, role, loading, error, refresh, signOut } = useAuth();
  const location = useLocation();

  useSystemConfig();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground flex flex-col items-center gap-2">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          Carregando...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorRecovery 
        message={error} 
        onRetry={refresh} 
        onSignOut={signOut}
      />
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Redirecionamento baseado no perfil para a Home correta
  const homePath = getHomeForRole(role);
  if (location.pathname === "/" && homePath !== "/") {
    return <Navigate to={homePath} replace />;
  }

  return <AppLayout />;
}

export function PortalGuard() {
  const { user, roles, loading, error, refresh, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground flex flex-col items-center gap-2">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          Carregando...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorRecovery
        message={error}
        onRetry={refresh}
        onSignOut={signOut}
      />
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Autorização de contexto: /portal/* é exclusivo do Portal Produtor.
  // Admin mantém acesso legado (suporte/impersonação). Multipapel funciona
  // porque a checagem é feita na lista completa de roles — nunca em
  // primaryRole nem em local/session storage.
  const isProducer = roles.includes("cliente_produtor");
  const isAdmin = roles.includes("administrador");
  if (!isProducer && !isAdmin) {
    return <Navigate to="/sem-permissao" replace />;
  }

  // Foundation de cache (mesma identidade): boundary esconde/remonta conteúdo
  // sensível conforme a época de autorização. Gate fechado = sem alteração.
  return (
    <AuthzEpochBoundary>
      <PortalLayout />
    </AuthzEpochBoundary>
  );
}


// Roles cuja Home depende de RPC de contextos (Bloco 2 — multiportal).
// Demais roles (admin, gestor, financeiro, gestor_comercial, administrativo,
// producao, operador_onfarm, cliente_produtor) seguem o fluxo legado
// via getHomeForRole — sem alteração.
import { hasPortalRole } from "@/lib/portalContext";

const ADMIN_HOME_ROLES = [
  "administrador",
  "gestor",
  "gestor_comercial",
  "financeiro",
  "administrativo",
  "producao",
  "operador_onfarm",
] as const;

function AuthRoute() {
  const { user, roles, primaryRole, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground flex flex-col items-center gap-2">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          Autenticando...
        </div>
      </div>
    );
  }
  if (user) {
    // Multipapel Gestão/Técnico usa o resolver; contexto não amplia autorização.
    if ((roles.includes("gestor") || roles.includes("administrador")) && hasPortalRole(roles)) {
      return <Navigate to="/selecionar-portal" replace />;
    }
    // Prioridade administrativa: preserva a home de papéis internos únicos.
    if (primaryRole && (ADMIN_HOME_ROLES as readonly string[]).includes(primaryRole)) {
      return <Navigate to={getHomeForRole(primaryRole)} replace />;
    }
    // Multipapel de portal (B2B/Técnico) → resolver via RPC no seletor.
    if (hasPortalRole(roles)) {
      return <Navigate to="/selecionar-portal" replace />;
    }
    if (primaryRole === "cliente_produtor") {
      return <Navigate to="/app" replace />;
    }
    if (primaryRole) {
      return <Navigate to={getHomeForRole(primaryRole)} replace />;
    }
    return <Navigate to="/acesso-pendente" replace />;
  }
  return <Auth />;
}

/**
 * Wrapper com auth obrigatória para as rotas do Bloco 2
 * (`/selecionar-portal` e `/acesso-pendente`). Sem RoleGuard —
 * o próprio conteúdo lida com contextos via RPC segura.
 */
function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground flex items-center gap-2">
          <div className="h-6 w-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          Carregando…
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <PwaUpdateNotifier />
            <PwaUpdateControl />
            <Routes>
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/selecionar-portal" element={<AuthenticatedShell><SelecionarPortal /></AuthenticatedShell>} />
              <Route path="/acesso-pendente" element={<AuthenticatedShell><AcessoPendente /></AuthenticatedShell>} />
              <Route path="/sem-permissao" element={<AuthenticatedShell><SemPermissao /></AuthenticatedShell>} />
              {/* Home provisória do Superadmin de Plataforma (somente leitura, fora do ACCESS_MAP). */}
              <Route element={<PlataformaGuard />}>
                <Route path="/plataforma" element={<PlataformaHome />} />
                <Route path="/configuracoes/catalogo-ia" element={<ConfigCatalogoIA />} />
              </Route>
              <Route path="/validar-entrega/:token" element={<ValidarEntrega />} />
              <Route path="/rastrear-produto/:token" element={<RastrearProduto />} />

              {/* Mobile App */}
              <Route path="/app/login" element={<MobileLogin />} />
              <Route element={<AppPortalGuard />}>
                <Route element={<MobileLayout />}>
                  {/* Compartilhadas */}
                  <Route path="/app" element={<MobileDashboard />} />
                  <Route path="/app/perfil" element={<MobilePerfil />} />
                  <Route path="/app/notificacoes" element={<MobileNotificacoes />} />

                  {/* Somente técnico */}
                  <Route element={<TechnicalFeatureGuard />}>
                   <Route element={<EntitlementOutlet />}>
                    <Route path="/app/fazendas" element={<MobileFazendas />} />
                    <Route path="/app/registrar" element={<MobileRegistrarOcorrencia />} />
                    {/* Workspace único de atendimento técnico */}
                    <Route path="/app/atendimentos" element={<MobileAtendimentos />} />
                    {/* Rotas legadas — preservadas como redirecionamento canônico */}
                    <Route path="/app/registros" element={<Navigate to="/app/atendimentos" replace />} />
                    <Route path="/app/solicitacoes" element={<Navigate to="/app/atendimentos?aba=demandas" replace />} />
                    <Route path="/app/ordens" element={<MobileOrdens />} />
                    <Route path="/app/checkin/:solicitacaoId" element={<MobileCheckin />} />
                    <Route path="/app/checkin" element={<MobileCheckin />} />
                    <Route path="/app/visita/novo" element={<MobileVisita />} />
                    <Route path="/app/visita/:id" element={<MobileVisita />} />
                    <Route path="/app/talhao/:id" element={<MobileTalhaoHistorico />} />
                    <Route path="/app/catalogo" element={<MobileCatalogoTecnico />} />
                   </Route>
                  </Route>

                  {/* Somente produtor */}
                  <Route element={<ProducerFeatureGuard />}>
                    <Route path="/app/recomendacoes" element={<MobileRecomendacoesProdutor />} />
                    <Route path="/app/entregas" element={<MobileEntregas />} />
                    <Route path="/app/aplicacoes" element={<MobileAplicacoes />} />
                    <Route path="/app/aplicacoes/lista" element={<MobileListaAplicacoes />} />
                    <Route path="/app/solicitar" element={<MobileSolicitar />} />
                  </Route>
                </Route>
              </Route>

              {/* Portal do Produtor */}
              <Route element={<PortalGuard />}>
                <Route path="/portal" element={<PortalDashboard />} />
                <Route path="/portal/fazendas" element={<PortalFazendas />} />
                <Route path="/portal/fazendas/:id" element={<PortalFazendaDetalhe />} />
                <Route path="/portal/talhoes" element={<Navigate to="/portal/fazendas" replace />} />
                <Route path="/portal/talhoes/:id" element={<PortalTalhaoDetalhe />} />
                <Route path="/portal/agenda" element={<PortalAgenda />} />
                <Route path="/portal/registros" element={<PortalRegistros />} />
                <Route path="/portal/registros/:id" element={<PortalRegistroDetalhe />} />
                <Route path="/portal/recomendacoes" element={<PortalRecomendacoes />} />
                <Route path="/portal/fila-aprovacao" element={<PortalFilaAprovacao />} />
                <Route path="/portal/acompanhamento" element={<PortalAcompanhamento />} />
                {/* Fase 10: rotas legadas redirecionadas para o Acompanhamento unificado. */}
                <Route path="/portal/ordens-servico" element={<Navigate to="/portal/acompanhamento?tab=ordens-servico" replace />} />
                <Route path="/portal/producao" element={<Navigate to="/portal/acompanhamento?tab=producao" replace />} />
                <Route path="/portal/entregas" element={<Navigate to="/portal/acompanhamento?tab=entregas" replace />} />

                <Route path="/portal/aplicacoes" element={<PortalAplicacoes />} />
                <Route path="/portal/solicitar" element={<PortalSolicitacao />} />
                <Route path="/portal/perfil" element={<PortalPerfil />} />
                <Route path="/portal/financeiro" element={<PortalFinanceiro />} />
                {/* /portal/meus-pedidos: visualização B2B removida do produtor (Fase 2). Rota redireciona ao dashboard. */}
                <Route path="/portal/meus-pedidos" element={<Navigate to="/portal" replace />} />
              </Route>

              {/* Portal Parceiro B2B */}
              <Route path="/portal-parceiro" element={<B2BRouteGuard><PortalParceiroLayout /></B2BRouteGuard>}>
               <Route element={<EntitlementOutlet />}>
                <Route index element={<Navigate to="/portal-parceiro/dashboard" replace />} />
                <Route path="perfil" element={<PortalParceiroPerfil />} />
                <Route path="dashboard" element={<ParceiroDashboardRouter />} />
                <Route path="pedidos" element={<ParceiroMeusPedidos />} />
                <Route path="solicitacoes" element={<ParceiroSolicitacoes />} />
                <Route path="novo" element={<ParceiroNovoPedido />} />
                <Route path="catalogo" element={<ParceiroNovoPedido />} />
                <Route path="simulador" element={<ParceiroNovoPedido />} />
                <Route path="historico" element={<ParceiroHistorico />} />
                <Route path="meu-historico" element={<ParceiroMeuHistorico />} />
                <Route path="favoritos" element={<ParceiroFavoritos />} />
                <Route path="financeiro" element={<ParceiroFinanceiro />} />
                <Route path="historico-financeiro" element={<Navigate to="/portal-parceiro/financeiro?tab=historico" replace />} />
                <Route path="meu-historico-financeiro" element={<Navigate to="/portal-parceiro/financeiro?tab=historico" replace />} />

                <Route path="fichas" element={<ParceiroFichasTecnicas />} />
                <Route path="simulacoes" element={<ParceiroHistoricoSimulacoes />} />
                <Route path="simulacoes-equipe" element={<ParceiroSimulacoesEquipe />} />
                <Route path="meus-produtores" element={<ParceiroMeusProdutoresTecnico />} />
                <Route path="meus-produtores/:clienteId" element={<ParceiroDetalheProdutorTecnico />} />
                <Route path="tecnicos-produtores" element={<ParceiroTecnicosProdutores />} />
                <Route path="usuarios-clientes" element={<ParceiroUsuariosClientesB2B />} />
               </Route>
              </Route>

              {/* H9-G Bloco 2C — Visita técnica interna: guard fail-closed ANTES do layout interno. */}
              <Route element={<VisitaRouteGuard />}>
                <Route element={<ProtectedRoutes />}>
                  <Route path="/visita-tecnica" element={<RoleGuard><VisitaTecnicaLista /></RoleGuard>} />
                  <Route path="/visita-tecnica/nova" element={<RoleGuard><VisitaTecnica /></RoleGuard>} />
                  <Route path="/visita-tecnica/:id" element={<RoleGuard><VisitaTecnica /></RoleGuard>} />
                </Route>
              </Route>

              {/* Admin routes */}
              <Route element={<ProtectedRoutes />}>
                <Route path="/" element={<Index />} />
                <Route path="/clientes" element={<RoleGuard><Clientes /></RoleGuard>} />
                <Route path="/clientes/:id" element={<RoleGuard><ClienteDetalhe /></RoleGuard>} />
                <Route path="/parceiros/:id" element={<RoleGuard><ParceiroDetalhe /></RoleGuard>} />
                <Route path="/fazendas" element={<RoleGuard><Fazendas /></RoleGuard>} />
                <Route path="/fazendas/:id" element={<RoleGuard><FazendaDetalhe /></RoleGuard>} />
                <Route path="/talhoes" element={<RoleGuard><Talhoes /></RoleGuard>} />
                <Route path="/talhoes/:id" element={<RoleGuard><TalhaoHistorico /></RoleGuard>} />
                <Route path="/auditoria" element={<RoleGuard><Auditoria /></RoleGuard>} />
                <Route path="/auditoria-sync" element={<Navigate to="/auditoria?tab=sync" replace />} />
                
                <Route path="/base-tecnica" element={<RoleGuard><Protocolos /></RoleGuard>} />
                <Route path="/protocolos" element={<PreservedNavigate to="/base-tecnica" />} />
                <Route path="/ordens-servico" element={<RoleGuard><OrdensServico /></RoleGuard>} />
                
                <Route path="/lotes" element={<RoleGuard><Lotes /></RoleGuard>} />
                <Route path="/controle-qualidade" element={<RoleGuard><ControleQualidade /></RoleGuard>} />
                <Route path="/envase" element={<RoleGuard><EnvasePage /></RoleGuard>} />
                <Route path="/estoque" element={<RoleGuard><Estoque /></RoleGuard>} />
                <Route path="/estoque/embalagens" element={<RoleGuard><EstoqueEmbalagens /></RoleGuard>} />
                <Route path="/entregas" element={<RoleGuard><Entregas /></RoleGuard>} />
                <Route path="/entregas/:id/formulario" element={<RoleGuard><FormularioEntregaPrint /></RoleGuard>} />
                <Route path="/etiquetas/:id/imprimir" element={<RoleGuard><EtiquetaProdutoPrintPage /></RoleGuard>} />
                <Route path="/aplicacoes" element={<RoleGuard><Aplicacoes /></RoleGuard>} />
                <Route path="/relatorios" element={<RoleGuard><Relatorios /></RoleGuard>} />
                <Route path="/consultor-tecnico" element={<RoleGuard><ConsultorTecnico /></RoleGuard>} />
                <Route path="/fluxo-tecnico" element={<RoleGuard><FluxoTecnico /></RoleGuard>} />
                {/* H9-G 2C: rotas de visita movidas para grupo próprio, sob VisitaRouteGuard. */}
                <Route path="/bi-agronomico" element={<RoleGuard><BIAgronomico /></RoleGuard>} />
                <Route path="/bi-operacional" element={<RoleGuard><BIOperacional /></RoleGuard>} />
                <Route path="/alertas-operacionais" element={<RoleGuard><AlertasOperacionais /></RoleGuard>} />

                
                <Route path="/previsao-agronomica" element={<RoleGuard><PrevisaoAgronomica /></RoleGuard>} />
                <Route path="/solicitacoes" element={<RoleGuard><Solicitacoes /></RoleGuard>} />
                <Route path="/monitoramento-alertas" element={<RoleGuard><MonitoramentoAlertas /></RoleGuard>} />
                <Route path="/agenda-tecnica" element={<RoleGuard><AgendaTecnica /></RoleGuard>} />
                <Route path="/dashboard" element={<PreservedNavigate to="/dashboard/geral" />} />
                <Route path="/dashboard/geral" element={<RoleGuard><DashboardUnificado /></RoleGuard>} />
                <Route path="/dashboard/executivo" element={<RoleGuard><DashboardUnificado /></RoleGuard>} />
                <Route path="/dashboard/operacional" element={<RoleGuard><DashboardUnificado /></RoleGuard>} />
                <Route path="/painel-operacional" element={<PreservedNavigate to="/dashboard/operacional" />} />
                <Route path="/cockpit-laboratorio" element={<RoleGuard><CockpitLaboratorio /></RoleGuard>} />
                <Route path="/financeiro" element={<RoleGuard><FinanceiroDashboard /></RoleGuard>} />
                <Route path="/financeiro/receber" element={<RoleGuard><ContasReceber /></RoleGuard>} />
                <Route path="/financeiro/pagar" element={<RoleGuard><ContasPagar /></RoleGuard>} />
                <Route path="/financeiro/categorias" element={<RoleGuard><FinCategorias /></RoleGuard>} />
                <Route path="/financeiro/centros-custo" element={<RoleGuard><FinCentrosCusto /></RoleGuard>} />
                <Route path="/financeiro/contas-bancarias" element={<RoleGuard><FinContasBancarias /></RoleGuard>} />
                <Route path="/financeiro/formas-pagamento" element={<RoleGuard><FinFormasPagamento /></RoleGuard>} />
                <Route path="/financeiro/recorrencias" element={<RoleGuard><FinRecorrencias /></RoleGuard>} />
                <Route path="/financeiro/fluxo-caixa" element={<RoleGuard><FinFluxoCaixa /></RoleGuard>} />
                <Route path="/financeiro/dre" element={<RoleGuard><FinDRE /></RoleGuard>} />
                <Route path="/financeiro/notas-fiscais" element={<RoleGuard><FinNotasFiscais /></RoleGuard>} />
                <Route path="/financeiro/entregas-nao-faturadas" element={<RoleGuard><FinEntregasNaoFaturadas /></RoleGuard>} />
                <Route path="/financeiro/auditoria" element={<Navigate to="/auditoria?tab=financeiro" replace />} />
                <Route path="/financeiro/configuracoes" element={<Navigate to="/configuracoes?tab=financeiro" replace />} />
                <Route path="/financeiro/relatorios" element={<RoleGuard><FinRelatorios /></RoleGuard>} />
                <Route path="/financeiro/relatorios/mensal" element={<RoleGuard><RelMensal /></RoleGuard>} />
                <Route path="/financeiro/relatorios/contas-receber" element={<RoleGuard><RelReceber /></RoleGuard>} />
                <Route path="/financeiro/relatorios/contas-pagar" element={<RoleGuard><RelPagar /></RoleGuard>} />
                <Route path="/financeiro/relatorios/inadimplencia" element={<RoleGuard><RelInadimplencia /></RoleGuard>} />
                <Route path="/financeiro/relatorios/nfe-pendente" element={<RoleGuard><RelNFePendente /></RoleGuard>} />
                <Route path="/financeiro/relatorios/entregas-faturamento" element={<RoleGuard><RelEntregasFat /></RoleGuard>} />
                <Route path="/financeiro/relatorios/por-cliente" element={<RoleGuard><RelPorCliente /></RoleGuard>} />
                <Route path="/financeiro/relatorios/prestacao-contas" element={<RoleGuard><RelPrestacaoContas /></RoleGuard>} />
                <Route path="/financeiro/recibos" element={<RoleGuard><FinRecibos /></RoleGuard>} />
                 <Route path="/executivo" element={<PreservedNavigate to="/dashboard/executivo" />} />
                 <Route path="/portal-executivo" element={<PreservedNavigate to="/dashboard/executivo" />} />
                 <Route path="/comercial/parceiros" element={<Navigate to="/clientes?aba=parceiros" replace />} />
                 <Route path="/comercial/pedidos-b2b" element={<RoleGuard><PedidosB2B /></RoleGuard>} />
                 <Route path="/comercial/solicitacoes-b2b" element={<RoleGuard><ComercialSolicitacoesB2B /></RoleGuard>} />
                 <Route path="/comercial/dashboard-b2b" element={<Navigate to="/comercial/dashboard-consolidado" replace />} />
                 <Route path="/comercial/campanhas" element={<RoleGuard><CampanhasComerciais /></RoleGuard>} />
                 <Route path="/comercial/simulador" element={<RoleGuard><SimuladorComercial /></RoleGuard>} />
                 <Route path="/comercial/catalogo" element={<PreservedNavigate to="/base-tecnica?tab=catalogo-tecnico" />} />
                 <Route path="/comercial/indicadores" element={<RoleGuard><IndicadoresComerciais /></RoleGuard>} />
                 <Route path="/comercial/alertas" element={<RoleGuard><AlertasComerciais /></RoleGuard>} />
                 <Route path="/comercial/dashboard-consolidado" element={<RoleGuard><DashboardConsolidadoB2B /></RoleGuard>} />
                 <Route path="/comercial/condicoes-pagamento" element={<RoleGuard><CommercialPaymentPlansPage /></RoleGuard>} />
                 <Route path="/comercial/auditoria-motor-b2b" element={<RoleGuard><AuditoriaMotorB2B /></RoleGuard>} />
                 <Route path="/operacao/planejamento" element={<RoleGuard><PlanejamentoProducao /></RoleGuard>} />
                 <Route path="/operacao/planejamento/:id" element={<RoleGuard><PlanejamentoProducaoDetalhe /></RoleGuard>} />
                 <Route path="/operacao/dashboard-producao" element={<RoleGuard><DashboardProducao /></RoleGuard>} />
                 <Route path="/financeiro/b2b" element={<RoleGuard><FinanceiroB2B /></RoleGuard>} />
                 <Route path="/financeiro/b2b/dashboard" element={<RoleGuard><DashboardFinanceiroB2B /></RoleGuard>} />
                 <Route path="/financeiro/b2b/governanca" element={<RoleGuard><GovernancaFinanceiraB2B /></RoleGuard>} />
                 <Route path="/financeiro/b2b/aging" element={<RoleGuard><AgingFinanceiroB2B /></RoleGuard>} />
                 <Route path="/financeiro/b2b/previsao" element={<RoleGuard><PrevisaoReceitaB2B /></RoleGuard>} />
                 <Route path="/financeiro/b2b/rentabilidade" element={<RoleGuard><RentabilidadeParceirosB2B /></RoleGuard>} />
                 <Route path="/financeiro/b2b/alertas" element={<RoleGuard><AlertasFinanceirosB2B /></RoleGuard>} />
                 <Route path="/financeiro/b2b/central-governanca" element={<RoleGuard><CentralGovernancaB2B /></RoleGuard>} />
                 <Route path="/financeiro/b2b/regras" element={<RoleGuard><RegrasGovernancaB2B /></RoleGuard>} />
                 <Route path="/executivo/socios-b2b" element={<RoleGuard><DashboardSociosB2B /></RoleGuard>} />
                <Route path="/configuracoes" element={<RoleGuard><Configuracoes /></RoleGuard>} />
                <Route path="/configuracoes/objetivos-visita" element={<RoleGuard><ObjetivosVisita /></RoleGuard>} />
                <Route path="/configuracoes/parametros-cq" element={<RoleGuard><ParametrosCQPage /></RoleGuard>} />
                <Route path="/configuracoes/fiscal/empresa" element={<RoleGuard><FiscalEmpresa /></RoleGuard>} />
                <Route path="/configuracoes/fiscal/produtos" element={<RoleGuard><FiscalProdutos /></RoleGuard>} />
                <Route path="/configuracoes/fiscal/servicos" element={<RoleGuard><FiscalServicos /></RoleGuard>} />
                <Route path="/configuracoes/fiscal/clientes" element={<RoleGuard><FiscalClientes /></RoleGuard>} />
                <Route path="/fiscal/perfis/produtos" element={<PreservedNavigate to="/configuracoes/fiscal/produtos" />} />
                <Route path="/fiscal/perfis/servicos" element={<PreservedNavigate to="/configuracoes/fiscal/servicos" />} />
                <Route path="/fiscal/perfis/clientes" element={<PreservedNavigate to="/configuracoes/fiscal/clientes" />} />
                <Route path="/fiscal/documentos" element={<RoleGuard><FiscalDocumentos /></RoleGuard>} />
                <Route path="/fiscal/reconciliacao" element={<RoleGuard><FiscalReconciliacao /></RoleGuard>} />
                 <Route path="/fiscal/prontidao" element={<RoleGuard><FiscalProntidao /></RoleGuard>} />
                 <Route path="/comunicacao" element={
                   <RoleGuard><ComunicacaoRouteGuard><ComunicacaoAdminPage /></ComunicacaoRouteGuard></RoleGuard>
                 } />
                 <Route path="/notificacoes" element={<CentralNotificacoes />} />

               </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
