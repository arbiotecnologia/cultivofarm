import { PAYMENT_METHOD_CONTRACT, sameChoice, type PaymentMethodChoice } from "@/hooks/useB2BPaymentMethodOptions";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supplierLabel } from "@/lib/comercial/supplierName";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStorageAccessScope } from "./useStorageAccessScope";
import type { CatalogItemTipo } from "./usePartnerCatalog";
import { orderAccountingState } from "@/lib/orderAccountingState";
import { useAuth } from "./useAuth";
import { markOrderAttemptCommitted, markOrderAttemptRejected, markOrderAttemptUnresolved, orderAttemptSlot, isConclusiveRejection, orderAttemptFingerprint } from "@/lib/authz/pendingOrderAttempt";
import { prepareDurableOrder, recoverOrderJournal, type Journal, type NextAttempt } from '@/lib/authz/orderJournal';
import { orderLineFor } from "@/lib/comercial/packagingOrder";

export type UnidadePedido = "hectare" | "dose_100ml" | "litro" | "volume_comercial" | "embalagem";

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
  /** Embalagem inteira (B2B_PARTNER_PACKAGING_ORDER_V1): só o id vai ao servidor; peso é só frete/exibição. */
  packaging_id?: string | null;
  peso_liquido_kg?: number | null;
  unidade_conteudo?: "kg" | "g" | "ml" | "l" | null;
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
   * Escolha (B2B_PAYMENT_CONDITION_V1): meio + versão + prazo aprovados pelo vendedor. Quando presente, o envio vai
   * pelo create com condição; parcelas/vencimento vêm do servidor (estimados, base emissão da NF).
   */
  payment_method?: PaymentMethodChoice | null;
  /**
   * Assinatura da simulação autoritativa devolvida pelo servidor.
   * Obrigatória: sem ela o backend recusa o pedido com `cart_hash_required`.
   */
  expected_cart_hash: string;
  /**
   * Chave de idempotência do checkout. Reenvios com a mesma chave e o mesmo
   * carrinho devolvem o pedido já criado; carrinho diferente é recusado.
   */
  idempotency_key: string;
  /** Slot volátil da tentativa (ator+empresa+papéis+parceiro), obtido de slotFor. */
  attempt_slot?: string | null;
  /** Volatile per-click expectation, never persisted or sent as authority. */
  journal_expected?: Journal;
  /** Option A: no server key yet; the reservation is made by prepareDurableOrder right before dispatch. */
  journal_next?: NextAttempt;
  current_payload?: () => boolean;
}


export type CreatedOrderAccountingState = "pending" | "validated" | "unknown" | "context_changed";

/**
 * Lê (sob RLS) o snapshot gravado pelo servidor do pedido recém-criado. Erro de leitura,
 * linha ausente ou contrato desconhecido => "unknown" (nunca "validated").
 */
export async function readCreatedOrderAccountingState(orderId: string | undefined, current: () => boolean): Promise<CreatedOrderAccountingState> {
  if (!orderId) return "unknown";
  try {
    const { data: row, error } = await (supabase as any)
      .from("partner_orders").select("id, c2_external_origin_snapshot").eq("id", orderId).maybeSingle();
    if (!current()) return "context_changed";
    if (error || !row || row.id !== orderId) return "unknown";
    const state = orderAccountingState(row);
    return state === "unknown" ? "unknown" : state;
  } catch {
    return current() ? "unknown" : "context_changed";
  }
}

