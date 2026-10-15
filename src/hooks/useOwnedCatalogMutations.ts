import { useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantCatalogScope } from "@/hooks/useTenantCatalogVisibility";
import {
  mutateOwnedItem,
  mutateOwnedPresentation,
  ownedCatalogKeys,
  TENANT_OWNED_CATALOG_ENABLED,
  type OwnedMutation,
  type OwnedPresentationMutation,
} from "@/lib/catalogo/tenantCatalogOwnership";
import { tenantCatalogKeys, type TenantCatalogEntity } from "@/lib/catalogo/tenantCatalogVisibility";
import { catalogoKeyMatchesScope } from "@/hooks/useTenantCatalogVisibility";

export function useOwnedCatalogCapability() {
  const { roles } = useAuth();
  const scope = useTenantCatalogScope();
  const canManage = roles.some((role) => role === "administrador" || role === "gestor");
  return useMemo(() => ({ scope, canManage: !!scope && canManage }), [scope, canManage]);
}

export function useOwnedCatalogMutation(entity: TenantCatalogEntity, onApplied?: () => Promise<void> | void) {
  const qc = useQueryClient();
  const capability = useOwnedCatalogCapability();
  const currentRef = useRef(capability); currentRef.current = capability;
  return useMutation({
    mutationFn: async (input: OwnedMutation & { scopeKey: string }) => {
      const current = capability.scope ? `${capability.scope.organizationId}|${capability.scope.userId}` : "";
      if (!capability.canManage || current !== input.scopeKey) throw new Error("A sessão ou a empresa mudou. Reabra o cadastro.");
      return mutateOwnedItem(supabase, input, undefined, TENANT_OWNED_CATALOG_ENABLED);
    },
    onSuccess: async (_data, input) => {
      const [organizationId, userId] = input.scopeKey.split("|");
      const origin = { organizationId, userId };
      await qc.cancelQueries({ queryKey: [...tenantCatalogKeys.scope(origin), "owned", entity] });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ownedCatalogKeys.list(origin, entity, "", 0, 50).slice(0, 5), refetchType: "all" }),
        qc.invalidateQueries({ queryKey: tenantCatalogKeys.scope(origin), refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["catalogo-unificado"], predicate: catalogoKeyMatchesScope(origin), refetchType: "all" }),
      ]);
      const now = currentRef.current.scope;
      if (now?.organizationId === organizationId && now.userId === userId) await onApplied?.();
    },
  });
}

export function useOwnedPresentationMutation(onApplied?: () => Promise<void> | void) {
  const qc = useQueryClient();
  const capability = useOwnedCatalogCapability();
  const currentRef = useRef(capability); currentRef.current = capability;
  return useMutation({
    mutationFn: async (input: OwnedPresentationMutation & { scopeKey: string }) => {
      const current = capability.scope ? `${capability.scope.organizationId}|${capability.scope.userId}` : "";
      if (!capability.canManage || current !== input.scopeKey) throw new Error("A sessão ou a empresa mudou. Reabra as apresentações.");
      return mutateOwnedPresentation(supabase, input, undefined, TENANT_OWNED_CATALOG_ENABLED);
    },
    onSuccess: async (_data, input) => {
      const [organizationId, userId] = input.scopeKey.split("|");
      const origin = { organizationId, userId };
      await qc.cancelQueries({ queryKey: [...tenantCatalogKeys.scope(origin), "owned", "produto"] });
      await qc.invalidateQueries({ queryKey: [...tenantCatalogKeys.scope(origin), "owned", "produto"], refetchType: "all" });
      const now = currentRef.current.scope;
      if (now?.organizationId === organizationId && now.userId === userId) await onApplied?.();
    },
  });
}