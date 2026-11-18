import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { productDossierSchema } from "./useProductRegulatoryDossiers";
import { z } from "zod";

/** Read the existing private dossier; never mirror registry/manufacturer into product metadata. */
export function useProductResearchDossier(productId: string, enabled: boolean) {
  return useScopedPortalQuery({
    queryKey: ["product-research-dossier", productId], enabled, retry: false,
    queryFn: async signal => {
      const context = await (supabase as any).rpc("tenant_product_dossier_management_context", { p_product_id: productId }).abortSignal(signal);
      if (context.error) throw context.error;
      const value = z.object({ product_id: z.literal(productId), dossier_microorganism_id: z.string().uuid().nullable() }).parse(context.data);
      if (!value.dossier_microorganism_id) return null;
      const detail = await (supabase as any).rpc("rpc_regulatory_product_dossier_detail", { p_product_id: productId, p_microorganism_id: value.dossier_microorganism_id }).abortSignal(signal);
      if (detail.error) throw detail.error;
      const parsed = productDossierSchema.parse(detail.data);
      if (parsed.product_id !== productId) throw new Error("documentary_target_mismatch");
      return parsed.dossier;
    },
  });
}