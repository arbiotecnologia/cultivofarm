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
  // Fase 3 — achata filhos para que a busca também os alcance.
  const flat = items.flatMap((it) => (it.children ? [it, ...it.children] : [it]));
  const allowed = flat.filter((it) => canAccess(role, it.route));
  if (!term) return allowed;

  // Fase 6.1 — busca por tokens (AND). Cada token precisa aparecer no haystack,
  // permitindo desambiguar frases como "configurações gerais" vs
  // "configurações financeiras" e "regras governança" vs "governança".
  const tokens = term.split(/\s+/).filter(Boolean);

  return allowed.filter((it) => {
    const haystack = [
      it.label,
      it.section,
      it.subSection ?? "",
      ...(it.searchKeywords ?? []),
    ]
      .map(normalize)
      .join(" | ");
    return tokens.every((tok) => haystack.includes(tok));
  });
}
