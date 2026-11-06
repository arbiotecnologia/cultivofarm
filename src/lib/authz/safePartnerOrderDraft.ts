/** Volatile user choices only; never prices, hashes, receipts, free text or authority. */
export type SafePartnerOrderDraftItem =
  | { itemId: string; volumeId: string; quantity: number }
  /** Embalagem inteira: só identidade + quantidade inteira; preço/peso/unidade são relidos e revalidados na restauração. */
  | { itemId: string; packagingId: string; quantity: number };
export interface SafePartnerOrderDraft {
  partnerId: string;
  addItemId: string | null;
  /** Data desejada de entrega (YYYY-MM-DD) escolhida pelo usuário; nunca derivada. */
  requestedDeliveryDate: string | null;
  items: SafePartnerOrderDraftItem[];
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isPackaging = (i: SafePartnerOrderDraftItem): i is { itemId: string; packagingId: string; quantity: number } =>
  "packagingId" in i;
export function safePartnerOrderDraft(value: SafePartnerOrderDraft): SafePartnerOrderDraft | null {
  if (!value.partnerId || value.items.length > 200 || value.items.some(item => {
    if (!item.itemId || !Number.isFinite(item.quantity) || item.quantity <= 0) return true;
    if (isPackaging(item)) return !item.packagingId || "volumeId" in item || !Number.isSafeInteger(item.quantity);
    return !item.volumeId;
  })) return null;
  return { partnerId: value.partnerId, addItemId: value.addItemId,
    requestedDeliveryDate: typeof value.requestedDeliveryDate === "string" && DATE_RE.test(value.requestedDeliveryDate)
      ? value.requestedDeliveryDate : null,
    items: value.items.map(item => isPackaging(item)
      ? { itemId: item.itemId, packagingId: item.packagingId, quantity: item.quantity }
      : { itemId: item.itemId, volumeId: item.volumeId, quantity: item.quantity }) };
}
