/**
 * Fase SINIEF 2 — Códigos de erro estáveis e mensagens pt-BR amigáveis.
 *
 * Nunca embutir SQL, segredos, id de auth ou payload cru nas mensagens.
 * O `code` é a API pública; o `message` pode evoluir sem breaking change.
 */

export const SINIEF_ERROR_CODES = Object.freeze({
  // Base
  OPERATION_TYPE_INVALID: "OPERATION_TYPE_INVALID",
  DIRECTION_INVALID: "DIRECTION_INVALID",
  FIN_NFE_INVALID: "FIN_NFE_INVALID",
  ISSUER_CNPJ_INVALID: "ISSUER_CNPJ_INVALID",
  RECIPIENT_MISSING: "RECIPIENT_MISSING",
  RECIPIENT_CNPJ_INVALID: "RECIPIENT_CNPJ_INVALID",
  ITEMS_EMPTY: "ITEMS_EMPTY",
  ITEM_QUANTITY_NON_POSITIVE: "ITEM_QUANTITY_NON_POSITIVE",
  ITEM_UNIT_VALUE_NON_POSITIVE: "ITEM_UNIT_VALUE_NON_POSITIVE",
  ITEM_SEQUENCE_NON_POSITIVE: "ITEM_SEQUENCE_NON_POSITIVE",
  ITEM_SEQUENCE_DUPLICATE: "ITEM_SEQUENCE_DUPLICATE",
  ITEM_CFOP_INVALID_FOR_SCENARIO: "ITEM_CFOP_INVALID_FOR_SCENARIO",
  SERVICE_ITEM_REJECTED: "SERVICE_ITEM_REJECTED",
  ACCESS_KEY_INVALID: "ACCESS_KEY_INVALID",
  TAX_SETUP_NOT_APPROVED: "TAX_SETUP_NOT_APPROVED",
  NAT_OP_MISMATCH: "NAT_OP_MISMATCH",
  ICMS_STATE_REQUIRED_EXPLICIT: "ICMS_STATE_REQUIRED_EXPLICIT",
  // SINIEF 20/2026
  ICMS_AMOUNT_WITHOUT_DUE: "ICMS_AMOUNT_WITHOUT_DUE",
  ICMS_AMOUNT_INVALID: "ICMS_AMOUNT_INVALID",
  REDUCTION_ORIGINAL_RECIPIENT_SNAPSHOT_REQUIRED:
    "REDUCTION_ORIGINAL_RECIPIENT_SNAPSHOT_REQUIRED",


  // ADVANCE_PAYMENT
  ADVANCE_ORDER_MISSING: "ADVANCE_ORDER_MISSING",
  ADVANCE_DELIVERY_DATE_MISSING: "ADVANCE_DELIVERY_DATE_MISSING",
  ADVANCE_DELIVERY_DATE_INVALID: "ADVANCE_DELIVERY_DATE_INVALID",
  ADVANCE_ITEM_MUST_NOT_MOVE_STOCK: "ADVANCE_ITEM_MUST_NOT_MOVE_STOCK",

  // EFFECTIVE_SALE_AFTER_ADVANCE
  EFFECTIVE_REFERENCE_MISSING: "EFFECTIVE_REFERENCE_MISSING",
  EFFECTIVE_REFERENCE_DUPLICATE: "EFFECTIVE_REFERENCE_DUPLICATE",
  EFFECTIVE_EXCEEDS_ADVANCE_BALANCE: "EFFECTIVE_EXCEEDS_ADVANCE_BALANCE",

  // STOCK_LOSS
  STOCK_LOSS_REASON_INVALID: "STOCK_LOSS_REASON_INVALID",
  STOCK_LOSS_JUSTIFICATION_MISSING: "STOCK_LOSS_JUSTIFICATION_MISSING",
  STOCK_LOSS_RECIPIENT_MUST_BE_ISSUER: "STOCK_LOSS_RECIPIENT_MUST_BE_ISSUER",

  // VALUE_QUANTITY_REDUCTION
  REDUCTION_ORIGINAL_REF_MISSING: "REDUCTION_ORIGINAL_REF_MISSING",
  REDUCTION_RECIPIENT_MISMATCH: "REDUCTION_RECIPIENT_MISMATCH",
  REDUCTION_ITEM_REF_MISSING: "REDUCTION_ITEM_REF_MISSING",
  REDUCTION_QUANTITY_EXCEEDS_ORIGINAL: "REDUCTION_QUANTITY_EXCEEDS_ORIGINAL",
  REDUCTION_VALUE_EXCEEDS_ORIGINAL: "REDUCTION_VALUE_EXCEEDS_ORIGINAL",

  // DELIVERY_REFUSAL_*
  REFUSAL_ORIGINAL_REF_MISSING: "REFUSAL_ORIGINAL_REF_MISSING",
  REFUSAL_RECIPIENT_MISMATCH: "REFUSAL_RECIPIENT_MISMATCH",
  REFUSAL_ITEMS_INCOMPLETE_FOR_TOTAL: "REFUSAL_ITEMS_INCOMPLETE_FOR_TOTAL",
  REFUSAL_PARTIAL_ITEM_REF_MISSING: "REFUSAL_PARTIAL_ITEM_REF_MISSING",
  REFUSAL_PARTIAL_QUANTITY_EXCEEDS_BALANCE:
    "REFUSAL_PARTIAL_QUANTITY_EXCEEDS_BALANCE",

  // RECIPIENT_NOT_FOUND
  RECIPIENT_NOT_FOUND_EVIDENCE_MISSING:
    "RECIPIENT_NOT_FOUND_EVIDENCE_MISSING",
} as const);

