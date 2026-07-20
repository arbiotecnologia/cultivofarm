import type { NavItem } from "@/config/navigation";
import { canAccess } from "@/lib/permissions";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Filtra itens por termo de busca, respeitando permissões do perfil.
 * Casos cobertos: label atual, section, subSection, searchKeywords (alias/nome antigo/novo).
 */
export function searchNavItems(
  items: NavItem[],
  query: string,
  role: string | null,
): NavItem[] {
  const term = normalize(query.trim());
  const allowed = items.filter((it) => canAccess(role, it.route));
  if (!term) return allowed;

  return allowed.filter((it) => {
    const haystack = [
      it.label,
      it.section,
      it.subSection ?? "",
      ...(it.searchKeywords ?? []),
    ]
      .map(normalize)
      .join(" | ");
    return haystack.includes(term);
  });
}
