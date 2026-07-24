/**
 * Fase Fiscal 3.21 — Constantes canônicas de origem de item fiscal.
 *
 * `fiscal_invoice_items.source_item_type` aceita várias origens; esta é a
 * única fonte de verdade no cliente. O mesmo conjunto é espelhado em
 * `supabase/functions/_shared/fiscal/sourceItemTypes.ts` para o edge.
 *
 * Não inventar valores fora deste conjunto. Não persistir nada aqui.
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
