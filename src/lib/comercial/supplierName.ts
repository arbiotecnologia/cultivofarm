/**
 * Nome do fornecedor exibido ao comprador B2B. Vem SOMENTE do contexto vendedor
 * autorizado no servidor (B2B_PARTNER_VOLUMES_V1.seller.name), nunca do tenant do
 * comprador nem da marca do sistema. Ausente/vazio → rótulo neutro.
 */
export const NEUTRAL_SUPPLIER = "empresa fornecedora";
/** Rótulo neutro para a empresa operadora (tenant ativo) em telas internas/portal cliente. */
export const NEUTRAL_RESPONSIBLE = "empresa responsável";

function clean(name: unknown): string {
  return typeof name === "string" ? name.trim() : "";
}

export function supplierLabel(name: unknown): string {
  return clean(name) || NEUTRAL_SUPPLIER;
}

export function responsibleLabel(name: unknown): string {
  return clean(name) || NEUTRAL_RESPONSIBLE;
}
