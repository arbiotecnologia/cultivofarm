import { ReactNode, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { PortalContextFreshnessProvider } from "@/lib/portalContextFreshness";
import { logAccessDeniedOnce, routeGroupFromPath } from "@/lib/accessAuditLog";
import { AuthzEpochBoundary } from "@/components/authz/AuthzEpochBoundary";
import { PortalContextUnavailable } from "./PortalContextUnavailable";

/**
 * TechnicalFeatureGuard — protege rotas exclusivas do Portal Técnico
 * dentro da árvore `/app/*`. Autorização baseada em `technical` na lista
 * retornado pela RPC segura; admin mantém acesso legado.
 */
export function TechnicalFeatureGuard({ children }: { children?: ReactNode }) {
  const { user, roles, loading, authzReady = true } = useAuth();
  const location = useLocation();
  const { data, isLoading, isError, isFetching, refetch } = useAvailableContexts({ requireFresh: true });

  const isAdmin = roles.includes("administrador");
  const hasTechnical = data?.available_contexts.includes("technical") === true;
  const denied = !loading && authzReady && !!user && !isLoading && !isFetching && !isError && !isAdmin && !!data && !hasTechnical;

  useEffect(() => {
    if (denied) {
      logAccessDeniedOnce("technical", routeGroupFromPath(location.pathname));
    }
  }, [denied, location.pathname]);

  if (user && !loading && !authzReady) return <AuthzEpochBoundary>{null}</AuthzEpochBoundary>;

  if (loading || (user && (isLoading || isFetching))) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!user) return <Navigate to="/app/login" state={{ from: location.pathname }} replace />;

  if (isAdmin) return <PortalContextFreshnessProvider value={true}>{children ?? <Outlet />}</PortalContextFreshnessProvider>;

  if (isError || !data) return <PortalContextUnavailable refetch={refetch} />;

  if (!hasTechnical) {
    return (
      <Navigate
        to="/sem-permissao"
        state={{ requested: "technical", from: location.pathname }}
        replace
      />
    );
  }

  return <PortalContextFreshnessProvider value={true}>{children ?? <Outlet />}</PortalContextFreshnessProvider>;
}

export default TechnicalFeatureGuard;
