import { readFileSync, writeFileSync } from "node:fs";
import { declaredRoutes, matchesRoute, sourceFiles } from "./inventory";
import { navigation } from "../../src/config/navigation";
import { PRODUTOR_MENU_GROUPS, PARCEIRO_GESTOR_GROUPS, PARCEIRO_TECNICO_GROUPS } from "../../src/config/portalMenus";
import { featureForPath } from "../../src/lib/saas/featureRouteMap";
import { ACTIVE_ROLES, canAccess } from "../../src/lib/permissions";

const flat = navigation.flatMap((item) => [item, ...(item.children ?? [])]);
const menus = [...flat.map((item) => ({ ...item, source: "navigation", audience: item.platforms.join(",") })),
  ...[PRODUTOR_MENU_GROUPS, PARCEIRO_GESTOR_GROUPS, PARCEIRO_TECNICO_GROUPS].flatMap((groups) => groups.flatMap((g) => g.items.map((item) => ({ ...item, source: "portalMenus", audience: item.showFor ?? "producer" }))))];
const sources = sourceFiles("src").filter((path) => !path.includes("/test/") && !/\.(test|spec)\./.test(path));
const routes = declaredRoutes();
const internalReasons: Record<string, string> = {
  "/app/checkin": "contextual check-in; requires solicitation; not a top-level tab",
  "/app/visita/novo": "creation action inside technical workspace",
  "/visita-tecnica/nova": "VisitaTecnicaLista creation action; not a standalone menu item",
  "/app/registrar": "MobileLayout floating action and technical dashboard",
  "/app/ordens": "technical/producer dashboard action",
  "/app/aplicacoes": "producer workflow; review discoverability with real identity",
  "/app/aplicacoes/lista": "producer dashboard action",
  "/app/solicitar": "producer dashboard action",
  "/talhoes": "Fazendas > TalhoesFazendaTab; not separate sidebar",
  "/estoque/embalagens": "Estoque workspace and executive shortcuts",
  "/portal-parceiro": "layout entry and index redirect",
  "/portal-parceiro/solicitacoes": "deliberately redirected/hidden by existing portal product rules",
  "/portal-parceiro/novo": "order action; contextual entry",
  "/portal-parceiro/historico": "deliberately redirected by existing portal product rules",
  "/portal-parceiro/meus-produtores": "technical dashboard action; gestor redirected",
  "/portal-parceiro/tecnicos-produtores": "existing link-management UI hidden for partner roles",
  "/portal-parceiro/usuarios-clientes": "existing link-management UI hidden for partner roles",
};
const rows = routes.map((route) => {
  const nav = menus.filter((item) => matchesRoute(route.path, item.route));
  const links = sources.filter((path) => path !== "src/App.tsx" && readFileSync(path, "utf8").includes(`"${route.path}"`));
  const contextual = internalReasons[route.path] ?? (route.path.startsWith("/financeiro/relatorios/") ? "child report reached from FinanceiroRelatorios" : route.path.startsWith("/configuracoes/") && !nav.length ? "child configuration reached from Configuracoes; platform-only where guarded" : null);
  const alias = route.redirect || route.index || route.components.includes("PortalFilaAprovacao");
  return { ...route, feature: featureForPath(route.path), profiles: ACTIVE_ROLES.filter((role) => canAccess(role, route.path)), profileBasis: "ACCESS_MAP candidates only; ancestor/tenant/link guards may further restrict", navigation: nav.map((n) => `${n.source}:${n.id}:${n.audience}`), references: links,
    classification: alias ? 7 : route.path === "*" || route.path.includes(":") || route.ancestors.includes("PlataformaGuard") || contextual || ["/auth", "/reset-password", "/app/login", "/selecionar-portal", "/acesso-pendente", "/sem-permissao", "/", "/notificacoes", "/fiscal/reconciliacao", "/comercial/auditoria-motor-b2b"].includes(route.path) ? 8 : nav.length ? 1 : 2,
    navigationJustification: nav.length ? "declarative navigation" : alias ? "legacy/index redirect; inspect target" : contextual ?? (route.path.includes(":") ? "contextual detail/token route; identifier required" : "system/internal route; never automatically expose"),
    desktopMobileJustification: "Existing audience-specific portal/workspace registry preserved; desktop operational suite differs intentionally from field mobile tabs. Auth usability remains unverified.",
    verification: "STRUCTURAL_ONLY; Auth/URL/dados autenticados UNVERIFIED" };
});
const pages = sourceFiles("src/pages").map((path) => {
  const module = path.replace(/^src\//, "@/").replace(/\.tsx?$/, "");
  const consumers = sources.filter((s) => s !== path && readFileSync(s, "utf8").includes(module));
  const basename = path.split("/").pop()?.replace(/\.tsx?$/, "") ?? "";
  const relativeConsumers = sources.filter((s) => s !== path && new RegExp(`from\\s+["'][^"']*/${basename}["']`).test(readFileSync(s, "utf8")));
  return { path, consumers: [...new Set([...consumers, ...relativeConsumers])], classification: consumers.length || relativeConsumers.length ? "route_or_embedded; inspect consumers" : "6: no import detected; not automatically exposed" };
});
writeFileSync("docs/auditorias/auditoria-rotas-inventario-2026-10-07.json", JSON.stringify({ source: "src/App.tsx; AST TypeScript", routes: rows, navigation: menus.map(({ id, route, source, audience }) => ({ id, route, source, audience })), pages }, null, 2) + "\n");
console.log(`Inventário: ${rows.length} declarações com path/index; ${menus.length} itens; ${pages.length} arquivos em pages.`);