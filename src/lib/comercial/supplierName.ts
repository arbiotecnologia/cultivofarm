/**
 * Nome do fornecedor exibido ao comprador B2B. Vem SOMENTE do contexto vendedor
 * autorizado no servidor (B2B_PARTNER_VOLUMES_V1.seller.name), nunca do tenant do
 * comprador nem da marca do sistema. Ausente/vazio → rótulo neutro.
 */
export const NEUTRAL_SUPPLIER = "empresa fornecedora";

export function supplierLabel(name: unknown): string {
  const n = typeof name === "string" ? name.trim() : "";
  return n || NEUTRAL_SUPPLIER;
}
