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
const rows = routes.map((route) => {
  const nav = menus.filter((item) => matchesRoute(route.path, item.route));
  const links = sources.filter((path) => path !== "src/App.tsx" && readFileSync(path, "utf8").includes(`"${route.path}"`));
  return { ...route, feature: featureForPath(route.path), profiles: ACTIVE_ROLES.filter((role) => canAccess(role, route.path)), navigation: nav.map((n) => `${n.source}:${n.id}:${n.audience}`), references: links,
    classification: route.redirect || route.index ? 7 : route.path === "*" || route.path.includes(":") || route.ancestors.includes("PlataformaGuard") || ["/auth", "/reset-password", "/app/login", "/selecionar-portal", "/acesso-pendente", "/sem-permissao", "/", "/notificacoes", "/fiscal/reconciliacao", "/comercial/auditoria-motor-b2b"].includes(route.path) ? 8 : nav.length ? 1 : 2,
    verification: "STRUCTURAL_ONLY; Auth/URL/dados autenticados UNVERIFIED" };
});
const pages = sourceFiles("src/pages").map((path) => {
  const module = path.replace(/^src\//, "@/").replace(/\.tsx?$/, "");
  const consumers = sources.filter((s) => s !== path && readFileSync(s, "utf8").includes(module));
  const relativeConsumers = sources.filter((s) => s !== path && readFileSync(s, "utf8").includes(`./${path.split("/").pop()?.replace(/\.tsx?$/, "")}`));
  return { path, consumers: [...new Set([...consumers, ...relativeConsumers])], classification: consumers.length || relativeConsumers.length ? "route_or_embedded; inspect consumers" : "6: no import detected; not automatically exposed" };
});
writeFileSync("docs/auditorias/auditoria-rotas-inventario-2026-10-07.json", JSON.stringify({ source: "src/App.tsx; AST TypeScript", routes: rows, navigation: menus.map(({ id, route, source, audience }) => ({ id, route, source, audience })), pages }, null, 2) + "\n");
console.log(`Inventário: ${rows.length} declarações com path/index; ${menus.length} itens; ${pages.length} arquivos em pages.`);