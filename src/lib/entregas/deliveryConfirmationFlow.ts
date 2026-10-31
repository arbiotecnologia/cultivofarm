import type { Rpc } from "./deliveryOperationsFlow";
export const CONFIRM_CAPABILITY_RPC = "rpc_entrega_confirmacao_capability_v1";
export const CONFIRM_RPC = "rpc_entrega_confirmar_manual_v1";
export type ConfirmationScope = { actor: string; org: string; entrega: string };
type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Obj, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => k in v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(v);
export function confirmationTimestamp(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(v);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const zone = m[7];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
    hour <= 23 && minute <= 59 && second <= 59 && (zone === "Z" || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4)) <= 59)) && Number.isFinite(Date.parse(v));
}
export type ConfirmationRoots = { os: string; proof: string };
type Capability = Obj & { os_id: string; comprovante_id: string; updated_at: string; status: string };
export function confirmationCapability(data: unknown, scope: ConfirmationScope): Capability | null {
  if (!object(data) || !exact(data, ["capability", "available", "actor_id", "organization_id", "entrega_id", "os_id", "comprovante_id", "updated_at", "status"]) ||
    data.capability !== "delivery_confirmation_manual_v1" || data.available !== true || data.actor_id !== scope.actor ||
    data.organization_id !== scope.org || data.entrega_id !== scope.entrega || !confirmationTimestamp(data.updated_at) ||
    ![data.actor_id, data.organization_id, data.entrega_id, data.os_id, data.comprovante_id].every(uuid) ||
    !["separado", "em_rota", "entregue"].includes(String(data.status))) return null;
  return data as Capability;
}
export function confirmationAck(data: unknown, scope: ConfirmationScope, roots?: ConfirmationRoots): boolean {
  return object(data) && exact(data, ["success", "action", "replay", "actor_id", "organization_id", "entrega_id", "os_id", "comprovante_id", "status", "os_status", "finalizada", "updated_at"]) &&
    data.success === true && data.action === "confirm" && typeof data.replay === "boolean" && data.actor_id === scope.actor &&
    data.organization_id === scope.org && data.entrega_id === scope.entrega && data.status === "entregue" &&
    [data.actor_id, data.organization_id, data.entrega_id, data.os_id, data.comprovante_id].every(uuid) && confirmationTimestamp(data.updated_at) &&
    (!roots || (data.os_id === roots.os && data.comprovante_id === roots.proof)) &&
    ((data.finalizada === true && data.os_status === "finalizada") || (data.finalizada === false && data.os_status === "entregue"));
}
export type ConfirmationAttempt = { scope: ConfirmationScope; roots: ConfirmationRoots; args: Record<string, unknown> };
export async function dispatchConfirmation(rpc: Rpc, attempt: ConfirmationAttempt, current: () => boolean, dispatched: () => void): Promise<unknown> {
  const check = () => { if (!current()) throw new Error("Contexto alterado. Nenhuma nova confirmação foi enviada."); };
  check();
  const pre = await rpc(CONFIRM_CAPABILITY_RPC, { p_entrega: attempt.scope.entrega });
  check();
  const cap = !pre.error && confirmationCapability(pre.data, attempt.scope);
  if (!cap) throw new Error("Confirmação física indisponível para esta entrega.");
  if (!confirmationTimestamp(attempt.args.p_observed) || !uuid(attempt.roots.os) || !uuid(attempt.roots.proof) || cap.os_id !== attempt.roots.os || cap.comprovante_id !== attempt.roots.proof)
    throw new Error("OS ou comprovante alterado. Nenhuma nova confirmação foi enviada.");
  // A retained exact request may reconcile a committed result after status/updated_at changed.
  if (cap.status !== "entregue" && cap.updated_at !== attempt.args.p_observed) throw new Error("Entrega alterada. Consulte os dados antes de confirmar.");
  check(); dispatched();
  const res = await rpc(CONFIRM_RPC, attempt.args);
  check();
  if (res.error) throw new Error(res.error.message || "Não foi possível confirmar a entrega.");
  if (!confirmationAck(res.data, attempt.scope, attempt.roots) || Date.parse(String((res.data as Obj).updated_at)) < Date.parse(String(attempt.args.p_observed))) throw new Error("Resultado incerto. Consulte a entrega ou reconcilie a mesma tentativa.");
  return res.data;
}