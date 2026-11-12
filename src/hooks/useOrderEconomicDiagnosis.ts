import { supabase } from "@/integrations/supabase/client";
import { summarize, type OverloadSummary } from "@/lib/fiscal/eligibilityDiagnostic";
import { useScopedPortalQuery } from "./useScopedPortalQuery";

export const ORDER_ECONOMIC_DIAGNOSIS_KEY = "order-economic-diagnosis";

/** Installed two-argument reader; one exact order, canonical session, no fallback or writes. */
export function useOrderEconomicDiagnosis(orderId: string | null) {
  return useScopedPortalQuery<OverloadSummary | null>({
    queryKey: [ORDER_ECONOMIC_DIAGNOSIS_KEY, orderId], enabled: !!orderId, staleTime: 0,
    queryFn: async (signal) => {
      if (!orderId) return null;
      const { data, error } = await supabase.rpc("fn_fiscal_invoice_eligibility", {
        _source_type: "PARTNER_ORDER", _source_id: orderId,
      }).abortSignal(signal);
      if (error) throw error;
      const result = summarize("2-args", "PARTNER_ORDER", orderId, data, null);
      if (result.orderMatchesInput !== true) throw new Error("order_economic_diagnosis_scope_invalid");
      return result;
    },
  });
}