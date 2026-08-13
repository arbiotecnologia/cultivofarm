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

/**
 * Fase 3.2 / 6.1 — verifica o `route` próprio do item + suas `legacyRoutes`
 * (ignora `matchRoutes` do pai). Usado para diferenciar o filho ativo
 * do pai no realce da sidebar. Rotas legadas ativam o filho correspondente.
 */
export function isNavItemActiveSelf(item: NavItem, pathname: string): boolean {
  const candidates = [item.route, ...(item.legacyRoutes ?? [])].map(stripQuery);
  return candidates.some((pattern) => {
    if (pattern === "/") return pathname === "/";
    if (pattern.includes(":")) return patternToRegex(pattern).test(pathname);
    return pathname === pattern || pathname.startsWith(pattern + "/");
  });
}

function stripQuery(pattern: string): string {
  const i = pattern.indexOf("?");
  return i === -1 ? pattern : pattern.slice(0, i);
}

/**
 * Variante ciente de query string: usada por itens com deep-link
 * (`/base-tecnica?tab=culturas`). Sem query no `route`, delega ao match por
 * pathname. Com query, todos os parâmetros do `route` precisam bater com a URL
 * atual; quando o parâmetro está ausente na URL, o item marcado como
 * `paramDefault` é considerado ativo.
 */
export function isNavItemActiveSelfWithSearch(
  item: NavItem,
  pathname: string,
  search: string,
): boolean {
  if (!isNavItemActiveSelf(item, pathname)) return false;
  const qIndex = item.route.indexOf("?");
  if (qIndex === -1) return true;
  const expected = new URLSearchParams(item.route.slice(qIndex + 1));
  const current = new URLSearchParams(search);
  for (const [key, value] of expected.entries()) {
    const actual = current.get(key);
    if (actual === null) {
      if (!item.paramDefault) return false;
      continue;
    }
    if (actual !== value) return false;
  }
  return true;
}

