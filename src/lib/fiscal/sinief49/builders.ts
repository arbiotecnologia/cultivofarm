/**
 * Fase SINIEF 2 — Validadores puros por cenário + builders canônicos.
 *
 * Contrato:
 *   buildDraft(input) → { ok, issues, draft }
 *   - Nunca lança; agrega múltiplos erros.
 *   - `draft` só é retornado quando `ok === true` (sem parcial).
 *   - Output profundamente imutável (Object.freeze recursivo).
 *   - `canTransmit` é literalmente `false` em qualquer caminho.
 *   - Nenhuma alíquota/CST/CSOSN/regime é inferida por default.
 */
import {
  ACCESS_KEY_REGEX,
  CFOP_ADVANCE_PAYMENT,
  CFOP_STOCK_LOSS,
  CNPJ_REGEX,
  SINIEF_DIRECTION,
  SINIEF_FIN_NFE,
  SINIEF_LEGAL_BASIS,
  SINIEF_LEGAL_EFFECTIVE_DATE,
  SINIEF_LEGAL_VERSION,
  SINIEF_NAT_OP,
  SINIEF_TP_NF_CREDITO,
  SINIEF_TP_NF_DEBITO,
  VALUE_DECIMALS,
} from "./constants";
import { SINIEF_ERROR_CODES as E, issue } from "./errors";
import { buildIdempotencyKey } from "./idempotency";
import type {
  AdvancePaymentInput,
  CanonicalDraft,
  CanonicalDraftItem,
  DeliveryRefusalPartialInput,
  DeliveryRefusalTotalInput,
  DocumentReferenceInput,
  DraftItemInput,
  EffectiveSaleInput,
  PartyRef,
  RecipientNotFoundInput,
  SinefScenarioInput,
  StockLossInput,
  ValidationIssue,
  ValidationResult,
  ValueQuantityReductionInput,
  OriginalInvoiceContext,
} from "./types";

// ————————————————————————— utilidades puras —————————————————————————

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
function isPositiveInt(n: unknown): boolean {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}
function isPositiveNumber(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}
function nonBlank(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}
function isIsoDate(s: unknown): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s));
}
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const k of Object.keys(obj as object)) {
    const v = (obj as Record<string, unknown>)[k];
    if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
  }
  return obj;
}
function partyEquals(a: PartyRef | undefined, b: PartyRef | undefined): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "INTERNAL" && b.kind === "INTERNAL") return a.id === b.id;
  if (a.kind === "EXTERNAL" && b.kind === "EXTERNAL") return a.cnpj === b.cnpj;
  return false;
}

// ————————————————————————— validações comuns —————————————————————————

function validateCommon(
  input: SinefScenarioInput,
  issues: ValidationIssue[],
  requireRecipient: boolean,
): void {
  if (!CNPJ_REGEX.test(input.issuerCnpj ?? "")) {
    issues.push(issue(E.ISSUER_CNPJ_INVALID, "issuerCnpj"));
  }
  if (!input.taxSetupApproval || input.taxSetupApproval.approved !== true) {
    issues.push(issue(E.TAX_SETUP_NOT_APPROVED, "taxSetupApproval"));
  }
  if (requireRecipient) {
    const r = (input as { recipient?: PartyRef }).recipient;
    if (!r) {
      issues.push(issue(E.RECIPIENT_MISSING, "recipient"));
    } else if (r.kind === "EXTERNAL" && !CNPJ_REGEX.test(r.cnpj)) {
      issues.push(issue(E.RECIPIENT_CNPJ_INVALID, "recipient.cnpj"));
    }
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    issues.push(issue(E.ITEMS_EMPTY, "items"));
    return;
  }
  const seenSeq = new Set<number>();
  input.items.forEach((it, idx) => {
    const p = `items[${idx}]`;
    if (it.sourceKind === "SERVICE") {
      issues.push(issue(E.SERVICE_ITEM_REJECTED, `${p}.sourceKind`));
    }
    if (!isPositiveInt(it.sequence)) {
      issues.push(issue(E.ITEM_SEQUENCE_NON_POSITIVE, `${p}.sequence`));
    } else if (seenSeq.has(it.sequence)) {
      issues.push(issue(E.ITEM_SEQUENCE_DUPLICATE, `${p}.sequence`));
    } else {
      seenSeq.add(it.sequence);
    }
    if (!isPositiveNumber(it.quantity)) {
      issues.push(issue(E.ITEM_QUANTITY_NON_POSITIVE, `${p}.quantity`));
    }
    if (!isPositiveNumber(it.unitValue)) {
      issues.push(issue(E.ITEM_UNIT_VALUE_NON_POSITIVE, `${p}.unitValue`));
    }
  });
}