export type SinefErrorCode =
  (typeof SINIEF_ERROR_CODES)[keyof typeof SINIEF_ERROR_CODES];

/** Mensagem amigável em pt-BR (curta, sem detalhes técnicos sensíveis). */
export const SINIEF_ERROR_MESSAGES: Readonly<Record<SinefErrorCode, string>> =
  Object.freeze({
    OPERATION_TYPE_INVALID: "Cenário SINIEF 49/2025 inválido ou não suportado.",
    DIRECTION_INVALID: "Direção fiscal incompatível com o cenário.",
    FIN_NFE_INVALID: "finNFe divergente do exigido pelo cenário.",
    ISSUER_CNPJ_INVALID: "CNPJ do emitente inválido.",
    RECIPIENT_MISSING: "Destinatário obrigatório não informado.",
    RECIPIENT_CNPJ_INVALID: "CNPJ do destinatário inválido.",
    ITEMS_EMPTY: "Informe ao menos um item.",
    ITEM_QUANTITY_NON_POSITIVE: "Quantidade do item deve ser maior que zero.",
    ITEM_UNIT_VALUE_NON_POSITIVE:
      "Valor unitário do item deve ser maior que zero.",
    ITEM_SEQUENCE_NON_POSITIVE:
      "Sequência (nItem) deve ser um inteiro positivo.",
    ITEM_SEQUENCE_DUPLICATE: "Sequência de item duplicada.",
    ITEM_CFOP_INVALID_FOR_SCENARIO: "CFOP não permitido para este cenário.",
    SERVICE_ITEM_REJECTED:
      "Serviços (NFS-e) não pertencem aos cenários do Ajuste SINIEF 49/2025.",
    ACCESS_KEY_INVALID:
      "Chave de acesso inválida: são exigidos 44 dígitos numéricos.",
    TAX_SETUP_NOT_APPROVED:
      "Configuração tributária (UF/regime) não aprovada pela contabilidade. Emissão bloqueada.",
    NAT_OP_MISMATCH:
      "Natureza da operação (natOp) não confere com o cenário informado.",
    ICMS_STATE_REQUIRED_EXPLICIT:
      "Estado do ICMS deve ser declarado explicitamente (APPROVED_BY_ACCOUNTING ou BLOCKED_PENDING_ACCOUNTING).",

    ADVANCE_ORDER_MISSING: "Pedido de origem obrigatório para antecipação.",
    ADVANCE_DELIVERY_DATE_MISSING:
      "Data prevista de entrega obrigatória para antecipação.",
    ADVANCE_DELIVERY_DATE_INVALID:
      "Data prevista de entrega inválida (formato AAAA-MM-DD).",
    ADVANCE_ITEM_MUST_NOT_MOVE_STOCK:
      "Antecipação não movimenta estoque: remova lote/movimentação dos itens.",

    EFFECTIVE_REFERENCE_MISSING:
      "Informe ao menos uma NF-e de antecipação vinculada.",
    EFFECTIVE_REFERENCE_DUPLICATE:
      "Referência de antecipação duplicada.",
    EFFECTIVE_EXCEEDS_ADVANCE_BALANCE:
      "Valor efetivo excede o saldo remanescente das antecipações.",

    STOCK_LOSS_REASON_INVALID:
      "Categoria legal de perda inválida (use LOSS/PERISHMENT/DETERIORATION/THEFT/ROBBERY).",
    STOCK_LOSS_JUSTIFICATION_MISSING:
      "Justificativa da perda de estoque é obrigatória.",
    STOCK_LOSS_RECIPIENT_MUST_BE_ISSUER:
      "Na perda de estoque, o destinatário deve ser o próprio emitente.",

    REDUCTION_ORIGINAL_REF_MISSING:
      "Referência à NF-e original é obrigatória na redução de valores/quantidades.",
    REDUCTION_RECIPIENT_MISMATCH:
      "Destinatário deve ser o mesmo da NF-e original.",
    REDUCTION_ITEM_REF_MISSING:
      "Cada item de redução exige DFeReferenciado por item.",
    REDUCTION_QUANTITY_EXCEEDS_ORIGINAL:
      "Quantidade reduzida excede o saldo do item original.",
    REDUCTION_VALUE_EXCEEDS_ORIGINAL:
      "Valor reduzido excede o saldo do item original.",

    REFUSAL_ORIGINAL_REF_MISSING:
      "Referência à NF-e original é obrigatória na recusa.",
    REFUSAL_RECIPIENT_MISMATCH:
      "Destinatário deve ser o mesmo da NF-e original.",
    REFUSAL_ITEMS_INCOMPLETE_FOR_TOTAL:
      "Recusa total exige que todos os itens do original sejam devolvidos.",
    REFUSAL_PARTIAL_ITEM_REF_MISSING:
      "Cada item da recusa parcial exige DFeReferenciado por item.",
    REFUSAL_PARTIAL_QUANTITY_EXCEEDS_BALANCE:
      "Quantidade recusada excede o saldo remanescente do item.",

    RECIPIENT_NOT_FOUND_EVIDENCE_MISSING:
      "É obrigatório registrar ao menos uma tentativa/evidência de entrega.",
  });

export function issue(
  code: SinefErrorCode,
  path?: string,
): { code: SinefErrorCode; message: string; path?: string } {
  return path
    ? { code, message: SINIEF_ERROR_MESSAGES[code], path }
    : { code, message: SINIEF_ERROR_MESSAGES[code] };
}
