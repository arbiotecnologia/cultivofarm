import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { requirePaymentChoice, requirePaymentCapability, paymentChoicesEqual, type PaymentChoice } from '@/lib/comercial/paymentContract';
import { useAuth } from './useAuth';
import { useStorageAccessScope } from './useStorageAccessScope';

export interface SimulateInput {
  payment_choice?: PaymentChoice;
  partner_id: string;
  payment_plan_id: string;
  items: Array<{
    item_id: string;
    item_tipo: "produto" | "microrganismo";
    quantidade: number;
    unidade_medida: "hectare" | "litro" | "dose" | "unidade";
    volume_ml?: number | null;
  }>;
  first_due_date?: string | null;
}

export interface SimulateScheduleRow {
  installment_number: number;
  due_date: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
}

export type PricingMode = "discount_from_base" | "fixed_item_price" | "quote_only";

export interface SimulateLine {
  item_id: string;
  item_tipo: "produto" | "microrganismo";
  quantidade: number;
  unidade_medida: string;
  unit_price: number | null;
  subtotal: number | null;
  pricing_mode: PricingMode | null;
  price_source: string | null;
  reason_code: string | null;
  quote_required: boolean;
  nome?: string | null;
}

export interface SimulateResult {
  payment_choice?: PaymentChoice;
  /** Preview only; final fiscal dates are anchored to the authorized document's issue date. */
  schedule_anchor?: {
    kind: 'PROVISIONAL_ISSUE_DATE';
    date: string;
    calendar_version: string;
    fiscal_due_dates_final: false;
  };
  first_due_date?: string | null;
  partner_id: string;
  /** Modo de precificação autoritativo do plano selecionado. */
  pricing_mode: PricingMode;
  /** Quando true, o pedido segue como cotação (sem preço definitivo). */
  quote_required: boolean;
  /**
   * Assinatura canônica calculada no servidor (plano + linhas resolvidas + total).
   * É reenviada na criação do pedido: se o preço mudar no servidor, o pedido é recusado.
   */
  cart_hash?: string | null;
  /** false para técnico de parceiro — dados de crédito não são expostos. */
  financial_visible?: boolean;
  items?: SimulateLine[];
  payment_plan: {
    id: string;
    name: string;
    code: string;
    pricing_mode?: PricingMode;
    discount_percent: number;
    monthly_interest_percent: number;
    months_count: number;
    installment_count: number;
    requires_financial_approval: boolean;
    requires_credit_approval: boolean;
    requires_guarantee: boolean;
  };
  amounts: {
    table_amount: number;
    discount_amount: number;
    net_amount_after_discount: number;
    financial_interest_amount: number;
    final_amount: number;
  };
  schedule: SimulateScheduleRow[];
  warnings: string[];
}


export function useSimulateB2BPaymentPlan() {
  const { user, profile } = useAuth();
  const scope = useStorageAccessScope('partner-payment-simulation');
  return useMutation({
    mutationFn: async (input: SimulateInput): Promise<SimulateResult> => {
      const current = scope.capture();
      let choice: PaymentChoice | undefined;
      if (input.payment_choice) {
        choice = requirePaymentChoice(input.payment_choice);
        if (!current() || !user?.id || !profile?.organization_id) throw new Error('payment_contract_unavailable');
        const capability = await (supabase as any).rpc('partner_payment_condition_capability_v1', { p_partner_id: input.partner_id });
        if (capability.error || !current()) throw new Error('payment_contract_unavailable');
        requirePaymentCapability(capability.data, user.id, profile.organization_id, input.partner_id);
      }
      const { data, error } = await (supabase.rpc as any)("simulate_b2b_payment_plan_secure", {
        p_partner_id: input.partner_id,
        p_payment_plan_id: input.payment_plan_id,
        p_items: input.items,
        p_first_due_date: input.first_due_date ?? null,
        ...(choice ? { p_payment_choice: choice } : {}),
      });
      if (error) throw error;
      if (choice && (!current() || !paymentChoicesEqual(data?.payment_choice, choice) || data?.partner_id !== input.partner_id || data?.payment_plan?.id !== input.payment_plan_id
        || (data?.organization_id != null && data.organization_id !== profile?.organization_id)
        || (data?.actor_id != null && data.actor_id !== user?.id))) throw new Error('payment_simulation_ack_unconfirmed');
      return data as SimulateResult;
    },
  });
}