function normalizeItems(items: readonly DraftItemInput[]): CanonicalDraftItem[] {
  return items
    .filter((it) => it.sourceKind !== "SERVICE")
    .map((it) => ({
      sequence: it.sequence,
      sourceKind: it.sourceKind as "PRODUCT" | "MICROORGANISM",
      sourceId: it.sourceId,
      description: it.description,
      quantity: it.quantity,
      unitValue: it.unitValue,
      totalValue: round(it.quantity * it.unitValue, VALUE_DECIMALS),
      cfop: it.cfop,
      loteId: it.loteId ?? null,
      itemReferences: Object.freeze(
        (it.itemReferences ?? []).map((r) => ({ ...r })),
      ),
    }));
}

function baseDraft(
  input: SinefScenarioInput,
  items: CanonicalDraftItem[],
  documentReferences: DocumentReferenceInput[],
  extras: {
    recipient: PartyRef;
    stockLossContext: CanonicalDraft["stockLossContext"];
    icmsApprovalState: CanonicalDraft["icmsApprovalState"];
    icms?: CanonicalDraft["icms"];
    originalRecipientSnapshot?: CanonicalDraft["originalRecipientSnapshot"];
    taxAuthorityNotes: string | null;
    origin: { source: string; sourceId: string };
  },
): CanonicalDraft {
  const op = input.operationType;
  const partial: Omit<CanonicalDraft, "idempotencyKey" | "canTransmit"> = {
    operationType: op,
    direction: SINIEF_DIRECTION[op],
    finNFe: SINIEF_FIN_NFE[op],
    tpNFDebito: SINIEF_TP_NF_DEBITO[op],
    tpNFCredito: SINIEF_TP_NF_CREDITO[op],
    natureOperation: SINIEF_NAT_OP[op],
    issuerCnpj: input.issuerCnpj,
    recipient: extras.recipient,
    items,
    documentReferences,
    stockLossContext: extras.stockLossContext,
    icmsApprovalState: extras.icmsApprovalState,
    icms: extras.icms ?? input.icms ?? null,
    originalRecipientSnapshot: extras.originalRecipientSnapshot ?? null,
    taxAuthorityNotes: extras.taxAuthorityNotes,
    legal: {
      basis: SINIEF_LEGAL_BASIS,
      version: SINIEF_LEGAL_VERSION,
      effectiveDate: SINIEF_LEGAL_EFFECTIVE_DATE,
    },
  };
  const idempotencyKey = buildIdempotencyKey(op, extras.origin, partial);
  const draft: CanonicalDraft = {
    ...partial,
    idempotencyKey,
    canTransmit: false,
  };
  return deepFreeze(draft);
}

function fail(issues: ValidationIssue[]): ValidationResult {
  return { ok: false, issues: Object.freeze(issues.slice()), draft: null };
}
function success(draft: CanonicalDraft): ValidationResult {
  return { ok: true, issues: Object.freeze([]), draft };
}

function requireOriginalContext(
  original: OriginalInvoiceContext | undefined,
  issues: ValidationIssue[],
  missingCode: (typeof E)[keyof typeof E],
): boolean {
  if (!original || !original.originalAccessKey) {
    issues.push(issue(missingCode, "original"));
    return false;
  }
  if (!ACCESS_KEY_REGEX.test(original.originalAccessKey)) {
    issues.push(issue(E.ACCESS_KEY_INVALID, "original.originalAccessKey"));
    return false;
  }
  return true;
}

// ————————————————————————— builders por cenário —————————————————————————

export function buildAdvancePaymentDraft(
  input: AdvancePaymentInput,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateCommon(input, issues, true);
  if (!nonBlank(input.orderId)) issues.push(issue(E.ADVANCE_ORDER_MISSING, "orderId"));
  if (!input.expectedDeliveryDate) {
    issues.push(issue(E.ADVANCE_DELIVERY_DATE_MISSING, "expectedDeliveryDate"));
  } else if (!isIsoDate(input.expectedDeliveryDate)) {
    issues.push(issue(E.ADVANCE_DELIVERY_DATE_INVALID, "expectedDeliveryDate"));
  }
  input.items.forEach((it, idx) => {
    if (!(CFOP_ADVANCE_PAYMENT as readonly string[]).includes(it.cfop)) {
      issues.push(
        issue(E.ITEM_CFOP_INVALID_FOR_SCENARIO, `items[${idx}].cfop`),
      );
    }
    if (it.loteId) {
      issues.push(
        issue(E.ADVANCE_ITEM_MUST_NOT_MOVE_STOCK, `items[${idx}].loteId`),
      );
    }
  });
  if (issues.length) return fail(issues);
  const draft = baseDraft(input, normalizeItems(input.items), [], {
    recipient: input.recipient,
    stockLossContext: null,
    icmsApprovalState: null,
    taxAuthorityNotes:
      `Pedido ${input.orderId} — entrega prevista ${input.expectedDeliveryDate}.`,
    origin: { source: "ORDER", sourceId: input.orderId },
  });
  return success(draft);
}

