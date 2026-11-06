import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SimulateResult } from "@/hooks/useSimulateB2BPaymentPlan";
import { describeSimulationFailure, simulationKey, type SimulationFailure } from "@/lib/b2bSimulationState";

/**
 * Simulação B2B (somente leitura) com estado atômico {key, seq, result|failure}.
 * - A chave inclui usuário/tenant/parceiro/plano/itens + escopo canônico (ready, papéis, época de authz).
 * - Cada disparo recebe seq própria e captura o fence do escopo; resposta só é adotada se seq, chave e fence
 *   ainda forem os atuais (A→B→A não aceita a resposta antiga de A).
 * - O resultado só é exposto quando a chave do estado == chave renderizada, então não há janela de render
 *   com valor de contexto anterior. Sem retry automático: só `retry()` manual.
 */
type Scope = { ready: boolean; scope: string; capture: () => () => boolean };
type Slot =
  | { key: string; seq: number; status: "pending"; fence: () => boolean }
  | { key: string; seq: number; status: "ok"; fence: () => boolean; result: SimulateResult }
  | { key: string; seq: number; status: "error"; fence: () => boolean; failure: SimulationFailure };

export interface FencedSimulationArgs {
  enabled: boolean;
  scope: Scope;
  userId: string | null | undefined;
  organizationId: string | null | undefined;
  partnerId: string | null | undefined;
  planId: string | null | undefined;
  items: ReadonlyArray<Record<string, unknown>>;
}

function validReply(r: unknown, partnerId: string, planId: string): r is SimulateResult {
  if (!r || typeof r !== "object") return false;
  const x = r as Partial<SimulateResult>;
  return x.partner_id === partnerId && x.payment_plan?.id === planId && !!x.amounts &&
    typeof x.amounts.final_amount === "number" && Number.isFinite(x.amounts.final_amount);
}

export function useFencedB2BSimulation(a: FencedSimulationArgs) {
  const base = simulationKey({ userId: a.userId, organizationId: a.organizationId, partnerId: a.partnerId, planId: a.planId, items: a.items });
  const key = a.enabled && base && a.scope.ready ? JSON.stringify([base, a.scope.scope]) : null;
  const keyRef = useRef(key);
  keyRef.current = key;
  const seqRef = useRef(0);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [tick, setTick] = useState(0);
  const scopeRef = useRef(a.scope);
  scopeRef.current = a.scope;
  const argsRef = useRef(a);
  argsRef.current = a;

  useEffect(() => {
    const seq = ++seqRef.current;            // qualquer mudança (inclusive para null) aposenta respostas em voo
    if (!key) { setSlot(null); return; }
    const { partnerId, planId, items } = argsRef.current;
    if (!partnerId || !planId) return;
    const fence = scopeRef.current.capture();
    setSlot({ key, seq, status: "pending", fence });
    const live = () => seqRef.current === seq && keyRef.current === key && fence();
    (async () => {
      let outcome: Slot;
      try {
        const { data, error } = await (supabase.rpc as any)("simulate_b2b_payment_plan_secure", {
          p_partner_id: partnerId, p_payment_plan_id: planId, p_items: items, p_first_due_date: null,
        });
        if (error) throw error;
        outcome = validReply(data, partnerId, planId)
          ? { key, seq, status: "ok", fence, result: data }
          : { key, seq, status: "error", fence, failure: describeSimulationFailure(key, { message: "invalid_simulation_reply" }) };
      } catch (err) {
        outcome = { key, seq, status: "error", fence, failure: describeSimulationFailure(key, err) };
      }
      if (!live()) return;
      setSlot((prev) => (prev && prev.seq === seq ? outcome : prev));
    })();
  }, [key, tick]);

  const current = slot && key && slot.key === key && slot.seq === seqRef.current ? slot : null;
  const take = useCallback((): SimulateResult | null => {
    const s = slot;
    if (!s || s.status !== "ok" || s.key !== keyRef.current || s.seq !== seqRef.current) return null;
    if (!scopeRef.current.ready || !s.fence()) return null;
    return s.result;
  }, [slot]);

  return {
    key,
    pending: !!key && (!current || current.status === "pending"),
    result: current?.status === "ok" && current.fence() ? current.result : null,
    failure: current?.status === "error" ? current.failure : null,
    retry: () => setTick((t) => t + 1),
    /** Revalida no momento do uso (submit): chave + seq + fence do escopo. */
    take,
  };
}
