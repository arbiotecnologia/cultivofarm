import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchTenantSelectionPage, readTenantVisibility, setTenantVisibility, tenantCatalogKeys, tenantScopeReady,
  type TenantCatalogEntity, type TenantCatalogScope,
} from "@/lib/catalogo/tenantCatalogVisibility";

/** Escopo de identidade+empresa da sessão. `null` enquanto Auth/perfil não estão prontos. */
export function useTenantCatalogScope(): TenantCatalogScope | null {
  const { user, profile, loading } = useAuth();
  return useMemo(() => {
    const s = { userId: user?.id ?? "", organizationId: profile?.organization_id ?? "" };
    if (loading || profile?.user_id !== user?.id) return null;
    return tenantScopeReady(s) ? s : null;
  }, [user?.id, profile?.organization_id, profile?.user_id, loading]);
}

/**
 * Remove caches de catálogo de escopos anteriores quando a identidade/empresa muda
 * (respostas tardias de outro escopo nunca ficam disponíveis no novo).
 */
export function useTenantCatalogScopeFence(scope: TenantCatalogScope | null) {
  const qc = useQueryClient();
  const prev = useRef<string | null>(null);
  const key = scope ? `${scope.organizationId}|${scope.userId}` : null;
  useEffect(() => {
    if (prev.current !== null && prev.current !== key) {
      qc.cancelQueries({ queryKey: tenantCatalogKeys.root });
      qc.removeQueries({ queryKey: tenantCatalogKeys.root });
    }
    prev.current = key;
  }, [key, qc]);
}

export function useTenantVisibilityMap(entity: TenantCatalogEntity, ids: readonly string[]) {
  const scope = useTenantCatalogScope();
  useTenantCatalogScopeFence(scope);
  return useQuery({
    queryKey: scope ? tenantCatalogKeys.visibility(scope, entity, ids) : ["tenant-catalog", "unscoped", entity],
    enabled: !!scope && ids.length > 0,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => readTenantVisibility(supabase, entity, ids, signal),
  });
}

export function useSetTenantVisibility(entity: TenantCatalogEntity) {
  const qc = useQueryClient();
  const scope = useTenantCatalogScope();
  return useMutation({
    mutationFn: async (v: { entityId: string; hidden: boolean; expectedVersion: number; reason: string; idempotencyKey: string; scopeAtStart: TenantCatalogScope }) => {
      if (!scope || scope.organizationId !== v.scopeAtStart.organizationId || scope.userId !== v.scopeAtStart.userId) {
        throw new Error("A sessão ou a empresa mudou. Recarregue antes de alterar.");
      }
      return setTenantVisibility(supabase, { entityType: entity, ...v });
    },
    onSettled: (_d, _e, v) => {
      // Invalida somente o escopo em que a mutação começou.
      if (v) qc.invalidateQueries({ queryKey: tenantCatalogKeys.scope(v.scopeAtStart) });
    },
  });
}

export function useTenantSelection(entity: TenantCatalogEntity, opts: { search?: string; offset?: number; limit?: number; include?: readonly string[]; enabled?: boolean } = {}) {
  const scope = useTenantCatalogScope();
  useTenantCatalogScopeFence(scope);
  const search = (opts.search ?? "").trim();
  const offset = opts.offset ?? 0;
  const include = opts.include ?? [];
  return useQuery({
    queryKey: scope ? tenantCatalogKeys.selection(scope, entity, search, offset, include) : ["tenant-catalog", "unscoped", "selection", entity],
    enabled: !!scope && (opts.enabled ?? true),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => fetchTenantSelectionPage(supabase, { entity, search, offset, limit: opts.limit ?? 100, include, signal }),
  });
}
