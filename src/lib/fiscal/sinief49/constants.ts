/**
 * Fase SINIEF 2 — Constantes normativas do Ajuste SINIEF 49/2025
 * consolidado (Ajustes SINIEF 8/2026, 15/2026, 20/2026).
 * Vigência: 03/08/2026.
 */
import type { SinefOperationType, FinNFe } from "./types";

export const SINIEF_LEGAL_BASIS = "Ajuste SINIEF 49/2025 consolidado" as const;
export const SINIEF_LEGAL_EFFECTIVE_DATE = "2026-08-03" as const;
export const SINIEF_LEGAL_VERSION = "2026-08-03/consolidado";

/** Descrições exatas exigidas em natOp (natureza da operação). */
export const SINIEF_NAT_OP: Readonly<Record<SinefOperationType, string>> =
  Object.freeze({
    ADVANCE_PAYMENT: "Venda para entrega futura - Pagamento antecipado",
    EFFECTIVE_SALE_AFTER_ADVANCE:
      "Venda de mercadoria - Entrega efetiva referente a antecipação",
    STOCK_LOSS: "Baixa de Estoque",
    VALUE_QUANTITY_REDUCTION: "Redução de valores ou quantidades",
    DELIVERY_REFUSAL_TOTAL:
      "Devolução por recusa total do destinatário",
    DELIVERY_REFUSAL_PARTIAL:
      "Devolução por recusa parcial do destinatário",
    RECIPIENT_NOT_FOUND:
      "Devolução por destinatário não localizado",
  });

/** finNFe por cenário. */
export const SINIEF_FIN_NFE: Readonly<Record<SinefOperationType, FinNFe>> =
  Object.freeze({
    ADVANCE_PAYMENT: 6,
    EFFECTIVE_SALE_AFTER_ADVANCE: 1,
    STOCK_LOSS: 6,
    VALUE_QUANTITY_REDUCTION: 5,
    DELIVERY_REFUSAL_TOTAL: 5,
    DELIVERY_REFUSAL_PARTIAL: 5,
    RECIPIENT_NOT_FOUND: 5,
  });

/** tpNFDebito por cenário (null quando não se aplica). */
export const SINIEF_TP_NF_DEBITO: Readonly<
  Record<SinefOperationType, string | null>
> = Object.freeze({
  ADVANCE_PAYMENT: "06",
  EFFECTIVE_SALE_AFTER_ADVANCE: null,
  STOCK_LOSS: "07",
  VALUE_QUANTITY_REDUCTION: null,
  DELIVERY_REFUSAL_TOTAL: null,
  DELIVERY_REFUSAL_PARTIAL: null,
  RECIPIENT_NOT_FOUND: null,
});

/** tpNFCredito por cenário (null quando não se aplica). */
export const SINIEF_TP_NF_CREDITO: Readonly<
  Record<SinefOperationType, string | null>
> = Object.freeze({
  ADVANCE_PAYMENT: null,
  EFFECTIVE_SALE_AFTER_ADVANCE: null,
  STOCK_LOSS: null,
  VALUE_QUANTITY_REDUCTION: "04",
  DELIVERY_REFUSAL_TOTAL: "03",
  DELIVERY_REFUSAL_PARTIAL: "06",
  RECIPIENT_NOT_FOUND: "03",
});

/** Direção por cenário. */
export const SINIEF_DIRECTION: Readonly<
  Record<SinefOperationType, "OUT" | "IN">
> = Object.freeze({
  ADVANCE_PAYMENT: "OUT",
  EFFECTIVE_SALE_AFTER_ADVANCE: "OUT",
  STOCK_LOSS: "OUT",
  VALUE_QUANTITY_REDUCTION: "IN",
  DELIVERY_REFUSAL_TOTAL: "IN",
  DELIVERY_REFUSAL_PARTIAL: "IN",
  RECIPIENT_NOT_FOUND: "IN",
});

/** CFOPs permitidos para pagamento antecipado (dentro/fora do estado). */
export const CFOP_ADVANCE_PAYMENT = Object.freeze(["5922", "6922"] as const);
/** CFOP para baixa de estoque por perda. */
export const CFOP_STOCK_LOSS = Object.freeze(["5927"] as const);

/** Chave de acesso NF-e: exatamente 44 dígitos numéricos. */
export const ACCESS_KEY_REGEX = /^[0-9]{44}$/;

/** CNPJ (numérico ou alfanumérico já normalizado): 14 chars, [0-9A-Z]. */
export const CNPJ_REGEX = /^[0-9A-Z]{14}$/;

/** Precisão canônica. */
export const QUANTITY_DECIMALS = 6;
export const VALUE_DECIMALS = 2;
