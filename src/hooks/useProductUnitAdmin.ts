import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { parseUnitCapability, parseAdminUnit } from "@/lib/catalogo/productUnitContract";

/** Read capability only; tenant_product_save remains the single authorized writer. */
export function useProductUnitCapability(enabled: boolean) {
  return useScopedPortalQuery({
    queryKey: ["product-unit-capability", "PRODUCT_UNIT_V2"], enabled, retry: false,
    queryFn: async signal => {
      const { data, error } = await supabase.rpc("tenant_product_unit_capability_v1" as never).abortSignal(signal);
      if (error) throw error;
      return parseUnitCapability(data);
    },
  });
}
export function useProductUnitAdmin(productId: string, enabled: boolean) {
  return useScopedPortalQuery({
    queryKey: ["product-packaging-admin", productId], enabled: enabled && !!productId, retry: false,
    queryFn: async signal => {
      const { data, error } = await supabase.rpc("solid_pack_offers_admin_v1" as never, { p_product: productId } as never).abortSignal(signal);
      if (error) throw error;
      return parseAdminUnit(data, productId);
    },
  });
}