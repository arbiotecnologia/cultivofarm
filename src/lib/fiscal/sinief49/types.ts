/**
 * Fase SINIEF 2 — Tipos canônicos do domínio Ajuste SINIEF 49/2025.
 *
 * Fonte executável do schema: supabase/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql
 * Estes tipos refletem exatamente os enums da migration; não persistem nada
 * e não fazem I/O. Regenerar `types.ts` do Supabase é responsabilidade
 * externa — o domínio SINIEF opera acima dessa camada.
 */

export const SINIEF_OPERATION_TYPES = [
  "ADVANCE_PAYMENT",
  "EFFECTIVE_SALE_AFTER_ADVANCE",
  "STOCK_LOSS",
  "VALUE_QUANTITY_REDUCTION",
  "DELIVERY_REFUSAL_TOTAL",
  "DELIVERY_REFUSAL_PARTIAL",
  "RECIPIENT_NOT_FOUND",
] as const;
export type SinefOperationType = (typeof SINIEF_OPERATION_TYPES)[number];

export type FiscalDirection = "OUT" | "IN";
export type FinNFe = 1 | 2 | 3 | 4 | 5 | 6;
export type IcmsApprovalState =
  | "APPROVED_BY_ACCOUNTING"
  | "BLOCKED_PENDING_ACCOUNTING";

/** Fontes de item aceitas nesses cenários. SERVICE é rejeitada explicitamente. */
export type SinefSourceKind = "PRODUCT" | "MICROORGANISM" | "SERVICE";

export interface PartyInternalRef {
  kind: "INTERNAL";
  /** UUID de customers/companies internos. */
  id: string;
}
export interface PartyExternalRef {
  kind: "EXTERNAL";
  /** CNPJ 14 dígitos (numérico ou alfanumérico já validado externamente). */
  cnpj: string;
  name?: string;
}
export type PartyRef = PartyInternalRef | PartyExternalRef;

/** Referência a item de documento anterior (para recusa parcial e redução). */
export interface ItemReferenceInput {
  referenceType: "PARTIAL_REFUSAL_ITEM" | "REDUCTION_ITEM";
  /** Chave de acesso NF-e (44 dígitos) do documento original. */
  referencedAccessKey?: string;
  /** Ou id interno de item quando disponível. */
  referencedItemId?: string;
  /** Sequência (nItem) no documento original — inteiro positivo. */
  referencedItemSequence?: number;
  /** Quantidade retornada/reduzida — > 0. */
  referencedQuantity?: number;
  /** Valor retornado/reduzido — > 0. */
  referencedValue?: number;
}

export interface DraftItemInput {
  sequence: number;
  sourceKind: SinefSourceKind;
  /** UUID do produto ou microrganismo. MICROORGANISM não exige product_id. */
  sourceId: string;
  description: string;
  quantity: number;
  unitValue: number;
  cfop: string;
  /** Se informado, o cenário decide se o item pode/deve mover estoque. */
  loteId?: string;
  itemReferences?: readonly ItemReferenceInput[];
}

export interface DocumentReferenceInput {
  relationType:
    | "ADVANCE_PAYMENT_OF"
    | "EFFECTIVE_SALE_OF"
    | "REDUCTION_OF"
    | "TOTAL_REFUSAL_OF"
    | "PARTIAL_REFUSAL_OF"
    | "RECIPIENT_NOT_FOUND_OF";
  referencedAccessKey?: string;
  referencedInvoiceId?: string;
}

/** Aprovação explícita de UF/regime/tributação (H4-A). Sem default. */
export interface TaxSetupApproval {
  approved: boolean;
  uf?: string;
  taxRegime?: string;
  approvedBy?: string;
  approvedAt?: string;
}

/** Saldo remanescente de uma NF-e de antecipação. */
export interface AdvanceBalanceRef {
  advanceAccessKey: string;
  advanceInvoiceId?: string;
  remainingValue: number;
  remainingQuantityBySequence?: Readonly<Record<number, number>>;
}

/** Estoque original (por item) do documento a ser reduzido/recusado. */
export interface OriginalItemBalance {
  sequence: number;
  originalQuantity: number;
  originalValue: number;
  /** Quantidade ainda passível de recusa/redução. */
  remainingQuantity: number;
  remainingValue: number;
}

export interface OriginalInvoiceContext {
  originalAccessKey: string;
  originalInvoiceId?: string;
  originalRecipient: PartyRef;
  originalItems: readonly OriginalItemBalance[];
  /**
   * Ajuste SINIEF 20/2026 — snapshot IMUTÁVEL do grupo XML `<dest>` da NF-e
   * original. Se omitido, é derivado de `originalRecipient` (kind/cnpj/name).
   * Persistido em `fiscal_invoices.original_recipient_snapshot`.
   */
  originalRecipientSnapshot?: OriginalRecipientSnapshot;
}

