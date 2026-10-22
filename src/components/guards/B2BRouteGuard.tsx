import { ReactNode, useEffect, useRef } from "react";
import { CatalogFilterMemoryContext, createCatalogFilterMemory } from "@/lib/catalogo/catalogFilterPreferences";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { useMyPartner } from "@/hooks/useMyPartner";
import { logAccessDeniedOnce, routeGroupFromPath } from "@/lib/accessAuditLog";
import { AuthzEpochBoundary } from "@/components/authz/AuthzEpochBoundary";

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
  const { user, profile, loading, roles, authzReady = true } = useAuth();
  const own = useMyPartner();
  const location = useLocation();
  const filters = useRef(createCatalogFilterMemory());
  // Only preferences cross the existing epoch remount. This never keeps children,
  // queries, grants or rows mounted during pause. Clear even when children are absent.
  const filterIdentity = user?.id && profile?.user_id === user.id && profile.organization_id &&
    location.pathname === "/portal-parceiro/catalogo"
    ? JSON.stringify([user.id, profile.organization_id, [...roles].sort(), "b2b", roles.length === 1 ? roles[0] : null]) : null;
  filters.current.bind(filterIdentity, own.ready && !own.isError ? own.data?.id ?? null : undefined);
  const { data, ready, isLoading, isError } = useAvailableContexts();
  // has_b2b_access historically includes the management context. A real B2B
  // context additionally proves the partner binding; management alone cannot.
  const exclusivePartner = roles.length === 1 &&
    (roles[0] === "parceiro_b2b" || roles[0] === "parceiro_b2b_tecnico");
  const hasPartnerContext = exclusivePartner && own.ready && !!own.data && !own.isError &&
    data?.has_b2b_access === true && data.available_contexts.includes("b2b");
  const denied =
    !loading &&
    authzReady &&
    !!user &&
    !isLoading && !own.isLoading &&
    (!ready || isError || !hasPartnerContext);

  useEffect(() => {
    if (denied) {
      logAccessDeniedOnce("b2b", routeGroupFromPath(location.pathname));
    }
  }, [denied, location.pathname]);

  // Auth loading remains the first barrier. Once identity is resolved, pause
  // takes precedence over reader loading/denial: both readers depend on authzReady.
  if (!loading && user && !authzReady) return <AuthzEpochBoundary>{null}</AuthzEpochBoundary>;

  if (loading || (user && (isLoading || (exclusivePartner && own.isLoading)))) {
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

  if (!hasPartnerContext) {
    return (
      <Navigate
        to="/sem-permissao"
        state={{ requested: "b2b", from: location.pathname }}
        replace
      />
    );
  }

  // Foundation de cache (mesma identidade): boundary esconde/remonta conteúdo
  // sensível conforme a época de autorização. Gate fechado = sem alteração.
  return <CatalogFilterMemoryContext.Provider value={filters.current}><AuthzEpochBoundary>{children}</AuthzEpochBoundary></CatalogFilterMemoryContext.Provider>;
}

export default B2BRouteGuard;
