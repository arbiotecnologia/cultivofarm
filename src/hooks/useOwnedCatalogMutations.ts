import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantCatalogScope } from "@/hooks/useTenantCatalogVisibility";
import {
  mutateOwnedItem,
  mutateOwnedPresentation,
  ownedCatalogKeys,
  type OwnedMutation,
  type OwnedPresentationMutation,
} from "@/lib/catalogo/tenantCatalogOwnership";
import { tenantCatalogKeys, type TenantCatalogEntity } from "@/lib/catalogo/tenantCatalogVisibility";

export function useOwnedCatalogCapability() {
  const { roles } = useAuth();
  const scope = useTenantCatalogScope();
  const canManage = roles.some((role) => role === "administrador" || role === "gestor");
  return useMemo(() => ({ scope, canManage: !!scope && canManage }), [scope, canManage]);
}

export function useOwnedCatalogMutation(entity: TenantCatalogEntity, onApplied?: () => Promise<void> | void) {
  const qc = useQueryClient();
  const capability = useOwnedCatalogCapability();
  return useMutation({
    mutationFn: async (input: OwnedMutation & { scopeKey: string }) => {
      const current = capability.scope ? `${capability.scope.organizationId}|${capability.scope.userId}` : "";
      if (!capability.canManage || current !== input.scopeKey) throw new Error("A sessão ou a empresa mudou. Reabra o cadastro.");
      return mutateOwnedItem(supabase, input);
    },
    onSuccess: async () => {
      if (!capability.scope) return;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ownedCatalogKeys.list(capability.scope, entity, "", 0, 50).slice(0, 6) }),
        qc.invalidateQueries({ queryKey: tenantCatalogKeys.scope(capability.scope), refetchType: "all" }),
      ]);
      await onApplied?.();
    },
  });
}

export function useOwnedPresentationMutation(onApplied?: () => Promise<void> | void) {
  const qc = useQueryClient();
  const capability = useOwnedCatalogCapability();
  return useMutation({
    mutationFn: async (input: OwnedPresentationMutation & { scopeKey: string }) => {
      const current = capability.scope ? `${capability.scope.organizationId}|${capability.scope.userId}` : "";
      if (!capability.canManage || current !== input.scopeKey) throw new Error("A sessão ou a empresa mudou. Reabra as apresentações.");
      return mutateOwnedPresentation(supabase, input);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["catalogo-volumes"] }),
        qc.invalidateQueries({ queryKey: ["catalogo-volumes-item"] }),
      ]);
      await onApplied?.();
    },
  });
}