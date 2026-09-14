/**
 * Textos da modalidade de entrega. Não altera status nem workflow:
 * apenas a forma como a entrega é apresentada ao usuário.
 */
export type TipoEntrega = "motorista" | "retirada";

export function normalizarTipoEntrega(valor: unknown): TipoEntrega {
  return valor === "retirada" ? "retirada" : "motorista";
}

/** Rótulo da modalidade: "Retirada" ou "Entrega por motorista". */
export function labelModalidade(valor: unknown): string {
  return normalizarTipoEntrega(valor) === "retirada" ? "Retirada" : "Entrega por motorista";
}

/** Rótulo do campo de responsável: "Retirado por" ou "Motorista". */
export function labelResponsavel(valor: unknown): string {
  return normalizarTipoEntrega(valor) === "retirada" ? "Retirado por" : "Motorista";
}

/** Rótulo curto para colunas e cartões. */
export function labelResponsavelCurto(valor: unknown): string {
  return normalizarTipoEntrega(valor) === "retirada" ? "Retirado por" : "Motorista";
}
