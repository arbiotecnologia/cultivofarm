import { ChevronDown } from "lucide-react";
import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { AlertasBadgeMenu } from "@/components/alertas/AlertasBadgeMenu";
import { isNavItemActive, isNavItemActiveSelfWithSearch } from "@/lib/navigation/matchActive";
import type { SidebarNavItem } from "@/components/nav/types";

interface NavItemRowProps {
  item: SidebarNavItem;
  /** Indentação de filho. */
  nested?: boolean;
  /** Estado do submenu (controlado pelo grupo). */
  childrenOpen?: boolean;
  onToggleChildren?: (open: boolean) => void;
  /** Classe extra aplicada ao botão (destaques pontuais por portal). */
  buttonClassName?: string;
  /** Conteúdo extra à direita (ex.: badge dinâmico). */
  itemFilter?: (child: SidebarNavItem) => boolean;
}

/**
 * Linha única de navegação lateral compartilhada por todos os portais.
 * Cobre: item simples, item com filhos (chevron próprio), tooltip no modo
 * ícone, badge estático/dinâmico e fechamento do Sheet no mobile.
 */
export function NavItemRow({
  item,
  nested = false,
  childrenOpen = true,
  onToggleChildren,
  buttonClassName,
  itemFilter,
}: NavItemRowProps) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { pathname, search } = useLocation();

  const children = (item.children ?? []).filter((c) => (itemFilter ? itemFilter(c) : true));
  const hasChildren = children.length > 0;

  const selfActive = isNavItemActiveSelfWithSearch(item, pathname, search);
  const anyChildActive = children.some((c) => isNavItemActiveSelfWithSearch(c, pathname, search));
  const active = hasChildren ? selfActive && !anyChildActive : selfActive;
  const partiallyActive =
    !active && hasChildren && (anyChildActive || isNavItemActive(item, pathname));

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={item.label}
          className={cn(
            nested && "pl-7 text-[13px]",
            partiallyActive && "bg-sidebar-accent/50 text-sidebar-accent-foreground",
            buttonClassName,
          )}
        >
          <NavLink
            to={item.route}
            end={item.route === "/" || item.route === "/portal"}
            aria-current={active ? "page" : undefined}
            data-branch-active={partiallyActive ? "true" : undefined}
            onClick={() => {
              if (isMobile) setOpenMobile(false);
            }}
            className="hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            {!collapsed && (
              <span className="flex items-center gap-2 flex-1 min-w-0">
                <span className="truncate">{item.label}</span>
                {item.badgeSlot === "alertas" ? (
                  <AlertasBadgeMenu />
                ) : item.badgeCount ? (
                  <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                    {item.badgeCount}
                  </span>
                ) : (
                  item.badge && (
                    <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      {item.badge}
                    </span>
                  )
                )}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>

        {hasChildren && !collapsed && (
          <SidebarMenuAction
            aria-label={`${childrenOpen ? "Recolher" : "Expandir"} ${item.label}`}
            aria-expanded={childrenOpen}
            onClick={() => onToggleChildren?.(!childrenOpen)}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", childrenOpen && "rotate-180")}
              aria-hidden="true"
            />
          </SidebarMenuAction>
        )}
      </SidebarMenuItem>

      {hasChildren &&
        !collapsed &&
        childrenOpen &&
        children.map((c) => <NavItemRow key={c.id} item={c} nested />)}
    </>
  );
}
