// Contrato C2_ORDER_ATTEMPT_CLOSURE_V1.
//
// Backend instalado pelo auditor (migration b2b_order_attempt_closure_guarded_20261026,
// pacote 5cdaf5d). Consumido SOMENTE por useCloseOrderAttempt, acionado por clique
// explícito do usuário — nunca automaticamente em timeout.
// Só `closed` válido (fechamento durável no servidor, sob o mesmo lock do create)
// permite abandonar a chave. `committed` só é conclusivo com order_id UUID e número;
// formato incompleto, ausência, erro, `in_progress` ou contrato desconhecido NÃO são
// conclusivos: o envio alterado continua bloqueado.

export const ATTEMPT_CLOSURE_RPC_ENABLED = true as const;
export const ATTEMPT_CLOSURE_CONTRACT = "C2_ORDER_ATTEMPT_CLOSURE_V1" as const;

export type AttemptClosureOutcome =
  | { state: "committed"; orderId: string; numero: string }
  | { state: "closed" }
  | { state: "in_progress" }
  | { state: "unknown" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAttemptClosure(data: unknown): AttemptClosureOutcome {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { state: "unknown" };
  const d = data as Record<string, unknown>;
  if (d.contract !== ATTEMPT_CLOSURE_CONTRACT) return { state: "unknown" };
  if (d.state === "closed") return { state: "closed" };
  if (d.state === "in_progress") return { state: "in_progress" };
  if (d.state === "committed") {
    const orderId = typeof d.order_id === "string" && UUID.test(d.order_id) ? d.order_id : null;
    const numero = typeof d.numero === "string" && d.numero.trim() ? d.numero.trim() : null;
    if (orderId && numero) return { state: "committed", orderId, numero };
  }
  return { state: "unknown" };
}
