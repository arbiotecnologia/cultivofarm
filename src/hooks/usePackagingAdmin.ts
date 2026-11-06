import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { useStorageAccessScope } from "./useStorageAccessScope";
import { useTenantCatalogEditor } from "./useTenantCatalogEditor";
import { PackagingAttempt, parsePackagingState, type Command } from "@/lib/catalogo/packagingAdminContract";

export function usePackagingAdminRead(productId: string, enabled: boolean) {
  return useScopedPortalQuery({ queryKey: ["product-packaging-admin", productId, "presentations"], enabled: enabled && !!productId,
    queryFn: async signal => {
      const { data, error } = await supabase.rpc("solid_pack_offers_admin_v1" as never, { p_product: productId } as never).abortSignal(signal);
      if (error) throw error;
      return parsePackagingState(data, productId);
    }, retry: false });
}
export function usePackagingAdminSave(productId: string, active = true) {
  const editor = useTenantCatalogEditor();
  const request = useStorageAccessScope(`packaging-admin:${productId}`);
  const actor = useStorageAccessScope("portal-query-actor");
  const qc = useQueryClient();
  const attempt = useRef(new PackagingAttempt());
  const visible = useRef({ active, epoch: 0 });
  if (visible.current.active !== active) { visible.current = { active, epoch: visible.current.epoch + 1 }; }
  const mutation = useMutation({ retry: false, mutationFn: async (command: Command | null) => {
    const e = editor.capture(); const r = request.capture(); const epoch = visible.current.epoch;
    const current = () => visible.current.active && visible.current.epoch === epoch && editor.canEdit && e() && r();
    const actorScope = actor.scope;
    const reconcile = async () => {
      if (!current()) throw new Error("catalog_context_changed");
      await qc.invalidateQueries({ predicate: q => ["product-packaging-admin", "tenant-products", "tenant-product-details", "tenant-product-volumes", "catalogo-volumes"].includes(String(q.queryKey[0])) && q.queryKey.at(-2) === actorScope }, { throwOnError: true });
    };
    const rpc = (name: string, args: Record<string, unknown>) => supabase.rpc(name as never, args as never);
    return command === null ? attempt.current.resume(rpc, request.scope, current, reconcile)
      : attempt.current.send(rpc, request.scope, current, command, reconcile);
  } });
  return { ...mutation, retained: attempt.current.pending };
}