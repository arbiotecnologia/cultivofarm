/**
 * Rótulos centrais pt-BR do módulo fiscal.
 *
 * Regras:
 * - Nunca altera o `value` técnico persistido; devolve apenas exibição.
 * - Valor legado/desconhecido → "Não mapeado (VALOR)" — nunca oculto,
 *   nunca coagido.
 * - Este módulo é a única fonte de verdade para rótulos exibidos ao
 *   usuário nas telas fiscais. Componentes não devem construir strings
 *   ad-hoc para enums.
 */

export interface FiscalLabelOption {
  value: string;
  label: string;
}

const NOT_MAPPED = (v: string) => `Não mapeado (${v})`;

function make(map: Record<string, string>) {
  const table = new Map(Object.entries(map));
  const label = (v: string | null | undefined): string => {
    if (v === null || v === undefined) return "—";
    const s = String(v).trim();
    if (s === "") return "—";
    return table.get(s) ?? NOT_MAPPED(s);
  };
  const toOptions = (codes: readonly string[]): FiscalLabelOption[] =>
    codes.map((c) => ({ value: c, label: table.get(c) ?? NOT_MAPPED(c) }));
  return { label, toOptions, map: table };
}

// ————— Empresa / configuração fiscal —————
export const FISCAL_ENVIRONMENT = make({
  NOT_CONFIGURED: "Não configurado",
  HOMOLOGATION: "Homologação",
  PRODUCTION: "Produção",
});

export const FISCAL_CONFIGURATION_STATUS = make({
  DRAFT: "Rascunho",
  PENDING_ACCOUNTING: "Aguardando contabilidade",
  VALIDATED: "Validado pela contabilidade",
  BLOCKED: "Bloqueado",
  READY_FOR_HOMOLOGATION: "Pronto para homologação",
});

export const FISCAL_PROVIDER = make({
  NONE: "Nenhum",
  MANUAL: "Manual",
  NOT_CONFIGURED: "Não configurado",
});

export const NFE_FINALITY = make({
  NORMAL: "Normal",
  COMPLEMENTARY: "Complementar",
  ADJUSTMENT: "Ajuste",
  RETURN: "Devolução",
});

export const NFE_NUMBERING_MODE = make({
  MANUAL_REFERENCE: "Numeração manual (referência)",
  PROVIDER_MANAGED: "Gerida pelo provedor",
});

export const NFE_DANFE_LAYOUT = make({
  PORTRAIT: "Retrato",
  LANDSCAPE: "Paisagem",
});

export const NFE_CONTINGENCY = make({
  DISABLED: "Desativada",
  EPEC: "EPEC",
  FUTURE: "Reservada (uso futuro)",
});

export const NFSE_MODE = make({
  NFSE_NACIONAL: "NFS-e Nacional (padrão)",
  MUNICIPAL: "Padrão municipal",
});

// ————— Documentos fiscais —————
export const DOCUMENT_MODEL = make({
  "55": "NF-e (modelo 55)",
  "65": "NFC-e (modelo 65)",
  NFSE: "NFS-e",
  OTHER: "Outro",
});

export const DOCUMENT_ORIGIN = make({
  MANUAL_RECORD: "Registro manual",
  EXTERNAL_IMPORTED: "Importado externamente",
  SYSTEM_PREPARED: "Preparado pelo sistema",
  PROVIDER_INTEGRATED: "Integrado pelo provedor",
  PROVIDER_IMPORT: "Importado do provedor",
  IMPORTED: "Importado",
  MIGRATED: "Migrado",
  OTHER: "Outro",
});

export const NORMALIZED_STATUS = make({
  DRAFT: "Rascunho",
  HOMOLOGATION: "Em homologação",
  ISSUED: "Emitido",
  AUTHORIZED: "Autorizado",
  CANCELED: "Cancelado",
  CANCELLED: "Cancelado",
  REJECTED: "Rejeitado",
  PENDING: "Pendente",
  ARCHIVED: "Arquivado",
  ERROR: "Erro",
  UNKNOWN: "Desconhecido",
});

export const DOCUMENT_STATUS = make({
  DRAFT: "Rascunho",
  AUTHORIZED: "Autorizado",
  CANCELED: "Cancelado",
  CANCELLED: "Cancelado",
  REJECTED: "Rejeitado",
  PENDING: "Pendente",
  ERROR: "Erro",
});


export const RECONCILIATION_STATUS = make({
  NOT_APPLICABLE: "Não aplicável",
  PENDING: "Pendente",
  RECONCILED: "Conciliada",
  MATCHED: "Conciliada",
  DIVERGENT: "Divergente",
  REQUIRES_REVIEW: "Requer revisão",
  MANUAL_REVIEW: "Revisão manual",
});

export const INVOICE_TYPE = make({
  NFE: "NF-e (produtos)",
  NFSE: "NFS-e (serviços)",
  OTHER: "Outro",
});

export const ITEM_KIND = make({
  PRODUCT: "Produto",
  SERVICE: "Serviço",
});

// ————— Perfis fiscais —————
export const PRODUCT_PROFILE_STATUS = make({
  DRAFT: "Rascunho",
  PENDING_ACCOUNTING: "Aguardando contabilidade",
  VALIDATED: "Validado",
  BLOCKED: "Bloqueado",
  NOT_FISCALLY_SOLD: "Não vendido fiscalmente",
});

export const SERVICE_PROFILE_STATUS = make({
  DRAFT: "Rascunho",
  PENDING_ACCOUNTING: "Aguardando contabilidade",
  VALIDATED: "Validado",
  BLOCKED: "Bloqueado",
  NOT_FISCALLY_BILLED: "Não faturado fiscalmente",
});

export const CUSTOMER_PROFILE_STATUS = make({
  INCOMPLETE: "Incompleto",
  PENDING_REVIEW: "Aguardando revisão",
  VALIDATED: "Validado",
  BLOCKED: "Bloqueado",
});

export const TAXPAYER_INDICATOR = make({
  "1": "Contribuinte de ICMS",
  "2": "Contribuinte isento de IE",
  "9": "Não contribuinte",
});

// ————— Identificação de entidade na lista unificada —————
export const ENTITY_KIND = make({
  produto: "Produto",
  microrganismo: "Microrganismo",
});
