const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^entregas/(${UUID})/comprovantes/${UUID}\\.[a-z0-9]{1,10}$`, "i");

/**
 * Locator contract only (paths written by the existing upload flows).
 * Tenant/role authorization stays in Storage RLS (`storage1_delivery_allowed`).
 * Anything else — other prefixes, another delivery, traversal — fails closed.
 */
export function deliveryReceiptLocator(entregaId: string | null | undefined, path: unknown): string | null {
  if (typeof entregaId !== "string" || typeof path !== "string") return null;
  const match = PATH.exec(path);
  return match && match[1].toLowerCase() === entregaId.toLowerCase() ? path : null;
}

export const DELIVERY_RECEIPT_BUCKET = "entrega-documentos";
