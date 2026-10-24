/**
 * Estado contábil do pedido B2B, lido EXCLUSIVAMENTE do snapshot imutável gravado pelo servidor
 * (`partner_orders.c2_external_origin_snapshot`). Nunca derivado do cliente nem de flags locais.
 * Enquanto o contrato C2_ACCOUNTING_PENDING_V1 não estiver instalado a coluna não existe e o
 * pedido é tratado como "unknown" (nenhuma promessa e nenhuma liberação na interface).
 */
export const ACCOUNTING_PENDING_CONTRACT = "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1";
export const ACCOUNTING_VALIDATED_CONTRACT = "C2_EXTERNAL_ORDER_ORIGIN_V1";

export type OrderAccountingState = "pending" | "validated" | "unknown";

export function orderAccountingState(row: unknown): OrderAccountingState {
  if (!row || typeof row !== "object") return "unknown";
  const snap = (row as Record<string, unknown>).c2_external_origin_snapshot;
  if (!snap || typeof snap !== "object") return "unknown";
  const contract = (snap as Record<string, unknown>).contract;
  if (contract === ACCOUNTING_PENDING_CONTRACT && (snap as Record<string, unknown>).accounting_validated === false) {
    return "pending";
  }
  if (contract === ACCOUNTING_VALIDATED_CONTRACT) return "validated";
  return "unknown";
}

export function isAccountingPending(row: unknown): boolean {
  return orderAccountingState(row) === "pending";
}
