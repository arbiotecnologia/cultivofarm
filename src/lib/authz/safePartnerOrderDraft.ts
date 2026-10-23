/** Volatile user choices only; never prices, hashes, receipts, free text or authority. */
export interface SafePartnerOrderDraft {
  partnerId: string;
  addItemId: string | null;
  items: Array<{ itemId: string; volumeId: string; quantity: number }>;
}
export function safePartnerOrderDraft(value: SafePartnerOrderDraft): SafePartnerOrderDraft | null {
  if (!value.partnerId || value.items.length > 200 || value.items.some(item =>
    !item.itemId || !item.volumeId || !Number.isFinite(item.quantity) || item.quantity <= 0)) return null;
  return { partnerId: value.partnerId, addItemId: value.addItemId,
    items: value.items.map(item => ({ itemId: item.itemId, volumeId: item.volumeId, quantity: item.quantity })) };
}