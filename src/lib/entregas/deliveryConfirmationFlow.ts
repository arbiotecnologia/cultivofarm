import type { Rpc } from "./deliveryOperationsFlow";
export const CONFIRM_CAPABILITY_RPC = "rpc_entrega_confirmacao_capability_v1";
export const CONFIRM_RPC = "rpc_entrega_confirmar_manual_v1";
export type ConfirmationScope = { actor: string; org: string; entrega: string };
type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Obj, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => k in v);
export function confirmationCapability(data: unknown, scope: ConfirmationScope): Obj | null {
  if (!object(data) || !exact(data, ["capability", "available", "actor_id", "organization_id", "entrega_id", "updated_at", "status"]) ||
    data.capability !== "delivery_confirmation_manual_v1" || data.available !== true || data.actor_id !== scope.actor ||
    data.organization_id !== scope.org || data.entrega_id !== scope.entrega || typeof data.updated_at !== "string" ||
    !["separado", "em_rota", "entregue"].includes(String(data.status))) return null;
  return data;
}
export function confirmationAck(data: unknown, scope: ConfirmationScope): boolean {
  return object(data) && exact(data, ["success", "action", "replay", "actor_id", "organization_id", "entrega_id", "os_id", "comprovante_id", "status", "os_status", "finalizada", "updated_at"]) &&
    data.success === true && data.action === "confirm" && typeof data.replay === "boolean" && data.actor_id === scope.actor &&
    data.organization_id === scope.org && data.entrega_id === scope.entrega && data.status === "entregue" &&
    typeof data.os_id === "string" && typeof data.comprovante_id === "string" && typeof data.updated_at === "string" &&
    ((data.finalizada === true && data.os_status === "finalizada") || (data.finalizada === false && data.os_status === "entregue"));
}
export type ConfirmationAttempt = { scope: ConfirmationScope; args: Record<string, unknown> };
export async function dispatchConfirmation(rpc: Rpc, attempt: ConfirmationAttempt, current: () => boolean, dispatched: () => void): Promise<unknown> {
  const check = () => { if (!current()) throw new Error("Contexto alterado. Nenhuma nova confirmação foi enviada."); };
  check();
  const pre = await rpc(CONFIRM_CAPABILITY_RPC, { p_entrega: attempt.scope.entrega });
  check();
  const cap = !pre.error && confirmationCapability(pre.data, attempt.scope);
  if (!cap) throw new Error("Confirmação física indisponível para esta entrega.");
  // A retained exact request may reconcile a committed result after status/updated_at changed.
  if (cap.status !== "entregue" && cap.updated_at !== attempt.args.p_observed) throw new Error("Entrega alterada. Consulte os dados antes de confirmar.");
  check(); dispatched();
  const res = await rpc(CONFIRM_RPC, attempt.args);
  check();
  if (res.error) throw new Error(res.error.message || "Não foi possível confirmar a entrega.");
  if (!confirmationAck(res.data, attempt.scope)) throw new Error("Resultado incerto. Consulte a entrega ou reconcilie a mesma tentativa.");
  return res.data;
}