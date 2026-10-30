/** Release containment, not authorization. No runtime flag, role or local lock opens it. */
export const DELIVERY_OPERATION_BLOCK = "Operação de entrega indisponível: reserva, registro e movimentação de estoque ainda não têm um contrato integrado comprovado. Nenhuma alteração foi enviada. Consulta e reconciliação permanecem disponíveis.";
export const DELIVERY_CANCELLATION_BLOCK = "Cancelamento e estorno indisponíveis: a recomposição integral do estoque ainda não tem contrato comprovado para esta operação. Nenhuma alteração foi enviada.";
export const DELIVERY_FINANCE_BLOCK = "Alteração financeira indisponível: contrato financeiro e validação fiscal pendentes. Apenas consulta e reconciliação estão disponíveis; nenhuma cobrança foi enviada.";

export function requireDeliveryOperationContract(action: "delivery" | "cancel" | "finance" = "delivery"): void {
  throw new Error(action === "cancel" ? DELIVERY_CANCELLATION_BLOCK : action === "finance" ? DELIVERY_FINANCE_BLOCK : DELIVERY_OPERATION_BLOCK);
}