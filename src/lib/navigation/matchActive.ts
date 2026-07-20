import type { NavItem } from "@/config/navigation";

/**
 * Converte um padrão de rota com parâmetros (`/foo/:id`) em RegExp.
 * Aceita também rota simples exata (`/foo`) — trata como prefixo.
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, "[^/]+");
  return new RegExp(`^${escaped}(?:/.*)?$`);
}

/**
 * Um item é ativo quando o pathname atual bate contra:
 * - route (exato ou subrota — via prefixo)
 * - matchRoutes (padrões adicionais com params)
 * - legacyRoutes (URLs antigas redirecionadas)
 *
 * Query string e hash são ignorados (React Router já não os inclui no pathname).
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  // Rota raiz precisa de match exato.
  if (item.route === "/") return pathname === "/";

  const candidates = [item.route, ...(item.matchRoutes ?? []), ...(item.legacyRoutes ?? [])];
  return candidates.some((pattern) => {
    if (pattern.includes(":")) return patternToRegex(pattern).test(pathname);
    return pathname === pattern || pathname.startsWith(pattern + "/");
  });
}
