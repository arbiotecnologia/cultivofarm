/**
 * Fase SINIEF 2 — Labels pt-BR do domínio SINIEF 49/2025.
 *
 * Este módulo local convive com src/lib/fiscal/labels/index.ts (mais amplo)
 * e é a fonte de verdade para rótulos dos novos cenários. Nenhum componente
 * deve concatenar strings dessas categorias fora daqui.
 */
import type { SinefOperationType, FinNFe } from "./types";

export const SINIEF_OPERATION_LABELS: Readonly<
  Record<SinefOperationType, string>
> = Object.freeze({
  ADVANCE_PAYMENT: "Venda para entrega futura (antecipação)",
  EFFECTIVE_SALE_AFTER_ADVANCE:
    "Venda efetiva referente a antecipação",
  STOCK_LOSS: "Baixa de estoque (perda/extravio/perecimento)",
  VALUE_QUANTITY_REDUCTION: "Redução de valores ou quantidades",
  DELIVERY_REFUSAL_TOTAL: "Devolução por recusa total",
  DELIVERY_REFUSAL_PARTIAL: "Devolução por recusa parcial",
  RECIPIENT_NOT_FOUND: "Devolução por destinatário não localizado",
});

export const FIN_NFE_LABELS: Readonly<Record<FinNFe, string>> = Object.freeze({
  1: "Normal",
  2: "Complementar",
  3: "Ajuste",
  4: "Devolução",
  5: "Nota de crédito",
  6: "Nota de débito",
});

export const STOCK_LOSS_REASON_LABELS = Object.freeze({
  LOSS: "Extravio",
  PERISHMENT: "Perecimento",
  DETERIORATION: "Deterioração",
  THEFT: "Furto",
  ROBBERY: "Roubo",
} as const);

export const ICMS_APPROVAL_LABELS = Object.freeze({
  APPROVED_BY_ACCOUNTING: "Aprovado pela contabilidade",
  BLOCKED_PENDING_ACCOUNTING: "Bloqueado — aguardando contabilidade",
} as const);

export function labelSinefOperation(op: SinefOperationType | string): string {
  return (
    SINIEF_OPERATION_LABELS[op as SinefOperationType] ??
    `Não mapeado (${op})`
  );
}
