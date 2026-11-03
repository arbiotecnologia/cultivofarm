import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveTenantCatalogRoot } from "@/lib/catalogo/tenantCatalogRoots";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { useStorageAccessScope } from "./useStorageAccessScope";
import { useTenantCatalogEditor } from "./useTenantCatalogEditor";
import type { CatalogoVolume } from "./useCatalogoVolumes";

export function useTenantProductVolumes(productId: string, enabled: boolean) {
  return useScopedPortalQuery<CatalogoVolume[]>({
    queryKey: ["tenant-product-volumes", productId], enabled,
    queryFn: async signal => {
      const { data, error } = await supabase.from("catalogo_volumes").select("*").eq("produto_id", productId).order("ordem").abortSignal(signal);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CatalogoVolume[];
    },
  });
}

export function useSaveTenantProductVolume() {
  const editor = useTenantCatalogEditor();
  const actor = useStorageAccessScope("portal-query-actor");
  const qc = useQueryClient();
  const attempt = useRef<{ sig: string; key: string } | null>(null);
  const busy = useRef(false);
  return useMutation({
    retry: false,
    onMutate: () => ({ current: editor.capture(), actorScope: actor.scope }),
    mutationFn: async (v: { id: string | null; productId: string; expectedUpdatedAt: string | null; payload: Record<string, unknown> }) => {
      const current = editor.capture();
      if (!editor.canEdit || !current()) throw new Error("catalog_context_unavailable");
      if (busy.current) throw new Error("Aguarde a alteração em andamento.");
      busy.current = true;
      try {
        const sig = JSON.stringify([editor.scope, v]);
        if (attempt.current?.sig !== sig) attempt.current = { sig, key: crypto.randomUUID() };
        const ack = await saveTenantCatalogRoot(supabase as never, "catalogo_volumes", v.id,
          v.id ? v.payload : { ...v.payload, produto_id: v.productId, item_tipo: "produto" }, v.expectedUpdatedAt, attempt.current.key);
        if (!current()) throw new Error("catalog_context_changed");
        attempt.current = null;
        return ack;
      } finally { busy.current = false; }
    },
    onSuccess: (_ack, _v, context) => {
      if (!context?.current()) return;
      return qc.invalidateQueries({ predicate: q => ["tenant-product-volumes", "catalogo-volumes", "catalogo-unificado", "partner-catalog-secure"].includes(String(q.queryKey[0])) && q.queryKey.at(-2) === context.actorScope });
    },
  });
}