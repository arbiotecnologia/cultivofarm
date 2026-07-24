/**
 * Fase SINIEF 3 — Adaptador puro entre o estado de formulário do painel
 * "Operações especiais — Ajuste SINIEF 49/2025" e os builders puros da Fase 2.
 *
 * Contrato:
 *   toScenarioInput(state) → SinefScenarioInput
 *   buildFromForm(state)   → ValidationResult (delegado ao builder)
 *
 * Nunca faz I/O, nunca persiste, nunca transmite. Não invoca Supabase.
 * Toda regra fiscal permanece nos builders da Fase 2 — este módulo apenas
 * remapeia o shape do formulário para o shape canônico do domínio.
 */
import { buildDraft } from "./builders";
import type {
  AdvancePaymentInput,
  DeliveryRefusalPartialInput,
  DeliveryRefusalTotalInput,
  DraftItemInput,
  EffectiveSaleInput,
  ItemReferenceInput,
  PartyRef,
  RecipientNotFoundInput,
  SinefOperationType,
  SinefScenarioInput,
  SinefSourceKind,
  StockLossInput,
  ValidationResult,
  ValueQuantityReductionInput,
} from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Estado do formulário (representação amigável, tolerante a strings vazias)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Opção de UI (6 opções, mapeadas para 7 cenários canônicos).
 * "DELIVERY_REFUSAL_TOTAL_OR_NOT_FOUND" desdobra em `RECIPIENT_NOT_FOUND`
 * quando `refusalSubReason === "RECIPIENT_NOT_FOUND"`, senão em
 * `DELIVERY_REFUSAL_TOTAL`.
 */
export type SinefUiOption =
  | "ADVANCE_PAYMENT"
  | "EFFECTIVE_SALE_AFTER_ADVANCE"
  | "STOCK_LOSS"
  | "VALUE_QUANTITY_REDUCTION"
  | "DELIVERY_REFUSAL_TOTAL_OR_NOT_FOUND"
  | "DELIVERY_REFUSAL_PARTIAL";

export interface SinefFormItem {
  sequence: number;
  sourceKind: SinefSourceKind;
  sourceId: string;
  description: string;
  quantity: number;
  unitValue: number;
  cfop: string;
  loteId?: string;
  itemReferences?: readonly ItemReferenceInput[];
}

export interface SinefFormRecipient {
  kind: "INTERNAL" | "EXTERNAL";
  id?: string;
  cnpj?: string;
  name?: string;
}

export interface SinefFormOriginalItem {
  sequence: number;
  originalQuantity: number;
  originalValue: number;
  remainingQuantity: number;
  remainingValue: number;
}

export interface SinefFormOriginal {
  originalAccessKey: string;
  originalInvoiceId?: string;
  originalRecipient: SinefFormRecipient;
  originalItems: readonly SinefFormOriginalItem[];
}

export interface SinefFormAdvanceRef {
  advanceAccessKey: string;
  advanceInvoiceId?: string;
  remainingValue: number;
}

export interface SinefFormStockLoss {
  legalReasonCategory: "LOSS" | "PERISHMENT" | "DETERIORATION" | "THEFT" | "ROBBERY";
  legalReasonDetails: string;
  loteId?: string;
  movimentacaoId?: string;
  occurredAt?: string;
}

export interface SinefFormDeliveryAttempt {
  attemptedAt: string;
  channel: string;
  proofReference: string;
}

export interface SinefFormState {
  uiOption: SinefUiOption;
  refusalSubReason?: "REFUSAL_TOTAL" | "RECIPIENT_NOT_FOUND";
  issuerCnpj: string;
  taxSetupApproved: boolean;
  taxSetupUf?: string;
  taxSetupRegime?: string;
  recipient?: SinefFormRecipient;
  items: readonly SinefFormItem[];
  // Especializações opcionais por cenário
  orderId?: string;
  expectedDeliveryDate?: string;
  advanceReferences?: readonly SinefFormAdvanceRef[];
  icmsApprovalState?: "APPROVED_BY_ACCOUNTING" | "BLOCKED_PENDING_ACCOUNTING";
  stockLossContext?: SinefFormStockLoss;
  original?: SinefFormOriginal;
  deliveryAttempts?: readonly SinefFormDeliveryAttempt[];
}

// ────────────────────────────────────────────────────────────────────────────
// Mapeamento
// ────────────────────────────────────────────────────────────────────────────

export function resolveOperationType(state: SinefFormState): SinefOperationType {
  if (state.uiOption === "DELIVERY_REFUSAL_TOTAL_OR_NOT_FOUND") {
    return state.refusalSubReason === "RECIPIENT_NOT_FOUND"
      ? "RECIPIENT_NOT_FOUND"
      : "DELIVERY_REFUSAL_TOTAL";
  }
  return state.uiOption as SinefOperationType;
}

function toPartyRef(r: SinefFormRecipient | undefined): PartyRef | undefined {
  if (!r) return undefined;
  if (r.kind === "INTERNAL") {
    return r.id ? { kind: "INTERNAL", id: r.id } : undefined;
  }
  return r.cnpj
    ? { kind: "EXTERNAL", cnpj: r.cnpj, name: r.name }
    : undefined;
}

function toItems(items: readonly SinefFormItem[]): readonly DraftItemInput[] {
  return items.map((it) => ({
    sequence: it.sequence,
    sourceKind: it.sourceKind,
    sourceId: it.sourceId,
    description: it.description,
    quantity: it.quantity,
    unitValue: it.unitValue,
    cfop: it.cfop,
    loteId: it.loteId,
    itemReferences: it.itemReferences,
  }));
}

