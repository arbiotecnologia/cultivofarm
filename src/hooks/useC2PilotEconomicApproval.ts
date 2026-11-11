import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";

/** Camada econômica isolada do piloto C2 (scripts/c2-pilot-economic-approval-20261111). Nunca altera o pedido. */
export const C2_PILOT_STATE_ENDPOINT = "c2_pilot_economic_state_v1";
export const C2_PILOT_APPROVE_ENDPOINT = "c2_pilot_economic_approve_v1";
export const C2_PILOT_STATE_KEY = "c2-pilot-economic-state";
export type C2PilotKind = "commercial" | "credit";

export interface C2PilotApproval { kind: C2PilotKind; approved_by: string; actor_role: string; approved_at: string; evidence_hash: string }
export interface C2PilotState {
  order_id: string; pilot_enabled: boolean;
  evidence: null | { evidence_hash: string; financed_total: number; method: string; due_basis: string; estimated: boolean;
    schedule: { installment_number: number; amount: number; due_date: string }[]; items: { id: string; quantidade: number; preco_unitario: number; subtotal: number }[] };
  evidence_block_reason: string | null;
  approvals: C2PilotApproval[];
  can_approve_commercial: boolean; can_approve_credit: boolean;
  forecast: null | { forecast_id: string; state: string; total_amount: number; due_dates_estimated: true; created_at: string };
}
export type C2PilotRead = { state: "ready"; pilot: C2PilotState } | { state: "unavailable" };

const n = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const HASH = /^[0-9a-f]{32}$/;

/** Interpretação estrita; divergência falha fechada (sem ações). */
export function parseC2PilotState(data: unknown, orderId: string): C2PilotState {
  const d = data as Record<string, any> | null;
  const bad = () => { throw new Error("c2_pilot_state_contract_invalid"); };
  if (!d || d.contract !== "C2_PILOT_ECON_STATE_V1" || d.order_id !== orderId || typeof d.pilot_enabled !== "boolean" ||
      !Array.isArray(d.approvals) || typeof d.can_approve_commercial !== "boolean" || typeof d.can_approve_credit !== "boolean" ||
      d.operational_blocked !== true || d.fiscal_blocked !== true || d.billing_blocked !== true || d.shipping_blocked !== true) bad();
  for (const a of d!.approvals) if (!a || !["commercial", "credit"].includes(a.kind) || typeof a.approved_by !== "string" || typeof a.approved_at !== "string") bad();
  const e = d!.evidence;
  if (e !== null && (!e || !HASH.test(e.evidence_hash) || !n(e.financed_total) || e.estimated !== true || !Array.isArray(e.schedule) || !Array.isArray(e.items))) bad();
  if ((d!.can_approve_commercial || d!.can_approve_credit) && (e === null || !d!.pilot_enabled)) bad();
  const f = d!.forecast;
  if (f !== null && (!f || typeof f.forecast_id !== "string" || !n(f.total_amount) || f.due_dates_estimated !== true)) bad();
  return d as unknown as C2PilotState;
}

export function useC2PilotEconomicState(orderId: string | null) {
  return useScopedPortalQuery<C2PilotRead>({
    queryKey: [C2_PILOT_STATE_KEY, orderId],
    enabled: !!orderId,
    queryFn: async (signal) => {
      const { data, error } = await (supabase.rpc as any)(C2_PILOT_STATE_ENDPOINT, { p_order: orderId }).abortSignal(signal);
      // Não instalado (PGRST202 exato) ou negado: painel não monta ações; nada é inferido.
      if (error) return { state: "unavailable" };
      return { state: "ready", pilot: parseC2PilotState(data, orderId as string) };
    },
  });
}

export interface C2PilotApproveArgs { orderId: string; kind: C2PilotKind; idempotencyKey: string; evidenceHash: string; notes?: string }

/** Uma chamada por clique, sem retry automático; a mesma chave só é reusada por repetição explícita. */
export function useC2PilotEconomicApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: C2PilotApproveArgs) => {
      const { data, error } = await (supabase as any).rpc(C2_PILOT_APPROVE_ENDPOINT, {
        p_order: a.orderId, p_kind: a.kind, p_idempotency_key: a.idempotencyKey,
        p_expected_evidence_hash: a.evidenceHash, p_notes: a.notes ?? null,
      });
      if (error) throw error;
      if (!data || data.contract !== "C2_PILOT_ECON_APPROVAL_V1" || data.kind !== a.kind || typeof data.approved_at !== "string")
        throw new Error("c2_pilot_ack_invalid");
      return data as { approval_id: string; kind: C2PilotKind; approved_by: string; approved_at: string; forecast_id: string | null; replayed: boolean };
    },
    retry: false,
    onSettled: (_d, _e, v) => { qc.invalidateQueries({ queryKey: [C2_PILOT_STATE_KEY, v.orderId] }); },
  });
}
