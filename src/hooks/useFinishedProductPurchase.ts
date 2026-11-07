import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { useStorageAccessScope } from "./useStorageAccessScope";
import {
  FinishedProductPurchaseAttempt,
  parseFinishedProductPurchaseCapability,
  type FinishedProductPurchaseDraft,
  type PurchaseRpc,
} from "@/lib/estoque/finishedProductPurchase";

const rpc = () => supabase.rpc.bind(supabase) as unknown as PurchaseRpc & {
  abortSignal: (signal: AbortSignal) => PurchaseRpc;
};

export function useFinishedProductPurchaseCapability(enabled: boolean) {
  return useScopedPortalQuery({
    queryKey: ["finished-product-purchase-capability", "FINISHED_PRODUCT_PURCHASE_V1"],
    enabled,
    retry: false,
    queryFn: async (signal) => {
      const { data, error } = await supabase
        .rpc("rpc_finished_product_purchase_capability_v1" as never)
        .abortSignal(signal);
      if (error) throw error;
      return parseFinishedProductPurchaseCapability(data);
    },
  });
}

export function useFinishedProductPurchaseEntry() {
  const scope = useStorageAccessScope("finished-product-purchase-entry");
  const attempt = useRef(new FinishedProductPurchaseAttempt());
  const queryClient = useQueryClient();
  const mutation = useMutation({
    retry: false,
    onMutate: () => ({ current: scope.capture() }),
    mutationFn: async (draft: FinishedProductPurchaseDraft) => {
      const current = scope.capture();
      return attempt.current.send({ scope: scope.scope, current, draft, rpc: rpc() });
    },
    onSuccess: (_ack, _draft, context) => {
      if (!context?.current()) return;
      for (const prefix of ["estoque_produto", "estoque-bi-stats", "lotes-aprovados-envasados", "cockpit-producao-resumo"]) {
        void queryClient.invalidateQueries({ queryKey: [prefix] });
      }
    },
  });
  return { ...mutation, hasUncertainAttempt: attempt.current.pending };
}
