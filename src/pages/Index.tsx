import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { ErrorRecovery } from "@/components/ErrorRecovery";
import { getHomeForRole } from "@/lib/permissions";

/**
 * Fase 3.1 — `/` é agregador por perfil.
 * Destino centralizado em `getHomeForRole` (fonte única).
 * Perfis não executivos NÃO caem em /dashboard/geral (que usa RPC executiva).
 */
export default function Index() {
  const { role, loading, error, refresh, signOut } = useAuth();
  useSystemConfig();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground flex flex-col items-center gap-2">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          Carregando painel...
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorRecovery message={error} onRetry={refresh} onSignOut={signOut} />;
  }

  return <Navigate to={getHomeForRole(role)} replace />;
}
