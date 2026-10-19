import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Navigate } from "react-router-dom";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { OfflineIndicator } from "@/components/app/OfflineIndicator";
import { PendingMediaRecovery } from "@/components/app/PendingMediaRecovery";

import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { PortalContextFreshnessProvider } from "@/lib/portalContextFreshness";
import { getActivePortalContext, setActivePortalContext } from "@/lib/activePortalContext";
import { useEffect } from "react";
import { itemsForPlatform } from "@/config/navigation";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { getPortalDisplayLabel } from "@/lib/portalDisplayLabel";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useEntitlements } from "@/hooks/useEntitlements";
import { isPathEntitled } from "@/lib/saas/featureRouteMap";
import { AuthzEpochBoundary } from "@/components/authz/AuthzEpochBoundary";
import { PortalContextUnavailable } from "@/components/guards/PortalContextUnavailable";

// Tabs derivam da fonte declarativa única (`src/config/navigation.ts`).
// Fase 2 preserva rotas, ícones e rótulos anteriores — apenas centraliza a fonte.
const consultorTabs = itemsForPlatform("mobile-consultor").map((it) => ({
  path: it.route,
  icon: it.icon,
  label: it.label,
}));

const produtorTabs = itemsForPlatform("mobile-produtor").map((it) => ({
  path: it.route,
  icon: it.icon,
  label: it.label,
}));

export default function MobileLayout() {
  const { user, primaryRole, roles, loading, authzReady = true } = useAuth();
  const entitlements = useEntitlements();
  const location = useLocation();
  const { isOnline, pendingCount, syncing, syncAll, progress } = useOfflineSync();
  const navigate = useNavigate();
  const { data: contexts, isLoading: contextsLoading, isFetching, isError, refetch } = useAvailableContexts({ requireFresh: true });
  const { config, defaults } = useSystemConfig();
  const nomeEmpresa = config?.nome_empresa || defaults.nome_empresa;

  const isProdutor = roles.includes("cliente_produtor");
  const hasTechnical = !!contexts?.has_technical_access;
  const isAdmin = roles.includes("administrador");
  const activeCtx = getActivePortalContext();
  // Modo técnico: usuário escolheu técnico E realmente tem acesso técnico.
  // Fallback: sem contexto ativo, se não é produtor mas tem técnico → técnico.
  const isTechnicalMode =
    (activeCtx === "technical" && hasTechnical) ||
    (!activeCtx && !isProdutor && hasTechnical);
  const isProducerMode = !isTechnicalMode && isProdutor;

  // Semeia contexto visual quando ausente (fluxos legados sem passar pelo seletor).
  useEffect(() => {
    if (activeCtx || !authzReady || contextsLoading || isFetching || isError) return;
    if (!user) return;
    if (isTechnicalMode) setActivePortalContext("technical");
    else if (isProducerMode) setActivePortalContext("producer");
    else if (isAdmin) setActivePortalContext("admin");
  }, [activeCtx, user, isTechnicalMode, isProducerMode, isAdmin, authzReady, contextsLoading, isFetching, isError]);

  if (user && !loading && !authzReady) return <AuthzEpochBoundary>{null}</AuthzEpochBoundary>;

  if (loading || (user && (contextsLoading || isFetching))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-lg">Carregando...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/app/login" replace />;

  if (!isProdutor && !isAdmin && (isError || !contexts)) return <PortalContextUnavailable refetch={refetch} />;

  // Sem produtor e sem acesso técnico e sem admin → não deveria estar aqui.
  if (!isProdutor && !hasTechnical && !isAdmin) {
    return <Navigate to="/sem-permissao" replace />;
  }

  // Fase 3 — se produtor + técnico e o usuário escolheu técnico, exibe menus técnicos.
  const tabs = (isProducerMode ? produtorTabs : consultorTabs)
    .filter((tab) => isPathEntitled(tab.path, entitlements));
  const isConsultor = !isProducerMode;

  return (
    <PortalContextFreshnessProvider value={true}><div className="min-h-screen bg-background flex flex-col">
      {/* Offline indicator */}
      <OfflineIndicator
        isOnline={isOnline}
        pendingCount={pendingCount}
        syncing={syncing}
        onSync={syncAll}
        progress={progress}
      />

      {/* Mídias de visitas remotas que esgotaram tentativas (recuperável) */}
      <PendingMediaRecovery onSync={syncAll} syncing={syncing} />


      {/* Identidade do usuário — padrão único de todos os portais */}
      <PortalTopBar
        brandTitle={`${nomeEmpresa} Campo`}
        brandSubtitle={getPortalDisplayLabel({ activeCtx, primaryRole, roles })}
        className={cn((!isOnline || pendingCount > 0) && "mt-10")}
      />


      {/* Main content area — em desktop limita largura para evitar cartões excessivamente largos */}
      <main
        className={cn(
          "flex-1 overflow-auto pb-20 w-full mx-auto max-w-full lg:max-w-5xl xl:max-w-6xl lg:px-6",
        )}
      >
        <Outlet />
      </main>

      {/* FAB - Quick register button for consultants */}
      {isConsultor && (
        <button
          onClick={() => navigate("/app/registrar")}
          className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Registrar Ocorrência"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}

      {/* Bottom tab navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around h-16">
          {tabs.map((tab) => {
            const isActive =
              tab.path === "/app"
                ? location.pathname === "/app"
                : location.pathname.startsWith(tab.path);
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <tab.icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div></PortalContextFreshnessProvider>
  );
}
