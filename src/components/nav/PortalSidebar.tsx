import { useMemo, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Search } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavSectionGroup } from "@/components/nav/NavSectionGroup";
import { NavItemRow } from "@/components/nav/NavItemRow";
import { useNavCollapseState, itemCollapseKey } from "@/hooks/useNavCollapseState";
import { filterNavItemsByQuery } from "@/lib/navigation/search";
import { isNavItemActive } from "@/lib/navigation/matchActive";
import { useLocation } from "react-router-dom";
import type { SidebarNavGroup, SidebarNavItem, SidebarPortalId } from "@/components/nav/types";

/** Acima deste total de itens a busca no menu é exibida. */
export const SEARCH_MIN_ITEMS = 10;

interface PortalSidebarProps {
  portal: SidebarPortalId;
  groups: SidebarNavGroup[];
  brandTitle: string;
  brandSubtitle?: string;
  brandIcon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Substitui o ícone da marca (ex.: logo configurável do admin). */
  brandSlot?: ReactNode;
  itemClassName?: (item: SidebarNavItem) => string | undefined;
}

/**
 * Sidebar única de todos os portais (admin, produtor, parceiro).
 * Largura 16rem / 3rem no modo ícone / 18rem no Sheet mobile (<768px),
 * scroll vertical em ambos os modos, tooltip em todo item, busca opcional e
 * persistência de recolhimento por usuário + portal.
 *
 * Não conhece rotas, papéis ou dados: recebe apenas os grupos já filtrados.
 */
export function PortalSidebar({
  portal,
  groups,
  brandTitle,
  brandSubtitle,
  brandIcon: BrandIcon,
  brandSlot,
  itemClassName,
}: PortalSidebarProps) {
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { pathname } = useLocation();
  const [query, setQuery] = useState("");

  const allItems = useMemo(
    () => groups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])])),
    [groups],
  );
  const showSearch = allItems.length > SEARCH_MIN_ITEMS;

  // Abertura automática: seção da rota ativa + itens com filho ativo.
  const autoOpenKeys = useMemo(() => {
    const keys: string[] = [];
    for (const g of groups) {
      for (const it of g.items) {
        const childActive = (it.children ?? []).some((c) => isNavItemActive(c, pathname));
        if (isNavItemActive(it, pathname) || childActive) keys.push(g.section);
        if (childActive) keys.push(itemCollapseKey(it.id));
      }
    }
    return Array.from(new Set(keys));
  }, [groups, pathname]);

  const { isOpen, setOpen } = useNavCollapseState(portal, autoOpenKeys);

  const searchResults = useMemo(
    () => (query.trim() ? filterNavItemsByQuery(allItems, query) : null),
    [query, allItems],
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          {brandSlot ?? (BrandIcon && <BrandIcon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />)}
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-sidebar-accent-foreground truncate">
                {brandTitle}
              </span>
              {brandSubtitle && (
                <span className="text-[10px] text-sidebar-foreground truncate">{brandSubtitle}</span>
              )}
            </div>
          )}
        </div>

        {showSearch && !collapsed && (
          <div className="mt-3 relative">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no menu..."
              aria-label="Buscar no menu"
              className="w-full h-9 pl-8 pr-2 rounded-md bg-sidebar-accent/40 text-sm text-sidebar-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {searchResults ? (
          <SidebarGroup>
            <SidebarGroupLabel>
              {searchResults.length > 0 ? `Resultados (${searchResults.length})` : "Nenhum resultado"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {searchResults.map((it) => (
                  <NavItemRow key={it.id} item={{ ...it, children: undefined }} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          groups.map((group, idx) => (
            <NavSectionGroup
              key={group.section}
              group={group}
              showSeparator={idx > 0}
              isOpen={isOpen}
              setOpen={setOpen}
              itemClassName={itemClassName}
            />
          ))
        )}
      </SidebarContent>
    </Sidebar>
  );
}
