/**
 * Guard da home provisória do Superadmin de Plataforma.
 *
 * Isolado do RoleGuard operacional: `superadmin` permanece FORA de
 * `ACCESS_MAP`/`ACTIVE_ROLES` e não recebe nenhum módulo de empresa. Aqui a
 * checagem é feita na lista completa de papéis (multipapel), nunca em
 * local/session storage. A autorização real continua no servidor (policy
 * `saas_platform_read` + `is_platform_superadmin`).
 */
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { platformCatalogAccess } from "@/lib/catalogo/platformCatalogRead";

export function PlataformaGuard() {
  const actor = useAuth();
  const { user, roles, loading } = actor;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground flex items-center gap-2">
          <div className="h-6 w-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          Carregando…
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!roles.includes("superadmin")) return <Navigate to="/sem-permissao" replace />;
  if (!platformCatalogAccess(actor).ready) return <Navigate to="/sem-permissao" replace />;

  return <Outlet />;
}
