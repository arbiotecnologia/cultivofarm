import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Search, ChevronDown } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { canAccess } from "@/lib/permissions";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { LogoDisplay } from "@/components/LogoDisplay";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertasBadgeMenu } from "@/components/alertas/AlertasBadgeMenu";
import {
  desktopItemsBySection,
  itemsForPlatform,
  type NavItem,
  type NavSection,
} from "@/config/navigation";
import { isNavItemActive, isNavItemActiveSelf } from "@/lib/navigation/matchActive";
import { searchNavItems } from "@/lib/navigation/search";
import { useSidebarGroupState } from "@/hooks/useSidebarGroupState";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { role } = useAuth();
  const { config } = useSystemConfig();

  const nomeEmpresa = config?.nome_empresa || "AR Bio";
  const [query, setQuery] = useState("");

  // Descobre a seção do item ativo — usada para forçar seu grupo aberto.
  const activeSection: NavSection | null = useMemo(() => {
    const all = itemsForPlatform("desktop");
    const active = all.find((it) => isNavItemActive(it, pathname));
    return active?.section ?? null;
  }, [pathname]);

  const { isOpen, setOpen } = useSidebarGroupState(activeSection);

  // Grupos visíveis (filtrados por perfil).
  const groups = useMemo(() => {
    return desktopItemsBySection()
      .map(({ section, items }) => ({
        section,
        items: items.filter((it) => canAccess(role, it.route)),
      }))
      .filter((g) => g.items.length > 0);
  }, [role]);

  // Resultados de busca (achata todos os grupos).
  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    return searchNavItems(itemsForPlatform("desktop"), query, role);
  }, [query, role]);

  const renderItem = (item: NavItem, opts?: { nested?: boolean; parent?: boolean }) => {
    const nested = opts?.nested === true;
    const isParent = opts?.parent === true;
    const hasChildren = !!item.children && item.children.length > 0;
    const selfActive = isNavItemActiveSelf(item, pathname);
    const groupActive = isNavItemActive(item, pathname);
    // Filhos usam apenas match do próprio route. Pais usam match ampliado
    // (matchRoutes + legacyRoutes) e diferenciam "próprio ativo" de
    // "filho ativo" (parcialmente ativo).
    const active = isParent ? selfActive : selfActive;
    const partiallyActive = isParent && !selfActive && groupActive;
    const isCockpit = item.route === "/cockpit-laboratorio";
    const isProducao = role === "producao" || role === "operador_onfarm";

    return (
      <div key={item.id} className="contents">
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={active}
            tooltip={collapsed ? item.label : undefined}
            className={cn(
              isCockpit && isProducao && "bg-primary/5 hover:bg-primary/10 border border-primary/20",
              nested && "pl-7 text-[13px]",
              partiallyActive && "bg-sidebar-accent/50 text-sidebar-accent-foreground",
            )}
          >
            <NavLink
              to={item.route}
              end={item.route === "/"}
              aria-current={active ? "page" : partiallyActive ? "location" : undefined}
              aria-expanded={hasChildren && !collapsed ? true : undefined}
              className="hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
            >
              <item.icon className={cn("h-4 w-4", isCockpit && isProducao && "text-primary")} aria-hidden="true" />
              {!collapsed && (
                <span className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={cn("truncate", isCockpit && isProducao && "font-bold text-primary")}>
                    {item.label}
                  </span>
                  {item.badgeSlot === "alertas" ? (
                    <AlertasBadgeMenu />
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
        </SidebarMenuItem>
        {/* Fase 3.2 — renderiza filhos indentados quando existirem e a sidebar
            estiver expandida. Cada filho respeita `canAccess` do próprio route. */}
        {!collapsed && hasChildren && item.children!
          .filter((c) => canAccess(role, c.route))
          .map((c) => (
            <div key={c.id}>{renderItem(c, { nested: true })}</div>
          ))}
      </div>
    );
  };

  const renderTopLevel = (item: NavItem) =>
    renderItem(item, { parent: !!item.children && item.children.length > 0 });


  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <LogoDisplay size="sm" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-accent-foreground">{nomeEmpresa}</span>
              <span className="text-[10px] text-sidebar-foreground">On-Farm Manager</span>
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="mt-3 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
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
              {searchResults.length > 0
                ? `Resultados (${searchResults.length})`
                : "Nenhum resultado"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{searchResults.map((it) => renderItem(it))}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          groups.map(({ section, items }) => {
            const open = isOpen(section, true);
            return (
              <Collapsible key={section} open={open} onOpenChange={(o) => setOpen(section, o)}>
                <SidebarGroup>
                  <CollapsibleTrigger asChild>
                    <SidebarGroupLabel
                      className="cursor-pointer flex items-center justify-between hover:text-foreground"
                      aria-expanded={open}
                      aria-controls={`nav-section-${section}`}
                    >
                      <span>{section}</span>
                      <ChevronDown
                        className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
                        aria-hidden="true"
                      />
                    </SidebarGroupLabel>
                  </CollapsibleTrigger>
                  <CollapsibleContent id={`nav-section-${section}`}>
                    <SidebarGroupContent>
                      <SidebarMenu>{items.map((it) => renderItem(it))}</SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            );
          })
        )}
      </SidebarContent>
    </Sidebar>
  );
}
