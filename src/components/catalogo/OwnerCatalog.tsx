import { usePartnerCatalog } from "@/hooks/usePartnerCatalog";
import { CatalogoCardsGrid } from "@/components/catalogo/CatalogoCardsGrid";
import { partnerCatalogRows } from "@/lib/catalogo/partnerCatalogRows";
import type { CatalogFilterBinding } from "@/lib/catalogo/catalogFilterPreferences";

// Same canonical catalogue source/grid. No order/simulation/payment hooks,
// templates, realtime subscriptions, cart hydration or writable action slots.
export function OwnerCatalog({ partnerId, filterPreferences }: { partnerId: string; filterPreferences?: CatalogFilterBinding }) {
  const catalog = usePartnerCatalog(partnerId);
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">Catálogo</h1>
    <CatalogoCardsGrid scope="b2b" filterPreferences={filterPreferences} source={{ ...catalog, data: partnerCatalogRows(catalog.data ?? []) }}
      showStatusFilter={false} showB2BFilter={false} showInternalBadges={false} hideApprovedBadge />
  </div>;
}