/**
 * Motor Comercial B2B — Fase 1 (Integração Autoritativa)
 *
 * Resposta de cotação de pedidos "sob consulta" (`aguardando_cotacao`).
 * O preço é gravado exclusivamente pela RPC `respond_b2b_order_quote_secure`,
 * que recalcula totais, condição de pagamento e cronograma no servidor.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface QuoteLineInput {
  item_id: string;
  unit_price: number;
}

export interface RespondQuoteInput {
  order_id: string;
  lines: QuoteLineInput[];
  first_due_date?: string | null;
  installment_count?: number | null;
  motivo?: string | null;
}

export interface RespondQuoteResult {
  id: string;
  numero: string;
  status: string;
  credit_block_reason: string | null;
  table_amount: number;
  net_amount_after_discount: number;
  financial_interest_amount: number;
  final_amount: number;
  installment_count: number;
  first_due_date: string;
  payment_terms_id: string;
  requires_financial_approval: boolean;
  financial_approval_status: string;
}

export function mapQuoteError(message: string): string {
  const msg = message ?? "";
  if (msg.includes("forbidden_quote_response")) return "Apenas Administrador ou Gestor Comercial podem responder cotações.";
  if (msg.includes("order_not_in_quote_state")) return "Este pedido não está mais aguardando cotação.";
  if (msg.includes("quote_incomplete")) return "Informe o preço de todos os itens do pedido.";
  if (msg.includes("invalid_quote_price")) return "Preço unitário inválido — use valores maiores que zero.";
  if (msg.includes("quote_item_not_found")) return "Item não pertence a este pedido.";
  if (msg.includes("below_minimum_order_amount")) return "Valor abaixo do mínimo exigido pela condição de pagamento.";
  if (msg.includes("invalid_installment_count")) return "Número de parcelas inválido.";
  if (msg.includes("invalid_due_date")) return "Data do primeiro vencimento inválida.";
  if (msg.includes("CREDIT_SETTINGS_INCOMPLETE") || msg.includes("CREDIT_CALCULATION_INVALID")) return "Condição financeira indisponível: configure um limite explícito e um cálculo de crédito íntegro.";
  if (msg.includes("payment_condition_stale") || msg.includes("payment_condition_unavailable")) return "A condição escolhida foi alterada ou revogada. A cotação não foi registrada.";
  if (msg.includes("quote_idempotency_conflict")) return "Esta cotação já foi respondida com outros dados. Nenhuma alteração foi feita.";
  if (msg.includes("b2b_payment_condition_rolled_back")) return "A resposta por condição de pagamento está temporariamente indisponível.";
  if (msg.includes("plan_inactive")) return "A condição de pagamento do pedido está inativa.";
  if (msg.includes("payment_plan_required")) return "O pedido não possui condição de pagamento definida.";
  if (msg.includes("empty_cart")) return "O pedido não possui itens.";
  if (msg.includes("auth_required")) return "Sessão expirada — entre novamente.";
  return "Não foi possível registrar a cotação.";
}

export function useRespondB2BQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RespondQuoteInput): Promise<RespondQuoteResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("respond_b2b_order_quote_secure", {
        p_order_id: input.order_id,
        p_lines: input.lines,
        p_first_due_date: input.first_due_date ?? null,
        p_installment_count: input.installment_count ?? null,
        p_motivo: input.motivo ?? null,
      });
      if (error) throw new Error(mapQuoteError(error.message));
      return data as RespondQuoteResult;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["partner-orders-admin"] });
      qc.invalidateQueries({ queryKey: ["partner-order-items", vars.order_id] });
      qc.invalidateQueries({ queryKey: ["partner-order-payment-terms", vars.order_id] });
    },
  });
}
