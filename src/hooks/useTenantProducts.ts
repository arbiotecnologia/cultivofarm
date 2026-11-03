import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { useStorageAccessScope } from "./useStorageAccessScope";
import { replaceTenantFormulacoes } from "@/lib/catalogo/tenantCatalogRoots";
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
  const delivery = useStorageAccessScope("entregas-operations");
  const keyRef = useRef<{ sig: string; key: string; compositionKey: string } | null>(null);
  const busy = useRef(false);
  return useMutation({
    retry: false,
    onMutate: () => ({ current: scope.capture(), actorScope: actor.scope, deliveryScope: delivery.scope }),
    mutationFn: async (v: { id: string | null; draft: TenantProductDraft; expectedUpdatedAt: string | null; composition?: Record<string, unknown>[] }) => {
      const current = scope.capture();
      if (!current()) throw new Error("catalog_context_unavailable");
      if (busy.current) throw new Error("Aguarde o salvamento em andamento.");
      busy.current = true;
      try {
      const payload = buildTenantProductPayload(v.draft, v.id === null);
      if (v.id && !v.expectedUpdatedAt) throw new Error("Versão do produto desconhecida. Recarregue antes de editar.");
      const sig = JSON.stringify([scope.scope, v.id, payload, v.expectedUpdatedAt, v.composition]);
      if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: crypto.randomUUID(), compositionKey: crypto.randomUUID() };
      const attempt = keyRef.current;
      const { data, error } = await rpc()("tenant_product_save", {
        p_product_id: v.id, p_payload: payload, p_expected_updated_at: v.expectedUpdatedAt, p_idempotency_key: keyRef.current.key,
      });
      if (!current()) throw new Error("catalog_context_changed");
      if (error) {
        if (error.code && error.code !== "") keyRef.current = null; // recusa definitiva: nova intenção, nova chave
        throw new Error(tenantProductErrorMessage(error.code, error.message));
      }
      const ack = parseTenantProductAck(data, v.id);
      if (v.composition !== undefined) {
        try {
          const composition = await replaceTenantFormulacoes(supabase as never, ack.product_id, v.composition, ack.updated_at, attempt.compositionKey);
          if (!current()) throw new Error("catalog_context_changed");
          keyRef.current = null;
          return { ...ack, updated_at: composition.updated_at, compositionError: undefined };
        } catch (e) {
          if (!current()) throw new Error("catalog_context_changed");
          return { ...ack, compositionError: `Produto salvo; composição não confirmada. Recarregue e revise antes de continuar. ${(e as Error).message}` };
        }
      }
      keyRef.current = null;
      return { ...ack, compositionError: undefined };
      } finally { busy.current = false; }
    },
    onSuccess: (_ack, _vars, context) => {
      if (!context?.current()) return;
      return invalidateProductReads(qc, context.actorScope, context.deliveryScope);
    },
  });
}

export function useArchiveTenantProduct() {
  const qc = useQueryClient();
  const scope = useStorageAccessScope("tenant-product-archive");
  const actor = useStorageAccessScope("portal-query-actor");
  const delivery = useStorageAccessScope("entregas-operations");
  const attempt = useRef<{ sig: string; key: string } | null>(null);
  return useMutation({
    retry: false,
    onMutate: () => ({ current: scope.capture(), actorScope: actor.scope, deliveryScope: delivery.scope }),
    mutationFn: async (v: { id: string; archived: boolean; expectedUpdatedAt: string }) => {
      const current = scope.capture();
      if (!current()) throw new Error("catalog_context_unavailable");
      if (!v.expectedUpdatedAt) throw new Error("Versão do produto desconhecida. Recarregue antes de editar.");
      const sig = JSON.stringify([scope.scope, v]);
      if (attempt.current?.sig !== sig) attempt.current = { sig, key: crypto.randomUUID() };
      const { data, error } = await rpc()("tenant_product_set_archived", {
        p_product_id: v.id, p_archived: v.archived, p_expected_updated_at: v.expectedUpdatedAt, p_idempotency_key: attempt.current.key,
      });
      if (!current()) throw new Error("catalog_context_changed");
      if (error) {
        if (error.code) attempt.current = null;
        throw new Error(tenantProductErrorMessage(error.code, error.message));
      }
      const ack = parseTenantProductAck({ replayed: false, ...(data as object) }, v.id);
      attempt.current = null;
      return ack;
    },
    onSuccess: (_ack, _vars, context) => {
      if (!context?.current()) return;
      return invalidateProductReads(qc, context.actorScope, context.deliveryScope);
    },
  });
}

/** Only current-actor scoped readers; never invalidate a foreign session or finance. */
function invalidateProductReads(qc: ReturnType<typeof useQueryClient>, actorScope: string, deliveryScope: string) {
  const prefixes = ["tenant-products", "tenant-product-details", "catalogo-unificado", "catalogo-volumes", "catalogo-tecnico", "partner-catalog-secure", "partner-catalog-tecnico", "estoque_produto"];
  return qc.invalidateQueries({ predicate: q =>
    (prefixes.includes(String(q.queryKey[0])) && q.queryKey.at(-2) === actorScope) ||
    (["entregas", "estoque-prontos-entrega", "todas-os-disponiveis"].includes(String(q.queryKey[0])) && q.queryKey.at(-2) === deliveryScope) });
}
