import { useLayoutEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import type { CQReferencia } from "@/hooks/useCQReferencia";

export type { CQReferencia } from "@/hooks/useCQReferencia";

/** Same canonical-item precedence as manual_cq_v1. Presentation is not authorization. */
export function useCQReferencia(microrganismoId?: string | null, produtoId?: string | null) {
  const access = useStorageAccessScope(JSON.stringify(["cq-referencia", produtoId, microrganismoId]));
  const pending = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    pending.current?.abort();
    pending.current = null;
    return () => { pending.current?.abort(); };
  }, [access.scope]);
  const query = useQuery({
    queryKey: ["cq-referencia", access.scope, produtoId, microrganismoId],
    enabled: access.ready && !!(produtoId || microrganismoId),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }): Promise<CQReferencia | null> => {
      if (!access.ready || (!produtoId && !microrganismoId)) return null;
      const current = access.capture();
      const controller = new AbortController();
      pending.current?.abort(); pending.current = controller;
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) controller.abort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stopped = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("CQ_REFERENCE_UNAVAILABLE")), { once: true });
        if (controller.signal.aborted) reject(new Error("CQ_REFERENCE_UNAVAILABLE"));
        timer = setTimeout(abort, 12_000);
      });
      try {
        let request = supabase.from("cq_parametros_referencia").select("*").eq("ativo", true);
        // Product is authoritative even when micro is absent/different. No micro fallback.
        if (produtoId) request = request.eq("produto_id", produtoId);
        else if (microrganismoId) request = request.is("produto_id", null).eq("microrganismo_id", microrganismoId);
        const { data, error } = await Promise.race([request.limit(2).abortSignal(controller.signal), stopped]);
        if (!current() || controller.signal.aborted || error || !data || data.length > 1) throw new Error("CQ_REFERENCE_UNAVAILABLE");
        const ref = data[0];
        if (!ref) return null;
        if (ref.ativo !== true || (produtoId ? ref.produto_id !== produtoId : ref.produto_id !== null || ref.microrganismo_id !== microrganismoId)) throw new Error("CQ_REFERENCE_UNAVAILABLE");
        return ref as CQReferencia;
      } finally {
        clearTimeout(timer); signal.removeEventListener("abort", abort);
        if (pending.current === controller) pending.current = null;
      }
    },
  });
  return { ...query, data: access.ready && !query.isFetching && !query.isError ? query.data : undefined };
}