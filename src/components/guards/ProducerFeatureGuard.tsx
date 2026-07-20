import { ReactNode, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { logAccessDeniedOnce, routeGroupFromPath } from "@/lib/accessAuditLog";

/**
 * ProducerFeatureGuard — protege rotas exclusivas do Portal Produtor
 * dentro da árvore `/app/*`. Autorização real via `roles` (cliente_produtor);
 * admin mantém acesso legado. Nunca confia em sessionStorage.
 */
export function ProducerFeatureGuard({ children }: { children?: ReactNode }) {
  const { user, roles, loading } = useAuth();
  const location = useLocation();

  const isAdmin = roles.includes("administrador");
  const isProducer = roles.includes("cliente_produtor");
  const denied = !loading && !!user && !isAdmin && !isProducer;

  useEffect(() => {
    if (denied) {
      logAccessDeniedOnce("producer", routeGroupFromPath(location.pathname));
    }
  }, [denied, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!user) return <Navigate to="/app/login" state={{ from: location.pathname }} replace />;

  if (isAdmin || isProducer) return <>{children ?? <Outlet />}</>;

  return (
    <Navigate
      to="/sem-permissao"
      state={{ requested: "producer", from: location.pathname }}
      replace
    />
  );
}

export default ProducerFeatureGuard;