/** Snapshot do grupo XML `<dest>` da NF-e original. Estritamente imutável. */
export interface OriginalRecipientSnapshot {
  kind: PartyRef["kind"];
  /** CNPJ/CPF em dígitos (ou alfanumérico já validado externamente). */
  cnpjCpf: string;
  name?: string;
  ie?: string;
  address?: Readonly<{
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
  }>;
  /** Instante UTC ISO-8601 da captura do snapshot. */
  capturedAt: string;
  /** Origem literal (ex.: 'xml.dest', 'manual', 'api.provider'). */
  source: string;
}

/**
 * Ajuste SINIEF 20/2026 — avaliação explícita de ICMS.
 * `amount` só pode existir quando `due === true` (senão validador rejeita).
 */
export interface IcmsEvaluation {
  due: boolean;
  amount?: number;
}

export interface StockLossContextInput {
  legalReasonCategory: "LOSS" | "PERISHMENT" | "DETERIORATION" | "THEFT" | "ROBBERY";
  legalReasonDetails: string;
  loteId?: string;
  movimentacaoId?: string;
  occurredAt?: string;
}

export interface DeliveryAttemptEvidence {
  attemptedAt: string;
  channel: string;
  proofReference: string;
}

// ————————————————————————————————————————————————————————————
// Inputs por cenário — discriminated union
// ————————————————————————————————————————————————————————————

interface BaseInput {
  issuerCnpj: string;
  taxSetupApproval: TaxSetupApproval;
  items: readonly DraftItemInput[];
  /** Ajuste SINIEF 20/2026 — declaração explícita da situação de ICMS. */
  icms?: IcmsEvaluation;
}

export interface AdvancePaymentInput extends BaseInput {
  operationType: "ADVANCE_PAYMENT";
  recipient: PartyRef;
  orderId: string;
  expectedDeliveryDate: string;
}

export interface EffectiveSaleInput extends BaseInput {
  operationType: "EFFECTIVE_SALE_AFTER_ADVANCE";
  recipient: PartyRef;
  advanceReferences: readonly AdvanceBalanceRef[];
  icmsApprovalState: IcmsApprovalState;
}

export interface StockLossInput extends BaseInput {
  operationType: "STOCK_LOSS";
  stockLossContext: StockLossContextInput;
  icmsApprovalState: IcmsApprovalState;
}

export interface ValueQuantityReductionInput extends BaseInput {
  operationType: "VALUE_QUANTITY_REDUCTION";
  original: OriginalInvoiceContext;
}

export interface DeliveryRefusalTotalInput extends BaseInput {
  operationType: "DELIVERY_REFUSAL_TOTAL";
  original: OriginalInvoiceContext;
}

export interface DeliveryRefusalPartialInput extends BaseInput {
  operationType: "DELIVERY_REFUSAL_PARTIAL";
  original: OriginalInvoiceContext;
}

export interface RecipientNotFoundInput extends BaseInput {
  operationType: "RECIPIENT_NOT_FOUND";
  original: OriginalInvoiceContext;
  deliveryAttempts: readonly DeliveryAttemptEvidence[];
}

export type SinefScenarioInput =
  | AdvancePaymentInput
  | EffectiveSaleInput
  | StockLossInput
  | ValueQuantityReductionInput
  | DeliveryRefusalTotalInput
  | DeliveryRefusalPartialInput
  | RecipientNotFoundInput;

// ————————————————————————————————————————————————————————————
// Output canônico
// ————————————————————————————————————————————————————————————

export interface CanonicalDraftItem {
  sequence: number;
  sourceKind: Exclude<SinefSourceKind, "SERVICE">;
  sourceId: string;
  description: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  cfop: string;
  loteId: string | null;
  itemReferences: readonly ItemReferenceInput[];
}

export interface LegalMetadata {
  basis: "Ajuste SINIEF 49/2025 consolidado";
  version: string;
  effectiveDate: "2026-08-03";
}

export interface CanonicalDraft {
  operationType: SinefOperationType;
  direction: FiscalDirection;
  finNFe: FinNFe;
  tpNFDebito: string | null;
  tpNFCredito: string | null;
  natureOperation: string;
  issuerCnpj: string;
  recipient: PartyRef;
  items: readonly CanonicalDraftItem[];
  documentReferences: readonly DocumentReferenceInput[];
  stockLossContext: StockLossContextInput | null;
  icmsApprovalState: IcmsApprovalState | null;
  taxAuthorityNotes: string | null;
  legal: LegalMetadata;
  idempotencyKey: string;
  /** Invariante Fase 2: sempre `false`. Nenhum caminho retorna `true`. */
  canTransmit: false;
}

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: readonly ValidationIssue[];
  draft: CanonicalDraft | null;
}