function toOriginal(o: SinefFormOriginal | undefined) {
  if (!o) return undefined;
  const recipient = toPartyRef(o.originalRecipient);
  if (!recipient) return undefined;
  return {
    originalAccessKey: o.originalAccessKey,
    originalInvoiceId: o.originalInvoiceId,
    originalRecipient: recipient,
    originalItems: o.originalItems.map((i) => ({ ...i })),
  };
}

export function toScenarioInput(state: SinefFormState): SinefScenarioInput {
  const op = resolveOperationType(state);
  const base = {
    issuerCnpj: state.issuerCnpj,
    taxSetupApproval: {
      approved: state.taxSetupApproved === true,
      uf: state.taxSetupUf,
      taxRegime: state.taxSetupRegime,
    },
    items: toItems(state.items),
  };
  switch (op) {
    case "ADVANCE_PAYMENT": {
      const recipient = toPartyRef(state.recipient);
      const input: AdvancePaymentInput = {
        ...base,
        operationType: "ADVANCE_PAYMENT",
        recipient: recipient ?? ({ kind: "EXTERNAL", cnpj: "" } as PartyRef),
        orderId: state.orderId ?? "",
        expectedDeliveryDate: state.expectedDeliveryDate ?? "",
      };
      return input;
    }
    case "EFFECTIVE_SALE_AFTER_ADVANCE": {
      const recipient = toPartyRef(state.recipient);
      const input: EffectiveSaleInput = {
        ...base,
        operationType: "EFFECTIVE_SALE_AFTER_ADVANCE",
        recipient: recipient ?? ({ kind: "EXTERNAL", cnpj: "" } as PartyRef),
        advanceReferences: (state.advanceReferences ?? []).map((r) => ({ ...r })),
        icmsApprovalState:
          state.icmsApprovalState ?? ("BLOCKED_PENDING_ACCOUNTING" as const),
      };
      return input;
    }
    case "STOCK_LOSS": {
      const input: StockLossInput = {
        ...base,
        operationType: "STOCK_LOSS",
        stockLossContext: state.stockLossContext ?? {
          legalReasonCategory: "LOSS",
          legalReasonDetails: "",
        },
        icmsApprovalState:
          state.icmsApprovalState ?? ("BLOCKED_PENDING_ACCOUNTING" as const),
      };
      return input;
    }
    case "VALUE_QUANTITY_REDUCTION": {
      const original = toOriginal(state.original);
      const input: ValueQuantityReductionInput = {
        ...base,
        operationType: "VALUE_QUANTITY_REDUCTION",
        original:
          original ??
          ({
            originalAccessKey: state.original?.originalAccessKey ?? "",
            originalRecipient: { kind: "EXTERNAL", cnpj: "" },
            originalItems: [],
          } as ValueQuantityReductionInput["original"]),
      };
      return input;
    }
    case "DELIVERY_REFUSAL_TOTAL": {
      const original = toOriginal(state.original);
      const input: DeliveryRefusalTotalInput = {
        ...base,
        operationType: "DELIVERY_REFUSAL_TOTAL",
        original:
          original ??
          ({
            originalAccessKey: state.original?.originalAccessKey ?? "",
            originalRecipient: { kind: "EXTERNAL", cnpj: "" },
            originalItems: [],
          } as DeliveryRefusalTotalInput["original"]),
      };
      return input;
    }
    case "DELIVERY_REFUSAL_PARTIAL": {
      const original = toOriginal(state.original);
      const input: DeliveryRefusalPartialInput = {
        ...base,
        operationType: "DELIVERY_REFUSAL_PARTIAL",
        original:
          original ??
          ({
            originalAccessKey: state.original?.originalAccessKey ?? "",
            originalRecipient: { kind: "EXTERNAL", cnpj: "" },
            originalItems: [],
          } as DeliveryRefusalPartialInput["original"]),
      };
      return input;
    }
    case "RECIPIENT_NOT_FOUND": {
      const original = toOriginal(state.original);
      const input: RecipientNotFoundInput = {
        ...base,
        operationType: "RECIPIENT_NOT_FOUND",
        original:
          original ??
          ({
            originalAccessKey: state.original?.originalAccessKey ?? "",
            originalRecipient: { kind: "EXTERNAL", cnpj: "" },
            originalItems: [],
          } as RecipientNotFoundInput["original"]),
        deliveryAttempts: (state.deliveryAttempts ?? []).map((d) => ({ ...d })),
      };
      return input;
    }
    default: {
      const _exhaustive: never = op;
      throw new Error(`Cenário SINIEF não suportado: ${_exhaustive as string}`);
    }
  }
}

export function buildFromForm(state: SinefFormState): ValidationResult {
  const scenarioInput = toScenarioInput(state);
  return buildDraft(scenarioInput);
}

/**
 * Rótulos das 6 opções amigáveis exibidas na UI. As opções internas
 * `DELIVERY_REFUSAL_TOTAL` e `RECIPIENT_NOT_FOUND` compartilham a mesma opção.
 */
export const SINIEF_UI_OPTION_LABELS: Readonly<Record<SinefUiOption, string>> =
  Object.freeze({
    ADVANCE_PAYMENT: "Venda com pagamento antecipado e entrega futura",
    EFFECTIVE_SALE_AFTER_ADVANCE:
      "Venda/entrega efetiva referente a pagamento antecipado",
    STOCK_LOSS: "Baixa de estoque por perda, roubo, extravio ou deterioração",
    VALUE_QUANTITY_REDUCTION:
      "Redução de valor ou quantidade após impossibilidade de cancelamento",
    DELIVERY_REFUSAL_TOTAL_OR_NOT_FOUND:
      "Recusa total de mercadoria ou destinatário não localizado",
    DELIVERY_REFUSAL_PARTIAL: "Recusa parcial de mercadoria",
  });
