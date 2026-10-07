import { Navigate, useLocation } from "react-router-dom";

/**
 * Redireciona para `to` preservando `search` e `hash` da URL atual
 * (Fase 3 — regra 6: preservar query strings e filtros nas migrações de rota).
 */
export function PreservedNavigate({ to }: { to: string }) {
  const { search, hash } = useLocation();
  const [targetPath, targetSearch = ""] = to.split("?");
  const params = new URLSearchParams(search);
  // Canonical destination parameters take precedence over legacy parameters.
  new URLSearchParams(targetSearch).forEach((value, key) => params.set(key, value));
  const merged = params.toString();
  return <Navigate to={`${targetPath}${merged ? `?${merged}` : ""}${hash}`} replace />;
}
