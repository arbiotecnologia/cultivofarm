import { useLayoutEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { platformCatalogAccess } from "@/lib/catalogo/platformCatalogRead";

/** Global product-only fence. No tenant operation uses this hook. RLS is authoritative. */
export function useProductFiscalAccess(resource: string) {
  const actor = useAuth();
  const platform = platformCatalogAccess(actor);
  const internal = !actor.loading && !actor.error && !!actor.user &&
    actor.session?.user.id === actor.user.id && actor.profile?.user_id === actor.user.id &&
    actor.profile.ativo === true && actor.profile.senha_provisoria === false &&
    !!actor.profile.organization_id && actor.roles.some(r => ["administrador", "gestor", "financeiro"].includes(r));
  const monitor = useRef(actor.checkAuthzAccess);
  monitor.current = actor.checkAuthzAccess;
  const ready = (platform.ready || internal) && actor.authzReady === true && (monitor.current?.() ?? false);
  const canWrite = ready && platform.ready;
  const scope = JSON.stringify(["global-product-fiscal", platform.scope, actor.authzEpoch, ready, resource]);
  const live = useRef({ scope, mounted: true });
  live.current.scope = scope;
  useLayoutEffect(() => { live.current.mounted = true; return () => { live.current.mounted = false; }; }, []);
  const capture = () => () => ready && live.current.mounted && live.current.scope === scope && (monitor.current?.() ?? false);
  return { get ready() { return ready && (monitor.current?.() ?? false); }, canWrite, scope, capture };
}
