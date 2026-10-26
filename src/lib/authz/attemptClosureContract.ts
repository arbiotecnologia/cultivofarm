// Contrato C2_ORDER_ATTEMPT_CLOSURE_V1 — preparado e DESATIVADO.
//
// A RPC `close_partner_order_attempt_v1` existe somente no pacote inativo
// scripts/owner-orders-20261023/attempt-closure-20261026/ e NÃO está instalada.
// Nenhum componente importa este módulo; com a flag false, nada chama a RPC.
// Só `closed` (fechamento durável no servidor, sob o mesmo lock do create)
// permite abandonar a chave. Ausência, erro, timeout ou formato desconhecido
// permanecem `unknown`: o envio alterado continua bloqueado.

export const ATTEMPT_CLOSURE_RPC_ENABLED = false as const;

export type AttemptClosureOutcome =
  | { state: "committed"; orderId: string | null; numero: string | null }
  | { state: "closed" }
  | { state: "unknown" };

export function parseAttemptClosure(data: unknown): AttemptClosureOutcome {
  if (!data || typeof data !== "object") return { state: "unknown" };
  const d = data as Record<string, unknown>;
  if (d.contract !== "C2_ORDER_ATTEMPT_CLOSURE_V1") return { state: "unknown" };
  if (d.state === "closed") return { state: "closed" };
  if (d.state === "committed") {
    return {
      state: "committed",
      orderId: typeof d.order_id === "string" ? d.order_id : null,
      numero: typeof d.numero === "string" ? d.numero : null,
    };
  }
  return { state: "unknown" }; // inclui in_progress
}
