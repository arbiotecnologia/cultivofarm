import { ReactNode, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { logAccessDeniedOnce, routeGroupFromPath } from "@/lib/accessAuditLog";

/**
 * TechnicalFeatureGuard — protege rotas exclusivas do Portal Técnico
 * dentro da árvore `/app/*`. Autorização baseada em `has_technical_access`
 * retornado pela RPC segura; admin mantém acesso legado.
 */
export function TechnicalFeatureGuard({ children }: { children?: ReactNode }) {
  const { user, roles, loading } = useAuth();
  const location = useLocation();
  const { data, isLoading, isError } = useAvailableContexts();

  const isAdmin = roles.includes("administrador");
  const hasTechnical = !!data?.has_technical_access;
  const denied = !loading && !!user && !isLoading && !isAdmin && (isError || !hasTechnical);

  useEffect(() => {
    if (denied) {
      logAccessDeniedOnce("technical", routeGroupFromPath(location.pathname));
    }
  }, [denied, location.pathname]);

  if (loading || (user && isLoading)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!user) return <Navigate to="/app/login" state={{ from: location.pathname }} replace />;

  if (isAdmin) return <>{children ?? <Outlet />}</>;

  if (!hasTechnical || isError) {
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

export default TechnicalFeatureGuard;
