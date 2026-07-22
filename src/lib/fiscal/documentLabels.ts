/**
 * Fase Fiscal 3.16.2-B — Mapas pt-BR para os enums usados na tela de
 * Documentos Fiscais. Nenhum enum técnico deve vazar para o usuário.
 *
 * A chave `value` técnica permanece inalterada nos payloads/RPCs; a
 * apresentação é a única coisa afetada.
 */

export const DOCUMENT_MODEL_LABELS: Record<string, string> = {
  "55": "NF-e (modelo 55)",
  "65": "NFC-e (modelo 65)",
  NFSE: "NFS-e",
  OTHER: "Outro",
};

export const DOCUMENT_ORIGIN_LABELS: Record<string, string> = {
  MANUAL_RECORD: "Registro manual",
  PROVIDER_IMPORT: "Importado do provedor",
  IMPORTED: "Importado",
  MIGRATED: "Migrado",
  OTHER: "Outro",
};

export const NORMALIZED_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  HOMOLOGATION: "Em homologação",
  ISSUED: "Emitido",
  CANCELED: "Cancelado",
  REJECTED: "Rejeitado",
  ARCHIVED: "Arquivado",
  UNKNOWN: "Desconhecido",
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  AUTHORIZED: "Autorizado",
  CANCELED: "Cancelado",
  REJECTED: "Rejeitado",
  PENDING: "Pendente",
};

export const ENVIRONMENT_LABELS: Record<string, string> = {
  NOT_CONFIGURED: "Não configurado",
  HOMOLOGATION: "Homologação",
  PRODUCTION: "Produção",
};

export const RECONCILIATION_STATUS_LABELS: Record<string, string> = {
  NOT_APPLICABLE: "Não aplicável",
  PENDING: "Pendente",
  MATCHED: "Conciliada",
  DIVERGENT: "Divergente",
  MANUAL_REVIEW: "Revisão manual",
};

export const INVOICE_TYPE_LABELS: Record<string, string> = {
  NFE: "NF-e (produtos)",
  NFSE: "NFS-e (serviços)",
  OTHER: "Outro",
};

export const ITEM_KIND_LABELS: Record<string, string> = {
  PRODUCT: "Produto",
  SERVICE: "Serviço",
};

function pick(map: Record<string, string>, key: string | null | undefined): string {
  if (key === null || key === undefined || key === "") return "—";
  return map[key] ?? key;
}

export const labelDocumentModel = (v: string | null | undefined) => pick(DOCUMENT_MODEL_LABELS, v);
export const labelDocumentOrigin = (v: string | null | undefined) => pick(DOCUMENT_ORIGIN_LABELS, v);
export const labelNormalizedStatus = (v: string | null | undefined) => pick(NORMALIZED_STATUS_LABELS, v);
export const labelStatus = (v: string | null | undefined) => pick(STATUS_LABELS, v);
export const labelEnvironment = (v: string | null | undefined) => pick(ENVIRONMENT_LABELS, v);
export const labelReconciliationStatus = (v: string | null | undefined) =>
  pick(RECONCILIATION_STATUS_LABELS, v);
export const labelInvoiceType = (v: string | null | undefined) => pick(INVOICE_TYPE_LABELS, v);
export const labelItemKind = (v: string | null | undefined) => pick(ITEM_KIND_LABELS, v);
