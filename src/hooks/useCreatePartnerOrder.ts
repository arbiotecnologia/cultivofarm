import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CatalogItemTipo } from "./usePartnerCatalog";

export type UnidadePedido = "hectare" | "dose_100ml" | "litro" | "volume_comercial";

export interface CartItem {
  item_id: string;
  item_tipo: CatalogItemTipo;
  product_id: string | null;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  desconto_percentual: number;
  subtotal: number;
  unidade_pedido: UnidadePedido;
  /** Preço unitário cheio (sem desconto) — apenas para exibição no front-end. */
  preco_unitario_cheio?: number;
  /** Subtotal cheio (sem desconto) — apenas para exibição no front-end. */
  subtotal_cheio?: number;
  /** Volume comercial escolhido (quando aplicável) */
  volume_id?: string | null;
  volume_ml?: number | null;
  volume_rotulo?: string | null;
  /** Área-alvo informada pelo parceiro (referência interna; não persistida no backend) */
  area_ha?: number | null;
}

export interface CreateOrderInput {
  partner_id: string;
  observacoes?: string;
  requested_delivery_date?: string | null;
  items: CartItem[];
  payment_plan_id?: string | null;
  first_due_date?: string | null;
  installment_count?: number | null;
  /**
   * Assinatura da simulação autoritativa devolvida pelo servidor.
   * Sem ela (ou divergente), o backend recusa o pedido com `price_changed`.
   */
  expected_cart_hash?: string | null;
}

const mapUnidadeMedida = (u: UnidadePedido): string => {
  switch (u) {
    case "hectare": return "hectare";
    case "dose_100ml": return "dose";
    case "litro": return "litro";
    case "volume_comercial": return "unidade";
  }
};

export function useCreatePartnerOrder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      if (!input.items.length) throw new Error("Carrinho vazio");

      const payload = input.items.map((i) => ({
        item_id: i.item_id,
        item_tipo: i.item_tipo,
        quantidade: Number(i.quantidade),
        unidade_medida: mapUnidadeMedida(i.unidade_pedido),
        volume_ml: i.unidade_pedido === "volume_comercial" ? i.volume_ml ?? null : null,
      }));

      const { data, error } = await supabase.rpc(
        "create_partner_order_secure" as any,
        {
          p_partner_id: input.partner_id,
          p_observacoes: input.observacoes ?? null,
          p_items: payload,
          p_requested_delivery_date: input.requested_delivery_date ?? null,
          p_payment_plan_id: input.payment_plan_id ?? null,
          p_first_due_date: input.first_due_date ?? null,
          p_installment_count: input.installment_count ?? null,
          p_expected_cart_hash: input.expected_cart_hash ?? null,
        },
      );
      if (error) throw error;
      return data as { id: string; numero: string; total: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-orders"] });
      toast.success("Pedido enviado para análise comercial!");
    },
    onError: (err: any) => {
      const msg = err?.message ?? "";
      if (msg.includes("forbidden_partner")) toast.error("Você não tem permissão para este parceiro");
      else if (msg.includes("payment_plan_required") || msg.includes("payment_terms_not_defined")) toast.error("Este pedido não possui condição comercial definida.");
      else if (msg.includes("plan_inactive")) toast.error("Plano de pagamento inativo. Escolha outra condição.");
      else if (msg.includes("credit_blocked_overdue")) toast.error("Parceiro possui saldo vencido. Novos pedidos a prazo estão bloqueados até regularização.");
      else if (msg.includes("below_minimum_order_amount")) toast.error("O valor do pedido está abaixo do mínimo permitido para esta condição de pagamento.");
      else if (msg.includes("financial_approval_rejected")) toast.error("A condição financeira deste pedido foi reprovada. Solicite ajuste antes de faturar.");
      else if (msg.includes("financial_approval_pending")) toast.error("Este pedido exige aprovação financeira antes do faturamento.");
      else if (msg.includes("discount_exceeds_limit")) toast.error("Desconto acima do limite permitido para o seu perfil.");
      else if (msg.includes("PRICE_RULE_MISSING")) toast.error("Item sem preço definido para esta condição comercial. Solicite a configuração à AR Bio.");
      else if (msg.includes("QUOTE_REQUIRED") || msg.includes("quote_required")) toast.error("Esta condição é sob consulta — o pedido segue para cotação comercial.");
      else if (msg.includes("price_changed") || msg.includes("PRICE_CHANGED")) toast.error("Os preços foram atualizados desde a simulação. Revise o carrinho e confirme novamente.");
      else if (msg.includes("product_unavailable")) toast.error("Um dos itens não está disponível");
      else if (msg.includes("price_unavailable")) toast.error("Item sem preço configurado. Solicite à AR Bio.");

      else if (msg.includes("empty_cart")) toast.error("Carrinho vazio");
      else if (msg.includes("invalid_unidade_medida")) toast.error("Unidade de medida inválida para este item. Reabra o catálogo e selecione novamente.");
      else if (msg.includes("invalid_volume_ml")) toast.error("Volume comercial não informado para o item.");
      else if (msg.includes("invalid_qty")) toast.error("Quantidade inválida em um dos itens.");
      else toast.error(msg || "Erro ao criar pedido");
    },
  });
}
