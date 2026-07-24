/**
 * Fase Fiscal 3.21 — Constantes canônicas de origem de item fiscal (edge).
 *
 * Espelho de `src/lib/fiscal/sourceItemTypes.ts`. Mantido em módulo próprio
 * porque edge functions rodam em Deno e não compartilham caminho com o
 * client. Testes estáticos verificam a paridade dos valores.
 */
export const SOURCE_ITEM_TYPE = Object.freeze({
  PRODUCT: "PRODUCT",
  MICROORGANISM: "MICROORGANISM",
  SERVICE: "SERVICE",
} as const);

export type SourceItemType =
  (typeof SOURCE_ITEM_TYPE)[keyof typeof SOURCE_ITEM_TYPE];

export const SOURCE_ITEM_TYPE_VALUES = Object.freeze(
  Object.values(SOURCE_ITEM_TYPE) as readonly SourceItemType[],
);
