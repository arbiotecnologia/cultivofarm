import { useEffect, useMemo, useRef } from "react";
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

function useMutationFence(capability: ReturnType<typeof useOwnedCatalogCapability>) {
  const identity = capability.scope ? `${capability.scope.organizationId}|${capability.scope.userId}|${capability.canManage}` : "";
  const state = useRef({ identity, generation: 0, controllers: new Set<AbortController>() });
  if (state.current.identity !== identity) {
    state.current.controllers.forEach((controller) => controller.abort());
    state.current.controllers.clear(); state.current.identity = identity; state.current.generation += 1;
  }
  useEffect(() => () => {
    state.current.generation += 1;
    state.current.controllers.forEach((controller) => controller.abort());
    state.current.controllers.clear();
  }, []);
  return (scopeKey: string) => {
    const scope = capability.scope;
    if (!capability.canManage || !scope || `${scope.organizationId}|${scope.userId}` !== scopeKey)
      throw new Error("A sessão ou a empresa mudou. Reabra o cadastro.");
    const generation = state.current.generation;
    const controller = new AbortController(); state.current.controllers.add(controller);
    return {
      signal: controller.signal,
      active: () => !controller.signal.aborted && state.current.generation === generation,
      finish: () => state.current.controllers.delete(controller),
    };
  };
}

export function useOwnedCatalogMutation(entity: TenantCatalogEntity, onApplied?: () => Promise<void> | void) {
  const qc = useQueryClient();
  const capability = useOwnedCatalogCapability();
  const begin = useMutationFence(capability);
  return useMutation({
    mutationFn: async (input: OwnedMutation & { scopeKey: string }) => {
      const fence = begin(input.scopeKey);
      try {
        const data = await mutateOwnedItem(supabase, input, fence.signal, TENANT_OWNED_CATALOG_ENABLED);
        if (!fence.active()) throw new Error("Solicitação encerrada.");
        return { ...data, active: fence.active };
      } finally { fence.finish(); }
    },
    onSuccess: async (data, input) => {
      if (!data.active()) return;
      const [organizationId, userId] = input.scopeKey.split("|");
      const origin = { organizationId, userId };
      await qc.cancelQueries({ queryKey: [...tenantCatalogKeys.scope(origin), "owned", entity] });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ownedCatalogKeys.list(origin, entity, "", 0, 50).slice(0, 5), refetchType: "all" }),
        qc.invalidateQueries({ queryKey: tenantCatalogKeys.scope(origin), refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["catalogo-unificado"], predicate: catalogoKeyMatchesScope(origin), refetchType: "all" }),
      ]);
      if (data.active()) await onApplied?.();
    },
  });
}

export function useOwnedPresentationMutation(onApplied?: () => Promise<void> | void) {
  const qc = useQueryClient();
  const capability = useOwnedCatalogCapability();
  const begin = useMutationFence(capability);
  return useMutation({
    mutationFn: async (input: OwnedPresentationMutation & { scopeKey: string }) => {
      const fence = begin(input.scopeKey);
      try {
        const data = await mutateOwnedPresentation(supabase, input, fence.signal, TENANT_OWNED_CATALOG_ENABLED);
        if (!fence.active()) throw new Error("Solicitação encerrada.");
        return { ...data, active: fence.active };
      } finally { fence.finish(); }
    },
    onSuccess: async (data, input) => {
      if (!data.active()) return;
      const [organizationId, userId] = input.scopeKey.split("|");
      const origin = { organizationId, userId };
      await qc.cancelQueries({ queryKey: [...tenantCatalogKeys.scope(origin), "owned", "produto"] });
      await qc.invalidateQueries({ queryKey: [...tenantCatalogKeys.scope(origin), "owned", "produto"], refetchType: "all" });
      if (data.active()) await onApplied?.();
    },
  });
}