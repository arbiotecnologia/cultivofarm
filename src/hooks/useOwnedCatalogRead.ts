import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantCatalogScope, useTenantCatalogScopeFence } from "@/hooks/useTenantCatalogVisibility";
import { ownedCatalogKeys, readOwnedCatalog, TENANT_OWNED_CATALOG_ENABLED } from "@/lib/catalogo/tenantCatalogOwnership";
import type { TenantCatalogEntity } from "@/lib/catalogo/tenantCatalogVisibility";

export function useOwnedCatalogRead(entity: TenantCatalogEntity, opts: {
  search?: string; offset?: number; archived?: boolean; id?: string; enabled?: boolean;
} = {}) {
  const scope = useTenantCatalogScope();
  useTenantCatalogScopeFence(scope);
  const offset = opts.offset ?? 0;
  return useQuery({
    queryKey: scope ? (opts.id ? ownedCatalogKeys.detail(scope, entity, opts.id, offset)
      : ownedCatalogKeys.list(scope, entity, opts.search ?? "", offset, 50, opts.archived))
      : ["tenant-catalog", "unscoped", "owned", entity],
    enabled: !!scope && TENANT_OWNED_CATALOG_ENABLED && (opts.enabled ?? true),
    retry: false, staleTime: 30_000, refetchOnWindowFocus: false,
    queryFn: ({ signal }) => {
      if (!scope) throw new Error("Sessão da empresa não carregada.");
      return readOwnedCatalog(supabase, scope, entity, { ...opts, offset, signal });
    },
  });
}