import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import { useEntitlements } from "@/hooks/useEntitlements";
import { isPathEntitled, featureForPath } from "@/lib/saas/featureRouteMap";
import ForaDoPlano from "@/components/guards/ForaDoPlano";

/**
 * Gate canônico de plano para rotas aninhadas de portais especializados.
 * Condição ADICIONAL aos guards de vínculo/perfil: nunca libera o que o
 * perfil não libera. Bloqueia antes de montar a página (sem queries de dados).
 * Rotas sem feature mapeada passam inalteradas.
 */
export function EntitlementOutlet() {
  const { pathname } = useLocation();
  const context = useOutletContext<unknown>();
  const entitlements = useEntitlements();
  if (featureForPath(pathname) && !isPathEntitled(pathname, entitlements)) {
    return <ForaDoPlano status={entitlements.status} />;
  }
  // The nested outlet must not replace the parent layout's resource context.
  // This only forwards the existing value after the unchanged plan barrier.
  return <Outlet context={context} />;
}

export default EntitlementOutlet;
