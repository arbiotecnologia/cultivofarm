import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { PortalContextFreshnessProvider } from "@/lib/portalContextFreshness";
import { AuthzEpochBoundary } from "@/components/authz/AuthzEpochBoundary";
import { PortalContextUnavailable } from "./PortalContextUnavailable";

/**
 * TechnicalRouteGuard — protege rotas do Portal Técnico.
 *
 * Autorização resolvida no servidor via `get_my_available_portal_contexts()`.
 * Nunca considera "todo admin como técnico"; admin acessa pelo fluxo legado.
 */
export function TechnicalRouteGuard({ children }: { children: ReactNode }) {
  const { user, roles, loading, authzReady = true } = useAuth();
  const location = useLocation();
  const { data, isLoading, isError, isFetching, refetch } = useAvailableContexts({ requireFresh: true });

  if (user && !loading && !authzReady) return <AuthzEpochBoundary>{null}</AuthzEpochBoundary>;

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
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  // Admin mantém fluxo legado — verifica a lista completa de roles para
  // cobrir administradores com papéis adicionais atribuídos.
  if (roles.includes("administrador")) {
    return <PortalContextFreshnessProvider value={true}>{children}</PortalContextFreshnessProvider>;
  }

  if (isError || !data) {
    return <PortalContextUnavailable refetch={refetch} />;
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

  return <PortalContextFreshnessProvider value={true}>{children}</PortalContextFreshnessProvider>;
}

export default TechnicalRouteGuard;
