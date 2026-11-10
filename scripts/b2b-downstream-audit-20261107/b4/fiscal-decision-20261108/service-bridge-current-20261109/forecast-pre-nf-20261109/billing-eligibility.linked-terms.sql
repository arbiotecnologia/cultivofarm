CREATE OR REPLACE FUNCTION public.fn_b2b_order_billing_eligibility(p_partner_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_order record; v_terms record; v_quote int; v_noprice int; v_ap text; v_fin text;
BEGIN
  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_partner_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_NOT_FOUND'); END IF;

  IF v_order.status IN ('cancelado','reprovado','reprovado_sem_itens') THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_CANCELED_OR_REJECTED','status',v_order.status);
  END IF;
  IF v_order.status IN ('rascunho','pendente','solicitado','em_analise_comercial',
                        'aguardando_aprovacao_credito','aguardando_ajuste_comercial',
                        'aguardando_itens','aguardando_cotacao') THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_NOT_APPROVED','status',v_order.status);
  END IF;

  v_fin := COALESCE(v_order.financial_approval_status,'not_required');
  -- Approval of record lives in the exact linked child terms (id + order, approver
  -- and time). The frozen header is never rewritten; 'rejected' still blocks.
  IF v_fin = 'pending' AND v_order.payment_terms_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.partner_order_payment_terms t
        WHERE t.id = v_order.payment_terms_id AND t.partner_order_id = p_partner_order_id
          AND t.approval_status = 'approved' AND t.approved_by IS NOT NULL AND t.approved_at IS NOT NULL) THEN
    v_fin := 'approved';
  END IF;
  IF v_fin = 'pending' THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','FINANCIAL_APPROVAL_PENDING');
  END IF;
  IF v_fin = 'rejected' THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','FINANCIAL_APPROVAL_REJECTED');
  END IF;

  SELECT count(*) FILTER (WHERE COALESCE(pricing_mode_snapshot,'') = 'quote_only'),
         count(*) FILTER (WHERE COALESCE(preco_unitario_final_snapshot, preco_unitario, 0) <= 0)
    INTO v_quote, v_noprice
    FROM public.partner_order_items WHERE order_id = p_partner_order_id;
  IF COALESCE(v_quote,0) > 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','QUOTE_ONLY_ITEMS','count',v_quote);
  END IF;
  IF COALESCE(v_noprice,0) > 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ITEM_WITHOUT_FINAL_PRICE','count',v_noprice);
  END IF;

  -- H6C-001: condição canônica é a vinculada ao pedido; nunca "a mais recente".
  IF v_order.payment_terms_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.partner_order_payment_terms t
                WHERE t.partner_order_id = p_partner_order_id) THEN
      RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_NOT_LINKED');
    END IF;
    RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_NOT_DEFINED');
  END IF;

  SELECT * INTO v_terms FROM public.partner_order_payment_terms
   WHERE id = v_order.payment_terms_id AND partner_order_id = p_partner_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_INVALID',
                              'payment_terms_id', v_order.payment_terms_id);
  END IF;

  v_ap := COALESCE(v_terms.approval_status,'pending');
  IF NOT (v_ap = 'approved'
          OR (v_ap = 'not_required' AND v_fin = 'not_required'
              AND COALESCE(v_order.requires_financial_approval,false) = false)) THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_NOT_APPROVED',
                              'approval_status', v_ap, 'payment_terms_id', v_terms.id);
  END IF;

  IF COALESCE(v_terms.final_amount,0) <= 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','NO_FINAL_AMOUNT');
  END IF;

  RETURN jsonb_build_object('eligible',true,'reason_code','OK',
    'final_amount',v_terms.final_amount,'payment_terms_id',v_terms.id,
    'approval_status', v_ap, 'financial_approval_status', v_fin);
END
$function$
