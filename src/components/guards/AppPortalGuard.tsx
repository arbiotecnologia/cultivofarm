import { ReactNode, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { logAccessDeniedOnce, routeGroupFromPath } from "@/lib/accessAuditLog";
import { AuthzEpochBoundary } from "@/components/authz/AuthzEpochBoundary";
import { CONSULTANT_CONTEXT_MONITOR_ENABLED, MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED } from "@/lib/authz/authzEpochGate";

import { isManagerConsultantScope } from "@/lib/authz/internalContextProbe";

/**
 * AppPortalGuard — protege a árvore `/app/*`.
 *
 * Regras (Fase Corretiva 4):
 * - Sessão obrigatória.
 * - Administrador mantém acesso legado.
 * - Cliente-produtor mantém `/app/*` (fluxo produtor mobile).
 * - Demais usuários dependem de `has_technical_access` retornado pela RPC.
 * - B2B sem Técnico → `/sem-permissao`.
 *
 * A autorização NUNCA depende de `primaryRole` nem de `isMobileProfile`.
 */
export function AppPortalGuard({ children }: { children?: ReactNode }) {
  const { user, profile, roles, loading, authzReady = true } = useAuth();
  const location = useLocation();
  const { data, isLoading, isError } = useAvailableContexts();

  const isAdmin = roles.includes("administrador") || !!data?.is_admin;
  const isProducer = roles.includes("cliente_produtor");
  const isMonitoredConsultant = CONSULTANT_CONTEXT_MONITOR_ENABLED && roles.length === 1 && roles[0] === "consultor_tecnico" &&
    typeof profile?.organization_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.organization_id);
  const isMonitoredManagerConsultant = MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED && isManagerConsultantScope(roles, profile?.organization_id);
  const monitoredTechnical = isMonitoredConsultant || isMonitoredManagerConsultant;
  const denied =
    !loading &&
    (!monitoredTechnical || authzReady) &&
    !!user &&
    !isLoading &&
    !isAdmin &&
    !isProducer &&
    (isError || !data?.has_technical_access);

  useEffect(() => {
    if (denied) {
      logAccessDeniedOnce("technical", routeGroupFromPath(location.pathname));
    }
  }, [denied, location.pathname]);

  // Pause before readers depending on authzReady; retry stays on this URL.
  if (!loading && user && (isProducer || monitoredTechnical) && !authzReady) {
    return <AuthzEpochBoundary>{null}</AuthzEpochBoundary>;
  }

  if (loading || (user && isLoading)) {
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

  if (isAdmin || isProducer) return <AuthzEpochBoundary>{children ?? <Outlet />}</AuthzEpochBoundary>;

  if (isError) {
    return <Navigate to="/sem-permissao" replace />;
  }

  if (!data?.has_technical_access) {
    return (
      <Navigate
        to="/sem-permissao"
        state={{ requested: "technical", from: location.pathname }}
        replace
      />
    );
  }

  return monitoredTechnical
    ? <AuthzEpochBoundary>{children ?? <Outlet />}</AuthzEpochBoundary>
    : <>{children ?? <Outlet />}</>;
}

export default AppPortalGuard;