export function buildEffectiveSaleAfterAdvanceDraft(
  input: EffectiveSaleInput,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateCommon(input, issues, true);
  if (!input.icmsApprovalState) {
    issues.push(issue(E.ICMS_STATE_REQUIRED_EXPLICIT, "icmsApprovalState"));
  }
  const refs = input.advanceReferences ?? [];
  if (refs.length === 0) {
    issues.push(issue(E.EFFECTIVE_REFERENCE_MISSING, "advanceReferences"));
  }
  const seen = new Set<string>();
  refs.forEach((r, i) => {
    if (!ACCESS_KEY_REGEX.test(r.advanceAccessKey ?? "")) {
      issues.push(
        issue(E.ACCESS_KEY_INVALID, `advanceReferences[${i}].advanceAccessKey`),
      );
    }
    if (seen.has(r.advanceAccessKey)) {
      issues.push(
        issue(E.EFFECTIVE_REFERENCE_DUPLICATE, `advanceReferences[${i}]`),
      );
    } else {
      seen.add(r.advanceAccessKey);
    }
  });

  if (refs.length > 0) {
    const totalRemaining = refs.reduce((s, r) => s + (r.remainingValue ?? 0), 0);
    const totalNew = input.items.reduce(
      (s, it) =>
        isPositiveNumber(it.quantity) && isPositiveNumber(it.unitValue)
          ? s + round(it.quantity * it.unitValue, VALUE_DECIMALS)
          : s,
      0,
    );
    if (round(totalNew, VALUE_DECIMALS) > round(totalRemaining, VALUE_DECIMALS)) {
      issues.push(issue(E.EFFECTIVE_EXCEEDS_ADVANCE_BALANCE, "items"));
    }
  }

  if (issues.length) return fail(issues);
  const documentRefs: DocumentReferenceInput[] = refs.map((r) => ({
    relationType: "EFFECTIVE_SALE_OF",
    referencedAccessKey: r.advanceAccessKey,
    referencedInvoiceId: r.advanceInvoiceId,
  }));
  const draft = baseDraft(input, normalizeItems(input.items), documentRefs, {
    recipient: input.recipient,
    stockLossContext: null,
    icmsApprovalState: input.icmsApprovalState,
    taxAuthorityNotes: `Entrega efetiva referente a ${refs.length} antecipação(ões).`,
    origin: {
      source: "ADVANCE_SET",
      sourceId: refs.map((r) => r.advanceAccessKey).sort().join("|"),
    },
  });
  return success(draft);
}

export function buildStockLossDraft(input: StockLossInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  // Emitente=destinatário: construir recipient a partir do issuer.
  const syntheticRecipient: PartyRef = {
    kind: "EXTERNAL",
    cnpj: input.issuerCnpj,
    name: "Emitente (baixa de estoque)",
  };
  validateCommon(input, issues, false);
  if (!input.icmsApprovalState) {
    issues.push(issue(E.ICMS_STATE_REQUIRED_EXPLICIT, "icmsApprovalState"));
  }
  const ctx = input.stockLossContext;
  const validCats = ["LOSS", "PERISHMENT", "DETERIORATION", "THEFT", "ROBBERY"];
  if (!ctx || !validCats.includes(ctx.legalReasonCategory)) {
    issues.push(issue(E.STOCK_LOSS_REASON_INVALID, "stockLossContext.legalReasonCategory"));
  }
  if (!ctx || !nonBlank(ctx.legalReasonDetails)) {
    issues.push(
      issue(E.STOCK_LOSS_JUSTIFICATION_MISSING, "stockLossContext.legalReasonDetails"),
    );
  }
  input.items.forEach((it, idx) => {
    if (!(CFOP_STOCK_LOSS as readonly string[]).includes(it.cfop)) {
      issues.push(issue(E.ITEM_CFOP_INVALID_FOR_SCENARIO, `items[${idx}].cfop`));
    }
  });
  if (issues.length) return fail(issues);
  const draft = baseDraft(input, normalizeItems(input.items), [], {
    recipient: syntheticRecipient,
    stockLossContext: {
      legalReasonCategory: ctx!.legalReasonCategory,
      legalReasonDetails: ctx!.legalReasonDetails.trim(),
      loteId: ctx!.loteId,
      movimentacaoId: ctx!.movimentacaoId,
      occurredAt: ctx!.occurredAt,
    },
    icmsApprovalState: input.icmsApprovalState,
    taxAuthorityNotes: `Baixa de estoque: ${ctx!.legalReasonDetails.trim()}`,
    origin: {
      source: "STOCK_EVENT",
      sourceId: ctx!.movimentacaoId ?? ctx!.loteId ?? "manual",
    },
  });
  return success(draft);
}

