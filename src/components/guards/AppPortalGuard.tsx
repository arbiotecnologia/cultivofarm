import { ReactNode, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { PortalContextFreshnessProvider } from "@/lib/portalContextFreshness";
import { logAccessDeniedOnce, routeGroupFromPath } from "@/lib/accessAuditLog";
import { AuthzEpochBoundary } from "@/components/authz/AuthzEpochBoundary";
import { CONSULTANT_CONTEXT_MONITOR_ENABLED, MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED } from "@/lib/authz/authzEpochGate";

import { isManagerConsultantScope } from "@/lib/authz/internalContextProbe";
import { PortalContextUnavailable } from "./PortalContextUnavailable";

/**
 * AppPortalGuard — protege a árvore `/app/*`.
 *
 * Regras (Fase Corretiva 4):
 * - Sessão obrigatória.
 * - Administrador mantém acesso legado.
 * - Cliente-produtor mantém `/app/*` (fluxo produtor mobile).
 * - Demais usuários dependem de `technical` na lista canônica da RPC.
 * - B2B sem Técnico → `/sem-permissao`.
 *
 * A autorização NUNCA depende de `primaryRole` nem de `isMobileProfile`.
 */
export function AppPortalGuard({ children }: { children?: ReactNode }) {
  const { user, profile, roles, loading, authzReady = true, authzLatchBlocked = false, authzResidualScope = false } = useAuth();
  const location = useLocation();
  const { data, isLoading, isError, isFetching, refetch } = useAvailableContexts({ requireFresh: true });

  const isAdmin = roles.includes("administrador");
  const hasTechnical = data?.available_contexts.includes("technical") === true;
  const isProducer = roles.includes("cliente_produtor");
  const isMonitoredConsultant = CONSULTANT_CONTEXT_MONITOR_ENABLED && roles.length === 1 && roles[0] === "consultor_tecnico" &&
    typeof profile?.organization_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.organization_id);
  const isMonitoredManagerConsultant = MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED && isManagerConsultantScope(roles, profile?.organization_id);
  const monitoredTechnical = isMonitoredConsultant || isMonitoredManagerConsultant || authzResidualScope;
  const denied =
    !loading &&
    (!monitoredTechnical || authzReady) &&
    !!user &&
    !isLoading &&
    !isFetching &&
    !isError &&
    !isAdmin &&
    !isProducer &&
    !!data && !hasTechnical;

  useEffect(() => {
    if (denied) {
      logAccessDeniedOnce("technical", routeGroupFromPath(location.pathname));
    }
  }, [denied, location.pathname]);

  // Pause before readers depending on authzReady; retry stays on this URL.
  if (!loading && user && (isProducer || monitoredTechnical || authzLatchBlocked) && !authzReady) {
    return <AuthzEpochBoundary>{null}</AuthzEpochBoundary>;
  }

  if (loading || (user && (isLoading || isFetching))) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center bg-background"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/app/login" state={{ from: location.pathname }} replace />;
  }

  if (isAdmin || isProducer) return <PortalContextFreshnessProvider value={true}><AuthzEpochBoundary>{children ?? <Outlet />}</AuthzEpochBoundary></PortalContextFreshnessProvider>;

  if (isError || !data) {
    return <PortalContextUnavailable refetch={refetch} />;
  }

  if (!hasTechnical) {
    return (
      <Navigate
        to="/sem-permissao"
        state={{ requested: "technical", from: location.pathname }}
        replace
      />
    );
  }

  return <PortalContextFreshnessProvider value={true}>{monitoredTechnical
    ? <AuthzEpochBoundary>{children ?? <Outlet />}</AuthzEpochBoundary>
    : <>{children ?? <Outlet />}</>}</PortalContextFreshnessProvider>;
}

export default AppPortalGuard;
