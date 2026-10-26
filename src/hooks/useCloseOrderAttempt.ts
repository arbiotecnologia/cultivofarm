import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useStorageAccessScope } from "./useStorageAccessScope";
import { ATTEMPT_CLOSURE_RPC_ENABLED, parseAttemptClosure } from "@/lib/authz/attemptClosureContract";
import { beginOrderAttemptClose, finishOrderAttemptClose, orderAttemptSlot, readOrderAttempt } from "@/lib/authz/pendingOrderAttempt";
import { closeDurableOrder, journalCapability } from '@/lib/authz/orderJournal';

export type CloseAttemptResult =
  | { kind: "closed" }
  | { kind: "committed"; numero: string; orderId: string }
  | { kind: "in_progress" }
  | { kind: "unknown" }
  | { kind: "context_changed" }
  | { kind: "not_eligible" };

/**
 * Verifica/encerra, por clique explícito, a tentativa incerta do ator atual.
 * Nunca é chamado automaticamente. Fence (ator, empresa, papéis, época, montagem)
 * conferida ANTES e DEPOIS da RPC; resposta de contexto antigo não libera nada.
 * Encerrar uma chave SEM pedido não cancela pedido existente: se o envio anterior
 * virou pedido, o servidor responde `committed` com o número.
 */
export function useCloseOrderAttempt() {
  const scope = useStorageAccessScope("partner-order-closure");
  const { user, profile, roles = [] } = useAuth();
  const actor = useRef({ userId: user?.id, organizationId: profile?.organization_id, roles });
  actor.current = { userId: user?.id, organizationId: profile?.organization_id, roles };
  const [pending, setPending] = useState(false);
  const closing=useRef(false);

  const close = async (partnerId: string | null | undefined): Promise<CloseAttemptResult> => {
    if(closing.current)return {kind:'not_eligible'};
    closing.current=true;
    try {return await performClose(partnerId);} finally {closing.current=false;}
  };
  const performClose = async (partnerId: string | null | undefined): Promise<CloseAttemptResult> => {
    if (!ATTEMPT_CLOSURE_RPC_ENABLED || !scope.ready || !partnerId) return { kind: "not_eligible" };
    const slot = orderAttemptSlot(actor.current, partnerId);
    const durableFence=scope.capture();
    if (!slot) return {kind:'not_eligible'};
    try {
      if (await journalCapability(slot,partnerId,durableFence)) {
        setPending(true);
        const result=await closeDurableOrder(slot,partnerId,durableFence,
          key=>(supabase.rpc as any)('close_partner_order_attempt_v1',{p_partner_id:partnerId,p_idempotency_key:key}));
        if (!durableFence()) return {kind:'context_changed'};
        if (result.state==='committed' && result.order_id && result.numero) return {kind:'committed',orderId:result.order_id,numero:result.numero};
        return {kind:result.state==='closed'?'closed':'unknown'};
      }
    } catch { return {kind:durableFence()?'unknown':'context_changed'}; }
    finally {setPending(false);}
    const attempt = slot ? readOrderAttempt(slot) : null;
    if (!slot || !attempt || !beginOrderAttemptClose(slot, attempt.key)) return { kind: "not_eligible" };
    const key = attempt.key;
    const fence = scope.capture();
    const same = () => fence() && orderAttemptSlot(actor.current, partnerId) === slot;
    const unresolved = (r: CloseAttemptResult): CloseAttemptResult => { finishOrderAttemptClose(slot, key, { state: "unresolved" }); return r; };
    if (!same()) return unresolved({ kind: "context_changed" });
    setPending(true);
    try {
      let res: { data: unknown; error: unknown };
      try {
        res = await (supabase.rpc as any)("close_partner_order_attempt_v1", { p_partner_id: partnerId, p_idempotency_key: key });
      } catch {
        return unresolved(same() ? { kind: "unknown" } : { kind: "context_changed" });
      }
      // Resposta de outro ator/empresa/época/montagem: mantém o bloqueio (o servidor
      // é idempotente; nova verificação no contexto atual repete o resultado).
      if (!same()) return unresolved({ kind: "context_changed" });
      if (res.error) return unresolved({ kind: "unknown" });
      const parsed = parseAttemptClosure(res.data);
      if (parsed.state === "closed") { finishOrderAttemptClose(slot, key, { state: "closed" }); return { kind: "closed" }; }
      if (parsed.state === "committed") {
        finishOrderAttemptClose(slot, key, { state: "committed", numero: parsed.numero });
        return { kind: "committed", numero: parsed.numero, orderId: parsed.orderId };
      }
      return unresolved({ kind: parsed.state === "in_progress" ? "in_progress" : "unknown" });
    } finally {
      setPending(false);
    }
  };
  return { close, pending };
}
