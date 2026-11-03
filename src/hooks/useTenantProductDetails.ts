import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";

/** Supplemental RLS reads; no product rows or authority are synthesized here. */
export function useTenantProductDetails() {
  return useScopedPortalQuery({
    queryKey: ["tenant-product-details"],
    queryFn: async signal => {
      const [formulas, microorganisms, profiles] = await Promise.all([
        supabase.from("formulacoes").select("*").abortSignal(signal),
        supabase.from("microrganismos").select("*").order("nome").abortSignal(signal),
        supabase.from("product_technical_profiles").select("produto_id,status_validacao").abortSignal(signal),
      ]);
      const error = formulas.error || microorganisms.error || profiles.error;
      if (error) throw new Error(error.message);
      return { formulas: formulas.data ?? [], microorganisms: microorganisms.data ?? [], profiles: profiles.data ?? [] };
    },
  });
}