import { Navigate, useLocation } from "react-router-dom";

/**
 * Redireciona para `to` preservando `search` e `hash` da URL atual
 * (Fase 3 — regra 6: preservar query strings e filtros nas migrações de rota).
 */
export function PreservedNavigate({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}
