import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildTenantProductPayload, parseTenantProductAck, tenantProductErrorMessage,
  type TenantProduct, type TenantProductDraft,
} from "@/lib/catalogo/tenantProducts";

type Rpc = (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
const rpc = () => supabase.rpc as unknown as Rpc;

export const TENANT_PRODUCTS_KEY = ["tenant-products"] as const;

export function useTenantProducts(includeArchived: boolean) {
  return useQuery({
    queryKey: [...TENANT_PRODUCTS_KEY, includeArchived],
    queryFn: async () => {
      const { data, error } = await rpc()("tenant_product_list", { p_include_archived: includeArchived });
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
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async (v: { id: string | null; draft: TenantProductDraft; expectedUpdatedAt: string | null }) => {
      const payload = buildTenantProductPayload(v.draft, v.id === null);
      const sig = JSON.stringify([v.id, payload, v.expectedUpdatedAt]);
      if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: crypto.randomUUID() };
      const { data, error } = await rpc()("tenant_product_save", {
        p_product_id: v.id, p_payload: payload, p_expected_updated_at: v.expectedUpdatedAt, p_idempotency_key: keyRef.current.key,
      });
      if (error) {
        if (error.code && error.code !== "") keyRef.current = null; // recusa definitiva: nova intenção, nova chave
        throw new Error(tenantProductErrorMessage(error.code, error.message));
      }
      const ack = parseTenantProductAck(data, v.id);
      keyRef.current = null;
      return ack;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TENANT_PRODUCTS_KEY }),
  });
}

export function useArchiveTenantProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; archived: boolean; expectedUpdatedAt: string }) => {
      const { data, error } = await rpc()("tenant_product_set_archived", {
        p_product_id: v.id, p_archived: v.archived, p_expected_updated_at: v.expectedUpdatedAt, p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw new Error(tenantProductErrorMessage(error.code, error.message));
      return parseTenantProductAck({ replayed: false, ...(data as object) }, v.id);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TENANT_PRODUCTS_KEY }),
  });
}
