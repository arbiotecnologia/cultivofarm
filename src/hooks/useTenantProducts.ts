import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { useStorageAccessScope } from "./useStorageAccessScope";
import {
  buildTenantProductPayload, parseTenantProductAck, tenantProductErrorMessage,
  type TenantProduct, type TenantProductDraft,
} from "@/lib/catalogo/tenantProducts";

type Rpc = (n: string, a?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> & { abortSignal: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
const rpc = () => supabase.rpc.bind(supabase) as unknown as Rpc;

export const TENANT_PRODUCTS_KEY = ["tenant-products"] as const;

export function useTenantProducts(includeArchived: boolean) {
  return useScopedPortalQuery<TenantProduct[]>({
    queryKey: [...TENANT_PRODUCTS_KEY, includeArchived],
    queryFn: async (signal) => {
      const { data, error } = await rpc()("tenant_product_list", { p_include_archived: includeArchived }).abortSignal(signal);
      if (error) throw new Error(tenantProductErrorMessage(error.code, error.message));
      if (!Array.isArray(data)) throw new Error("Resposta do servidor inválida");
      return data as TenantProduct[];
    },
    retry: false,
  });
}

/** Uma chave por intenção; repetição após incerteza reusa a mesma chave (servidor devolve recibo). */
export function useSaveTenantProduct() {
  const qc = useQueryClient();
  const scope = useStorageAccessScope("tenant-product-save");
  const actor = useStorageAccessScope("portal-query-actor");
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  return useMutation({
    retry: false,
    onMutate: () => ({ current: scope.capture(), actorScope: actor.scope }),
    mutationFn: async (v: { id: string | null; draft: TenantProductDraft; expectedUpdatedAt: string | null }) => {
      const current = scope.capture();
      if (!current()) throw new Error("catalog_context_unavailable");
      const payload = buildTenantProductPayload(v.draft, v.id === null);
      const sig = JSON.stringify([scope.scope, v.id, payload, v.expectedUpdatedAt]);
      if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: crypto.randomUUID() };
      const { data, error } = await rpc()("tenant_product_save", {
        p_product_id: v.id, p_payload: payload, p_expected_updated_at: v.expectedUpdatedAt, p_idempotency_key: keyRef.current.key,
      });
      if (!current()) throw new Error("catalog_context_changed");
      if (error) {
        if (error.code && error.code !== "") keyRef.current = null; // recusa definitiva: nova intenção, nova chave
        throw new Error(tenantProductErrorMessage(error.code, error.message));
      }
      const ack = parseTenantProductAck(data, v.id);
      keyRef.current = null;
      return ack;
    },
    onSuccess: (_ack, _vars, context) => {
      if (!context?.current()) return;
      return qc.invalidateQueries({ queryKey: TENANT_PRODUCTS_KEY, predicate: q => q.queryKey.at(-2) === context.actorScope });
    },
  });
}

export function useArchiveTenantProduct() {
  const qc = useQueryClient();
  const scope = useStorageAccessScope("tenant-product-archive");
  const actor = useStorageAccessScope("portal-query-actor");
  return useMutation({
    retry: false,
    onMutate: () => ({ current: scope.capture(), actorScope: actor.scope }),
    mutationFn: async (v: { id: string; archived: boolean; expectedUpdatedAt: string }) => {
      const current = scope.capture();
      if (!current()) throw new Error("catalog_context_unavailable");
      const { data, error } = await rpc()("tenant_product_set_archived", {
        p_product_id: v.id, p_archived: v.archived, p_expected_updated_at: v.expectedUpdatedAt, p_idempotency_key: crypto.randomUUID(),
      });
      if (!current()) throw new Error("catalog_context_changed");
      if (error) throw new Error(tenantProductErrorMessage(error.code, error.message));
      return parseTenantProductAck({ replayed: false, ...(data as object) }, v.id);
    },
    onSuccess: (_ack, _vars, context) => {
      if (!context?.current()) return;
      return qc.invalidateQueries({ queryKey: TENANT_PRODUCTS_KEY, predicate: q => q.queryKey.at(-2) === context.actorScope });
    },
  });
}