function validateOriginalItems(
  original: OriginalInvoiceContext,
  items: readonly DraftItemInput[],
  scenario: "REDUCTION" | "REFUSAL_PARTIAL" | "REFUSAL_TOTAL",
  issues: ValidationIssue[],
): void {
  const bySeq = new Map(original.originalItems.map((o) => [o.sequence, o]));
  if (scenario === "REFUSAL_TOTAL") {
    // Todas as sequências originais devem estar presentes com quantidade == remaining.
    for (const orig of original.originalItems) {
      const found = items.find(
        (it) =>
          it.itemReferences?.[0]?.referencedItemSequence === orig.sequence ||
          it.sequence === orig.sequence,
      );
      if (!found) {
        issues.push(
          issue(E.REFUSAL_ITEMS_INCOMPLETE_FOR_TOTAL, `original.sequence=${orig.sequence}`),
        );
        continue;
      }
      if (round(found.quantity, 6) !== round(orig.remainingQuantity, 6)) {
        issues.push(
          issue(E.REFUSAL_ITEMS_INCOMPLETE_FOR_TOTAL, `items.sequence=${found.sequence}`),
        );
      }
    }
    return;
  }
  items.forEach((it, idx) => {
    const refs = it.itemReferences ?? [];
    if (refs.length === 0) {
      issues.push(
        issue(
          scenario === "REDUCTION"
            ? E.REDUCTION_ITEM_REF_MISSING
            : E.REFUSAL_PARTIAL_ITEM_REF_MISSING,
          `items[${idx}].itemReferences`,
        ),
      );
      return;
    }
    refs.forEach((r, ri) => {
      const seq = r.referencedItemSequence;
      if (!seq) return;
      const orig = bySeq.get(seq);
      if (!orig) return;
      const qty = r.referencedQuantity ?? it.quantity;
      const val = r.referencedValue ?? round(it.quantity * it.unitValue, VALUE_DECIMALS);
      if (qty > orig.remainingQuantity + 1e-9) {
        issues.push(
          issue(
            scenario === "REDUCTION"
              ? E.REDUCTION_QUANTITY_EXCEEDS_ORIGINAL
              : E.REFUSAL_PARTIAL_QUANTITY_EXCEEDS_BALANCE,
            `items[${idx}].itemReferences[${ri}].referencedQuantity`,
          ),
        );
      }
      if (
        scenario === "REDUCTION" &&
        val > orig.remainingValue + 1e-9
      ) {
        issues.push(
          issue(
            E.REDUCTION_VALUE_EXCEEDS_ORIGINAL,
            `items[${idx}].itemReferences[${ri}].referencedValue`,
          ),
        );
      }
    });
  });
}

export function buildValueQuantityReductionDraft(
  input: ValueQuantityReductionInput,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateCommon(input, issues, false);
  if (!requireOriginalContext(input.original, issues, E.REDUCTION_ORIGINAL_REF_MISSING)) {
    return fail(issues);
  }
  const recipient = input.original.originalRecipient;
  if (!recipient) {
    issues.push(issue(E.REDUCTION_RECIPIENT_MISMATCH, "original.originalRecipient"));
    return fail(issues);
  }
  validateOriginalItems(input.original, input.items, "REDUCTION", issues);
  if (issues.length) return fail(issues);
  const docRefs: DocumentReferenceInput[] = [
    {
      relationType: "REDUCTION_OF",
      referencedAccessKey: input.original.originalAccessKey,
      referencedInvoiceId: input.original.originalInvoiceId,
    },
  ];
  const draft = baseDraft(input, normalizeItems(input.items), docRefs, {
    recipient,
    stockLossContext: null,
    icmsApprovalState: null,
    taxAuthorityNotes: "Redução de valores/quantidades da NF-e original.",
    origin: { source: "INVOICE", sourceId: input.original.originalAccessKey },
  });
  return success(draft);
}

