import { confirmationTimestamp, type ConfirmationScope } from './deliveryConfirmationFlow';
import type { Rpc } from './deliveryOperationsFlow';
export const SEND_RPC = 'rpc_entrega_enviar_manual_v1';
export const SEND_CAP_RPC = 'rpc_entrega_envio_capability_v1';
export type SendAttempt = { scope: ConfirmationScope; os: string; observed: string; key: string };
export async function dispatchSend(rpc: Rpc, attempt: SendAttempt, current: () => boolean, sent: () => void) {
 const check = () => { if (!current()) throw new Error('Sessão alterada. Resultado não adotado.'); };
 check(); const pre = await rpc(SEND_CAP_RPC, { p_entrega: attempt.scope.entrega }); check();
 const cap = pre.data as Record<string, unknown> | null;
 if (pre.error || !cap || Object.keys(cap).sort().join() !== ['capability','available','actor_id','organization_id','entrega_id','os_id','status','updated_at'].sort().join() || cap.capability !== 'delivery_send_manual_v1' || cap.available !== true || cap.actor_id !== attempt.scope.actor || cap.organization_id !== attempt.scope.org || cap.entrega_id !== attempt.scope.entrega || cap.os_id !== attempt.os || !confirmationTimestamp(cap.updated_at) || !confirmationTimestamp(attempt.observed) || !['separado','em_rota'].includes(String(cap.status))) throw new Error('Envio manual indisponível. Nenhuma alteração foi enviada.');
 if (cap.status !== 'em_rota' && cap.updated_at !== attempt.observed) throw new Error('Entrega alterada. Revise antes de enviar.');
 check();sent();const result = await rpc(SEND_RPC, { p_entrega: attempt.scope.entrega, p_observed: attempt.observed, p_request_key: attempt.key });check();
 if (result.error) throw new Error(result.error.message || 'Envio não confirmado.');
 const ack = result.data as Record<string, unknown> | null;
 if (!ack || Object.keys(ack).sort().join() !== ['success','action','replay','actor_id','organization_id','entrega_id','os_id','status','updated_at'].sort().join() || ack.success !== true || ack.action !== 'send' || typeof ack.replay !== 'boolean' || ack.actor_id !== attempt.scope.actor || ack.organization_id !== attempt.scope.org || ack.entrega_id !== attempt.scope.entrega || ack.os_id !== attempt.os || ack.status !== 'em_rota' || !confirmationTimestamp(ack.updated_at)) throw new Error('Resultado incerto. Reconcilie o mesmo envio.');
 return ack;
}