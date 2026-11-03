import { useLayoutEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { platformCatalogAccess } from "@/lib/catalogo/platformCatalogRead";

/** Global fiscal catalogue fence (products and services). No tenant operation uses it. RLS is authoritative. */
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
  // Catálogo exclusivo por empresa: ficha fiscal de PRODUTO próprio é escrita pelo administrador/gestor do mesmo
  // tenant (mesma regra do ator 'mutate' do servidor); Superadmin não tem bypass. O servidor reautoriza tudo.
  const canWriteOwnedProduct = ready && internal && !platform.ready && actor.roles.some(r => r === "administrador" || r === "gestor");
  const scope = JSON.stringify(["global-product-fiscal", platform.scope, actor.authzEpoch, ready, resource]);
  const live = useRef({ scope, mounted: true });
  live.current.scope = scope;
  useLayoutEffect(() => { live.current.mounted = true; return () => { live.current.mounted = false; }; }, []);
  const capture = () => () => ready && live.current.mounted && live.current.scope === scope && (monitor.current?.() ?? false);
  return { get ready() { return ready && (monitor.current?.() ?? false); }, canWrite, canWriteOwnedProduct, scope, capture };
}
