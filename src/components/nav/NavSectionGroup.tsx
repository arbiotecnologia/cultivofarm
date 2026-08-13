import { ChevronDown } from "lucide-react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NavItemRow } from "@/components/nav/NavItemRow";
import { isNavItemActive } from "@/lib/navigation/matchActive";
import { itemCollapseKey } from "@/hooks/useNavCollapseState";
import type { SidebarNavGroup, SidebarNavItem } from "@/components/nav/types";

interface NavSectionGroupProps {
  group: SidebarNavGroup;
  /** Separador visual acima do grupo (distingue módulos, inclusive no modo ícone). */
  showSeparator?: boolean;
  isOpen: (key: string, defaultOpen?: boolean) => boolean;
  setOpen: (key: string, open: boolean) => void;
  /** Classe extra por item (destaques pontuais do admin). */
  itemClassName?: (item: SidebarNavItem) => string | undefined;
}

/**
 * Seção accordion padronizada: rótulo de seção (nível 1), cabeçalhos de
 * subseção (nível 2) e itens/filhos (níveis 3 e 4).
 *
 * Quando a seção está fechada mas contém a rota ativa, o item ativo continua
 * visível abaixo do rótulo — o usuário pode fechar a seção sem perder a
 * indicação de onde está.
 */
export function NavSectionGroup({
  group,
  showSeparator,
  isOpen,
  setOpen,
  itemClassName,
}: NavSectionGroupProps) {
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { pathname } = useLocation();

  const open = isOpen(group.section, true);
  const activeItem = group.items.find(
    (it) =>
      isNavItemActive(it, pathname) ||
      (it.children ?? []).some((c) => isNavItemActive(c, pathname)),
  );

  const renderItem = (it: SidebarNavItem) => {
    const key = itemCollapseKey(it.id);
    const hasActiveChild = (it.children ?? []).some((c) => isNavItemActive(c, pathname));
    return (
      <NavItemRow
        key={it.id}
        item={it}
        childrenOpen={isOpen(key, hasActiveChild || true)}
        onToggleChildren={(o) => setOpen(key, o)}
        buttonClassName={itemClassName?.(it)}
      />
    );
  };

  return (
    <>
      {showSeparator && <SidebarSeparator className="my-1" />}
      <Collapsible open={open} onOpenChange={(o) => setOpen(group.section, o)}>
        <SidebarGroup>
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel
              className="cursor-pointer flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground hover:text-sidebar-accent-foreground"
              aria-expanded={open}
              aria-controls={`nav-section-${group.section}`}
            >
              <span className="truncate">{group.section}</span>
              <ChevronDown
                className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")}
                aria-hidden="true"
              />
            </SidebarGroupLabel>
          </CollapsibleTrigger>

          {/* Seção fechada com rota ativa: mantém apenas o item ativo visível. */}
          {!open && activeItem && (
            <SidebarGroupContent>
              <SidebarMenu>{renderItem(activeItem)}</SidebarMenu>
            </SidebarGroupContent>
          )}

          <CollapsibleContent id={`nav-section-${group.section}`}>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((it, idx) => {
                  const prevSub = idx > 0 ? group.items[idx - 1].subSection : undefined;
                  const showSubHeader = !collapsed && !!it.subSection && it.subSection !== prevSub;
                  return (
                    <div key={it.id} className="contents">
                      {showSubHeader && (
                        <div
                          role="presentation"
                          className="px-2 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/70"
                        >
                          {it.subSection}
                        </div>
                      )}
                      {renderItem(it)}
                    </div>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    </>
  );
}