function buildRefusal(
  input: DeliveryRefusalTotalInput | DeliveryRefusalPartialInput,
  scenario: "REFUSAL_TOTAL" | "REFUSAL_PARTIAL",
): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateCommon(input, issues, false);
  if (!requireOriginalContext(input.original, issues, E.REFUSAL_ORIGINAL_REF_MISSING)) {
    return fail(issues);
  }
  const recipient = input.original.originalRecipient;
  if (!recipient) {
    issues.push(issue(E.REFUSAL_RECIPIENT_MISMATCH, "original.originalRecipient"));
    return fail(issues);
  }
  validateOriginalItems(input.original, input.items, scenario, issues);
  if (issues.length) return fail(issues);
  const relationType =
    scenario === "REFUSAL_TOTAL" ? "TOTAL_REFUSAL_OF" : "PARTIAL_REFUSAL_OF";
  const docRefs: DocumentReferenceInput[] = [
    {
      relationType,
      referencedAccessKey: input.original.originalAccessKey,
      referencedInvoiceId: input.original.originalInvoiceId,
    },
  ];
  const draft = baseDraft(input, normalizeItems(input.items), docRefs, {
    recipient,
    stockLossContext: null,
    icmsApprovalState: null,
    taxAuthorityNotes:
      scenario === "REFUSAL_TOTAL"
        ? "Devolução por recusa total do destinatário."
        : "Devolução por recusa parcial do destinatário.",
    origin: { source: "INVOICE", sourceId: input.original.originalAccessKey },
  });
  return success(draft);
}

export function buildDeliveryRefusalTotalDraft(
  input: DeliveryRefusalTotalInput,
): ValidationResult {
  return buildRefusal(input, "REFUSAL_TOTAL");
}

export function buildDeliveryRefusalPartialDraft(
  input: DeliveryRefusalPartialInput,
): ValidationResult {
  return buildRefusal(input, "REFUSAL_PARTIAL");
}

export function buildRecipientNotFoundDraft(
  input: RecipientNotFoundInput,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateCommon(input, issues, false);
  if (!requireOriginalContext(input.original, issues, E.REFUSAL_ORIGINAL_REF_MISSING)) {
    return fail(issues);
  }
  const recipient = input.original.originalRecipient;
  if (!recipient) {
    issues.push(issue(E.REFUSAL_RECIPIENT_MISMATCH, "original.originalRecipient"));
    return fail(issues);
  }
  validateOriginalItems(input.original, input.items, "REFUSAL_TOTAL", issues);
  const attempts = input.deliveryAttempts ?? [];
  if (
    attempts.length === 0 ||
    !attempts.some((a) => nonBlank(a.proofReference) && nonBlank(a.channel))
  ) {
    issues.push(
      issue(E.RECIPIENT_NOT_FOUND_EVIDENCE_MISSING, "deliveryAttempts"),
    );
  }
  if (issues.length) return fail(issues);
  const docRefs: DocumentReferenceInput[] = [
    {
      relationType: "RECIPIENT_NOT_FOUND_OF",
      referencedAccessKey: input.original.originalAccessKey,
      referencedInvoiceId: input.original.originalInvoiceId,
    },
  ];
  const draft = baseDraft(input, normalizeItems(input.items), docRefs, {
    recipient,
    stockLossContext: null,
    icmsApprovalState: null,
    taxAuthorityNotes: `Destinatário não localizado (${attempts.length} tentativa(s)).`,
    origin: { source: "INVOICE", sourceId: input.original.originalAccessKey },
  });
  return success(draft);
}

/** Dispatcher tipado. */
export function buildDraft(input: SinefScenarioInput): ValidationResult {
  switch (input.operationType) {
    case "ADVANCE_PAYMENT":
      return buildAdvancePaymentDraft(input);
    case "EFFECTIVE_SALE_AFTER_ADVANCE":
      return buildEffectiveSaleAfterAdvanceDraft(input);
    case "STOCK_LOSS":
      return buildStockLossDraft(input);
    case "VALUE_QUANTITY_REDUCTION":
      return buildValueQuantityReductionDraft(input);
    case "DELIVERY_REFUSAL_TOTAL":
      return buildDeliveryRefusalTotalDraft(input);
    case "DELIVERY_REFUSAL_PARTIAL":
      return buildDeliveryRefusalPartialDraft(input);
    case "RECIPIENT_NOT_FOUND":
      return buildRecipientNotFoundDraft(input);
    default: {
      const _exhaustive: never = input;
      void _exhaustive;
      return fail([issue(E.OPERATION_TYPE_INVALID, "operationType")]);
    }
  }
}
