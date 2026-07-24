/**
 * Fase Fiscal 3.16.2-B — Mapas pt-BR para os enums usados na tela de
 * Documentos Fiscais.
 *
 * Compatibilidade: continua exportando os símbolos originais, agora
 * delegando à fonte única em `@/lib/fiscal/labels`.
 */

import {
  DOCUMENT_MODEL,
  DOCUMENT_ORIGIN,
  NORMALIZED_STATUS,
  DOCUMENT_STATUS,
  FISCAL_ENVIRONMENT,
  RECONCILIATION_STATUS,
  INVOICE_TYPE,
  ITEM_KIND,
} from "@/lib/fiscal/labels";

export const DOCUMENT_MODEL_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_MODEL.map,
);
export const DOCUMENT_ORIGIN_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_ORIGIN.map,
);
export const NORMALIZED_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  NORMALIZED_STATUS.map,
);
export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_STATUS.map,
);
export const ENVIRONMENT_LABELS: Record<string, string> = Object.fromEntries(
  FISCAL_ENVIRONMENT.map,
);
export const RECONCILIATION_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  RECONCILIATION_STATUS.map,
);
export const INVOICE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  INVOICE_TYPE.map,
);
export const ITEM_KIND_LABELS: Record<string, string> = Object.fromEntries(
  ITEM_KIND.map,
);

export const labelDocumentModel = DOCUMENT_MODEL.label;
export const labelDocumentOrigin = DOCUMENT_ORIGIN.label;
export const labelNormalizedStatus = NORMALIZED_STATUS.label;
export const labelStatus = DOCUMENT_STATUS.label;
export const labelEnvironment = FISCAL_ENVIRONMENT.label;
export const labelReconciliationStatus = RECONCILIATION_STATUS.label;
export const labelInvoiceType = INVOICE_TYPE.label;
export const labelItemKind = ITEM_KIND.label;
