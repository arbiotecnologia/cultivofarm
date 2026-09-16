import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  readActiveContext,
  resolveEffectiveRouteRole,
} from "@/lib/navigation/portalRoleContext";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { LogoDisplay } from "@/components/LogoDisplay";
import { PortalSidebar } from "@/components/nav/PortalSidebar";
import { desktopItemsBySection, type NavItem } from "@/config/navigation";
import { isNavItemFeatureEnabled } from "@/lib/navigation/search";
import type { SidebarNavGroup } from "@/components/nav/types";

/**
 * Sidebar administrativa — apenas monta os grupos visíveis (permissão + flag +
 * allowedRoles) e delega toda a apresentação/comportamento à `PortalSidebar`
 * compartilhada. Rotas, ACCESS_MAP e flags permanecem intactos.
 */
export function AppSidebar() {
  const { role, roles } = useAuth();
  const { config } = useSystemConfig();
  const nomeEmpresa = config?.nome_empresa || "Cultivo Farm";
  // Auditoria de perfis: a visibilidade do menu passa a usar a MESMA fonte do
  // `RoleGuard` (papel efetivo por contexto ativo). Antes usava apenas o papel
  // primário, escondendo itens que o usuário multipapel podia realmente abrir.
  const activeContext = readActiveContext();

  /** Rota sem query string — deep links (`?tab=`) usam a permissão da página. */
  const routePath = (route: string) =>
    route.indexOf("?") === -1 ? route : route.slice(0, route.indexOf("?"));

  const allowedRolesOk = (item: NavItem) =>
    !item.allowedRoles ||
    (roles ?? []).some((r) => (item.allowedRoles as string[]).includes(r));

  const isVisible = (item: NavItem) =>
    resolveEffectiveRouteRole({
      roles,
      primaryRole: role,
      path: routePath(item.route),
      activeContext,
    }).allowed &&
    isNavItemFeatureEnabled(item) &&
    allowedRolesOk(item);

  const groups: SidebarNavGroup[] = useMemo(() => {
    return desktopItemsBySection()
      .map(({ section, items }) => ({
        section: section as string,
        items: items.filter(isVisible).map((it) => ({
          ...it,
          children: it.children?.filter(isVisible),
        })),
      }))
      .filter((g) => g.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, roles, activeContext]);

  const isProducao = role === "producao" || role === "operador_onfarm";

  return (
    <PortalSidebar
      portal="admin"
      groups={groups}
      brandTitle={nomeEmpresa}
      brandSubtitle="Cultivo Farm"
      brandSlot={<LogoDisplay size="sm" />}
      itemClassName={(item) =>
        item.route === "/cockpit-laboratorio" && isProducao
          ? "bg-primary/5 hover:bg-primary/10 border border-primary/20"
          : undefined
      }
    />
  );
}
