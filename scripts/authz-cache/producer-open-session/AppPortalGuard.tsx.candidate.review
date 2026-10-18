import { ReactNode, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { logAccessDeniedOnce, routeGroupFromPath } from "@/lib/accessAuditLog";
import { AuthzEpochBoundary } from "@/components/authz/AuthzEpochBoundary";

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
  const { user, roles, loading, authzReady = true } = useAuth();
  const location = useLocation();
  const { data, isLoading, isError } = useAvailableContexts();

  const isAdmin = roles.includes("administrador") || !!data?.is_admin;
  const isProducer = roles.includes("cliente_produtor");
  const denied =
    !loading &&
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
  if (!loading && user && isProducer && !authzReady) {
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

  return <>{children ?? <Outlet />}</>;
}

export default AppPortalGuard;
