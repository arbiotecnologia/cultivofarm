import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SimulateResult } from "@/hooks/useSimulateB2BPaymentPlan";
import { describeSimulationFailure, simulationKey, type SimulationFailure } from "@/lib/b2bSimulationState";
import { PAYMENT_METHOD_CONTRACT, sameChoice, type PaymentMethodChoice } from "@/hooks/useB2BPaymentMethodOptions";

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
  /**
   * B2B_PAYMENT_CONDITION_V1: quando `requireMethod`, a chave só existe com escolha feita e a simulação vai pelo
   * RPC com condição (mesma revalidação da versão no envio). Meio/versão/prazo entram na chave.
   */
  requireMethod?: boolean;
  method?: PaymentMethodChoice | null;
}

/**
 * Resposta com meio: o servidor gera a simulação a partir do mesmo corpo LIVE e devolve UMA verdade monetária —
 * amounts/final_amount/credit/cart_hash/schedule já incluem o meio (Price quando configurado). Datas são estimadas.
 */
export type MethodSimulateResult = SimulateResult & {
  payment_condition_contract: typeof PAYMENT_METHOD_CONTRACT; payment_choice: PaymentMethodChoice;
  payment_condition: { payment_method_name: string; installment_count: number; monthly_rate: number; deadline_days: number; due_basis: "nf_issue"; estimated: true };
  schedule_estimated: true; due_basis: "nf_issue"; installment_count: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validReply(r: unknown, partnerId: string, planId: string, method?: PaymentMethodChoice | null): r is SimulateResult {
  if (!r || typeof r !== "object") return false;
  const x = r as Partial<MethodSimulateResult>;
  const base = x.partner_id === partnerId && x.payment_plan?.id === planId && !!x.amounts &&
    typeof x.amounts.final_amount === "number" && Number.isFinite(x.amounts.final_amount);
  if (!base || !method) return base;
  const pm = x.payment_condition;
  if (x.payment_condition_contract !== PAYMENT_METHOD_CONTRACT || !sameChoice(x.payment_choice, method) || !pm || pm.estimated !== true ||
      x.schedule_estimated !== true || x.due_basis !== "nf_issue" || !Number.isInteger(pm.installment_count)) return false;
  if (x.quote_required) return Array.isArray(x.schedule) && x.schedule.length === 0;
  const sched = x.schedule as Array<{ amount?: unknown; due_date?: unknown }> | undefined;
  if (!Array.isArray(sched) || sched.length !== pm.installment_count || x.installment_count !== pm.installment_count) return false;
  if (!sched.every((s) => !!s && typeof s.amount === "number" && Number.isFinite(s.amount) && typeof s.due_date === "string" && DATE.test(s.due_date))) return false;
  // Uma verdade: soma das parcelas (centavos) = final_amount = amounts.final_amount.
  const cents = sched.reduce((acc, s) => acc + Math.round((s.amount as number) * 100), 0);
  return cents === Math.round(x.amounts!.final_amount * 100) && Math.round(Number((x as { final_amount?: unknown }).final_amount) * 100) === cents;
}

export function useFencedB2BSimulation(a: FencedSimulationArgs) {
  const base = simulationKey({ userId: a.userId, organizationId: a.organizationId, partnerId: a.partnerId, planId: a.planId, items: a.items });
  const methodPart = a.requireMethod ? (a.method ? [a.method.payment_method, a.method.payment_condition_version, a.method.payment_deadline_days] : null) : [];
  const key = a.enabled && base && a.scope.ready && methodPart ? JSON.stringify([base, a.scope.scope, ...(methodPart.length ? [methodPart] : [])]) : null;
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
    const { partnerId, planId, items, method, requireMethod } = argsRef.current;
    if (!partnerId || !planId || (requireMethod && !method)) return;
    const fence = scopeRef.current.capture();
    setSlot({ key, seq, status: "pending", fence });
    const live = () => seqRef.current === seq && keyRef.current === key && fence();
    (async () => {
      let outcome: Slot;
      try {
        const { data, error } = requireMethod && method
          ? await (supabase.rpc as any)("simulate_b2b_payment_condition_secure", {
              p_partner_id: partnerId, p_payment_plan_id: planId, p_items: items,
              p_payment_choice: { payment_method: method.payment_method, payment_condition_version: method.payment_condition_version,
                payment_deadline_days: method.payment_deadline_days },
            })
          : await (supabase.rpc as any)("simulate_b2b_payment_plan_secure", {
              p_partner_id: partnerId, p_payment_plan_id: planId, p_items: items, p_first_due_date: null,
            });
        if (error) throw error;
        outcome = validReply(data, partnerId, planId, requireMethod ? method : null)
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
