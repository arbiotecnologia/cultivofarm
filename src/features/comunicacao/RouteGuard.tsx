import { useAuth } from "@/hooks/useAuth";
import { isComunicacaoModuleEnabled } from "@/features/comunicacao/flags";
import { Navigate } from "react-router-dom";
import { ReactNode } from "react";

/**
 * Guarda de rota para o Módulo de Comunicação.
 * - Se a feature flag estiver desligada: rota inacessível → redireciona para "/".
 * - Se logado sem papel administrador/gestor: redireciona para /sem-permissao.
 */
export function ComunicacaoRouteGuard({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth();

  if (!isComunicacaoModuleEnabled()) {
    return <Navigate to="/" replace />;
  }
  if (loading) return null;
  if (role !== "administrador" && role !== "gestor") {
    return <Navigate to="/sem-permissao" replace />;
  }
  return <>{children}</>;
}
