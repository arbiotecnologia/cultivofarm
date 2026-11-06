import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import {
  PACKAGING_ORDER_CONTRACT, isPackagingReaderAbsent, parsePackagingOffers, type PackagingOffersByProduct,
} from "@/lib/comercial/packagingOrder";

export type PackagingOffersResult =
  | { state: "available"; offers: PackagingOffersByProduct }
  | { state: "not_installed"; offers: PackagingOffersByProduct };

/** Leitor escopado; ausência exata do endpoint => "not_installed" (sólidos fechados). Outros erros propagam (fail-closed). */
export async function fetchPartnerPackagingOffers(partnerId: string, signal: AbortSignal): Promise<PackagingOffersResult> {
  const { data, error } = await supabase
    .rpc("get_partner_packaging_offers_secure" as never, { p_partner_id: partnerId } as never)
    .abortSignal(signal);
  if (error) {
    if (isPackagingReaderAbsent(error)) return { state: "not_installed", offers: new Map() };
    throw error;
  }
  return { state: "available", offers: parsePackagingOffers(data, partnerId) };
}

export function usePartnerPackagingOffers(partnerId: string | null | undefined) {
  return useScopedPortalQuery({
    queryKey: ["partner-packaging-offers", PACKAGING_ORDER_CONTRACT, partnerId],
    enabled: !!partnerId,
    retry: false,
    staleTime: 60_000,
    queryFn: (signal) => {
      if (!partnerId) throw new Error("partner_required");
      return fetchPartnerPackagingOffers(partnerId, signal);
    },
  });
}