export function useCreatePartnerOrder(supplierName?: string | null) {
  const qc = useQueryClient();
  const supplierRef = useRef(supplierName);
  supplierRef.current = supplierName;
  const scope = useStorageAccessScope("partner-order-mutation");
  const { user, profile, roles = [] } = useAuth();
  const slotFor = (partnerId: string | null | undefined) => scope.ready
    ? orderAttemptSlot({ userId: user?.id, organizationId: profile?.organization_id, roles }, partnerId) : null;

  const mutation = useMutation({
    onMutate: () => ({ current: scope.capture(), identity: scope.scope }),
    mutationFn: async (input: CreateOrderInput) => {
      // A reserva do envio (contagem em voo) é feita de forma SÍNCRONA pela
      // página antes de mutate(); aqui só liberamos/registramos o desfecho,
      // dentro do mutationFn para sobreviver à desmontagem da tela.
      const slot = input.attempt_slot ?? null;
      const notSent = (e: Error) => { if (slot) markOrderAttemptRejected(slot, input.idempotency_key); return e; };
      const current = scope.capture();
      if (!current()) throw notSent(new Error("Contexto indisponível."));
      if (!input.items.length) throw notSent(new Error("Carrinho vazio"));
      if (!input.expected_cart_hash) throw notSent(new Error("cart_hash_required"));
      if (!input.idempotency_key) throw new Error("idempotency_key_required");
      // O slot precisa corresponder ao ator/empresa/papéis/parceiro atuais.
      if (slot && slot !== slotFor(input.partner_id)) throw notSent(new Error("Contexto alterado."));
      // Montado ANTES de qualquer reserva/dispatch: linha inválida nunca reserva chave nem chega ao servidor.
      // Embalagem: só {item_id,item_tipo,packaging_id,quantidade}; líquidos no formato de sempre. Nunca preço.
      let payload: Record<string, unknown>[];
      try { payload = input.items.map(orderLineFor); } catch (e) { throw notSent(e as Error); }
      const journalSlot = slotFor(input.partner_id);
      if (!journalSlot) throw notSent(new Error('Contexto indisponível.'));
      const dispatchCurrent=()=>current() && (input.current_payload?.() ?? true);
      // Pre-dispatch settlement: releases EXACTLY this call's own local reservation
      // (one inflight count of this key) once; concurrent/terminal/uncertain state is kept.
      let ownReleased = false;
      const releaseOwn = () => { if (!ownReleased) { ownReleased = true; if (slot) markOrderAttemptRejected(slot, input.idempotency_key); } };
      let durable: Awaited<ReturnType<typeof prepareDurableOrder>>;
      try {
        durable = await prepareDurableOrder(journalSlot,input.partner_id,dispatchCurrent,orderAttemptFingerprint(input),input.journal_expected,input.journal_next);
        if (!dispatchCurrent()) throw new Error('Contexto ou carrinho alterado.');
      } catch (e) { releaseOwn(); throw e; }
      // Durable mode: the local legacy key is never dispatched; the server journal
      // owns the attempt, so the local reservation is released (no hang after success).
      if (durable) releaseOwn();
      // Capability confirmed: all writers use server key; never fall back after storage/RPC error.
      const dispatchKey = durable?.key ?? input.idempotency_key;


      let response: { data: unknown; error: { message?: string; code?: string } | null };
      try {
        response = input.payment_method ? await supabase.rpc(
        "create_partner_order_condition_secure" as any,
        {
          p_partner_id: input.partner_id,
          p_observacoes: input.observacoes ?? null,
          p_items: payload,
          p_requested_delivery_date: input.requested_delivery_date ?? null,
          p_payment_plan_id: input.payment_plan_id ?? null,
          p_expected_cart_hash: input.expected_cart_hash,
          p_idempotency_key: dispatchKey,
          p_payment_choice: {
            payment_method: input.payment_method.payment_method,
            payment_condition_version: input.payment_method.payment_condition_version,
            payment_deadline_days: input.payment_method.payment_deadline_days,
          },
        },
      ) as typeof response : await supabase.rpc(
        "create_partner_order_secure" as any,
        {
          p_partner_id: input.partner_id,
          p_observacoes: input.observacoes ?? null,
          p_items: payload,
          p_requested_delivery_date: input.requested_delivery_date ?? null,
          p_payment_plan_id: input.payment_plan_id ?? null,
          p_first_due_date: input.first_due_date ?? null,
          p_installment_count: input.installment_count ?? null,
          p_expected_cart_hash: input.expected_cart_hash,
          p_idempotency_key: dispatchKey,
        },
      ) as typeof response;
      } catch (e) {
        // Durable: own local reservation was already released (ownReleased); the
        // server journal owns the uncertainty. Never decrement another reservation.
        if (slot && !durable && !ownReleased) markOrderAttemptUnresolved(slot, input.idempotency_key);
        throw e;
      }
      const { data, error } = response;
      const created = data as { id: string; numero: string; total: number } | null;
      if (slot && !durable) {
        if (!error && created?.id) markOrderAttemptCommitted(slot, input.idempotency_key, { numero: created.numero ?? null });
        else if (isConclusiveRejection(error))
          markOrderAttemptRejected(slot, input.idempotency_key);
        else markOrderAttemptUnresolved(slot, input.idempotency_key);
      }
      if (!current()) throw new Error("Contexto alterado.");
      if (error) throw error;
      if (input.payment_method) {
        // ACK exato da escolha: pedido gravado sem o mesmo meio/versão/prazo nunca é tratado como sucesso.
        const d = data as { payment_condition_contract?: unknown; payment_choice?: PaymentMethodChoice; payment_condition?: { estimated?: unknown } } | null;
        if (!d || d.payment_condition_contract !== PAYMENT_METHOD_CONTRACT || !sameChoice(d.payment_choice, input.payment_method) || d.payment_condition?.estimated !== true)
          throw new Error("payment_method_ack_unconfirmed");
        // Uma verdade: mesmo hash simulado e soma das parcelas = total = final (centavos).
        const ack = data as { cart_hash?: unknown; total?: unknown; final_amount?: unknown; quote_required?: unknown; schedule?: unknown };
        const rows = Array.isArray(ack.schedule) ? (ack.schedule as Array<{ amount?: unknown }>) : null;
        const c = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : NaN);
        const sum = rows ? rows.reduce((a, r) => a + c(r?.amount), 0) : NaN;
        if (ack.cart_hash !== input.expected_cart_hash || !rows ||
            (ack.quote_required !== true && !(rows.length > 0 && sum === c(ack.total) && sum === c(ack.final_amount))))
          throw new Error("payment_method_ack_unconfirmed");
      }
      if (durable) {
        // A lost acknowledgment remains blocked; never retry create automatically.
        const acknowledged=await recoverOrderJournal(journalSlot,input.partner_id,current);
        if(acknowledged.state!=='committed' || acknowledged.order_id!==created?.id || acknowledged.key!==dispatchKey || acknowledged.generation!==durable.generation) throw new Error('journal_commit_ack_unconfirmed');
        if (!current()) throw new Error('Contexto alterado.');
      }
      return created as { id: string; numero: string; total: number };
    },

    onSuccess: async (data, _variables, context) => {
      if (!context?.current()) return;
      qc.invalidateQueries({ queryKey: ["partner-orders"] });
      // Canal próprio do parceiro (MeusPedidos usa a chave "commercial-own-orders",
      // distinta de "partner-orders"): invalida SOMENTE a entrada cuja identidade
      // (usuário, tenant, papéis, época) corresponde ao ator capturado no envio.
      // Sem invalidateAll, sem polling e sem reload; se o escopo mudou antes da
      // resposta, o fence acima já retornou e nada de outro ator é tocado.
      let mine: unknown[] | null = null;
      try { const parsed = JSON.parse(context?.identity ?? ""); if (Array.isArray(parsed)) mine = parsed; } catch { mine = null; }
      if (mine) {
        const [ready, userId, orgId, rolesKey, , epoch] = [mine[0], mine[1], mine[2], JSON.stringify(mine[3]), mine[4], mine[5]];
        qc.invalidateQueries({
          predicate: (q) => {
            if (q.queryKey[0] !== "commercial-own-orders") return false;
            try {
              const k = JSON.parse(String(q.queryKey[1]));
              return Array.isArray(k) && k[0] === ready && k[1] === userId && k[2] === orgId &&
                JSON.stringify(k[3]) === rolesKey && k[5] === epoch;
            } catch { return false; }
          },
        });
      }
      // O pedido já foi aceito pelo servidor: nunca reenviar nem tratar como falha.
      const state = await readCreatedOrderAccountingState(data?.id, context.current);
      if (!context?.current() || state === "context_changed") return;
      const numero = data?.numero ? ` ${data.numero}` : "";
      if (state === "pending") {
        toast.warning(`Pedido${numero} registrado. A contabilidade da empresa fornecedora ainda está pendente: aprovação, cobrança, nota fiscal e entrega ficam bloqueadas até a validação.`);
      } else if (state === "validated") {
        toast.success(`Pedido${numero} enviado para análise comercial!`);
      } else {
        toast.info(`Pedido${numero} registrado. Não foi possível confirmar agora a situação contábil; consulte o pedido antes de prosseguir. Não envie de novo.`);
      }
    },
    onError: (err: any, _variables, context) => {
      if (!context?.current()) return;
      const msg = err?.message ?? "";
      if (msg.includes("forbidden_partner")) toast.error("Você não tem permissão para este parceiro");
      else if (msg.includes("payment_plan_required") || msg.includes("payment_terms_not_defined")) toast.error("Este pedido não possui condição comercial definida.");
      else if (msg.includes("plan_inactive")) toast.error("Plano de pagamento inativo. Escolha outra condição.");
      else if (msg.includes("credit_blocked_overdue")) toast.error("Parceiro possui saldo vencido. Novos pedidos a prazo estão bloqueados até regularização.");
      else if (msg.includes("below_minimum_order_amount")) toast.error("O valor do pedido está abaixo do mínimo permitido para esta condição de pagamento.");
      else if (msg.includes("financial_approval_rejected")) toast.error("A condição financeira deste pedido foi reprovada. Solicite ajuste antes de faturar.");
      else if (msg.includes("financial_approval_pending")) toast.error("Este pedido exige aprovação financeira antes do faturamento.");
      else if (msg.includes("discount_exceeds_limit")) toast.error("Desconto acima do limite permitido para o seu perfil.");
      else if (msg.includes("PRICE_RULE_MISSING")) toast.error(`Item sem preço definido para esta condição comercial. Solicite a configuração à ${supplierLabel(supplierRef.current)}.`);
      else if (msg.includes("QUOTE_REQUIRED") || msg.includes("quote_required")) toast.error("Esta condição é sob consulta — o pedido segue para cotação comercial.");
      else if (msg.includes("price_changed") || msg.includes("PRICE_CHANGED")) toast.error("Os preços foram atualizados desde a simulação. Revise o carrinho e confirme novamente.");
      else if (msg.includes("cart_hash_required")) toast.error("Simulação de preços obrigatória. Refaça a simulação antes de enviar o pedido.");
      else if (msg.includes("idempotency_conflict")) toast.error("O carrinho mudou depois do envio. Refaça a simulação e confirme novamente.");
      else if (msg.includes("idempotency_key_required") || msg.includes("invalid_idempotency_key")) toast.error("Falha ao identificar o checkout. Recarregue a página e tente novamente.");
      else if (msg.includes("credit_limit_exceeded")) toast.error("Pedido excede o limite de crédito disponível do parceiro.");
      else if (msg.includes("CREDIT_SETTINGS_INCOMPLETE") || msg.includes("CREDIT_CALCULATION_INVALID"))
        toast.error("Condição financeira indisponível: o limite explícito ou o cálculo de crédito não está íntegro. O pedido não foi enviado.");
      else if (msg.includes("payment_condition_stale") || msg.includes("payment_condition_unavailable"))
        toast.error("A condição de pagamento foi alterada ou revogada. Escolha novamente; nenhum pedido foi enviado.");
      else if (msg.includes("C2_ACCOUNTING_PENDING")) toast.error("Contabilidade da empresa pendente: esta etapa está bloqueada até a validação.");
      else if (msg.includes("forbidden_financial_terms")) toast.error("Seu perfil técnico não tem acesso a condições financeiras.");

      else if (msg.includes("product_unavailable")) toast.error("Um dos itens não está disponível");
      else if (msg.includes("price_unavailable")) toast.error(`Item sem preço configurado. Solicite à ${supplierLabel(supplierRef.current)}.`);

      else if (msg.includes("empty_cart")) toast.error("Carrinho vazio");
      else if (msg.includes("invalid_unidade_medida")) toast.error("Unidade de medida inválida para este item. Reabra o catálogo e selecione novamente.");
      else if (msg.includes("invalid_volume_ml")) toast.error("Volume comercial não informado para o item.");
      else if (msg.includes("invalid_qty")) toast.error("Quantidade inválida em um dos itens.");
      else toast.error(msg || "Erro ao criar pedido");
    },
  });
  return Object.assign(mutation, { slotFor });
}
