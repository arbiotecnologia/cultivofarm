import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { logAccessDeniedOnce, routeGroupFromPath } from "@/lib/accessAuditLog";

/**
 * B2BRouteGuard — protege `/portal-parceiro/*`.
 *
 * Autorização resolvida no servidor via `get_my_available_portal_contexts()`
 * (RPC segura). Nunca confia em localStorage, sessionStorage ou query string.
 *
 * Admin/gestor_comercial mantêm acesso legado (impersonação) — sem regressão.
 */
export function B2BRouteGuard({ children }: { children: ReactNode }) {
  const { user, roles, loading } = useAuth();
  const location = useLocation();
  const { data, isLoading, isError } = useAvailableContexts();

  const isAdmin = roles.includes("administrador");
  const isGestorComercial = roles.includes("gestor_comercial");
  const legacyBypass = isAdmin || isGestorComercial;
  const denied =
    !loading &&
    !!user &&
    !isLoading &&
    !legacyBypass &&
    (isError || !data?.has_b2b_access);

  useEffect(() => {
    if (denied) {
      logAccessDeniedOnce("b2b", routeGroupFromPath(location.pathname));
    }
  }, [denied, location.pathname]);

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
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  if (legacyBypass) {
    return <>{children}</>;
  }

  if (isError) {
    return <Navigate to="/sem-permissao" replace />;
  }

  if (!data?.has_b2b_access) {
    return (
      <Navigate
        to="/sem-permissao"
        state={{ requested: "b2b", from: location.pathname }}
        replace
      />
    );
  }

  return <>{children}</>;
}

export default B2BRouteGuard;
