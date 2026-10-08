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
 * Nenhum papel local substitui readiness ou o vínculo resolvido no servidor.
 * Este gate visual não substitui entitlements, RLS ou autorização de cada RPC.
 */
export function B2BRouteGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { data, ready, isLoading, isError } = useAvailableContexts();
  const denied =
    !loading &&
    !!user &&
    !isLoading &&
    (!ready || isError || !data?.has_b2b_access);

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

  if (!ready || isError) {
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
