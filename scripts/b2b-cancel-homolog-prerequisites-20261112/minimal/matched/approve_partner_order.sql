CREATE OR REPLACE FUNCTION public.approve_partner_order(p_order_id uuid, p_approval_notes text DEFAULT NULL::text, p_estimated_delivery_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid; v_prev partner_order_status; v_partner_user uuid; v_numero text;
  v_final_status partner_order_status; v_final_ready boolean; v_block text;
  v_amount numeric(14,2); v_credit_ok timestamptz; v_credit jsonb; v_reason text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT partner_id, status, numero,
         ROUND(COALESCE(final_amount_with_interest, total, 0),2), credit_approved_at
    INTO v_pid, v_prev, v_numero, v_amount, v_credit_ok
    FROM public.partner_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF v_prev = 'aguardando_cotacao' THEN
    RAISE EXCEPTION 'quote_required: defina o preco da cotacao antes de aprovar';
  END IF;
  IF NOT public.fn_b2b_order_priceable(p_order_id) THEN
    RAISE EXCEPTION 'order_not_priceable_quote_required';
  END IF;

  IF v_prev IN ('aprovado','reprovado','cancelado') THEN
    RAISE EXCEPTION 'already_processed: pedido já está em status %', v_prev;
  END IF;

  IF v_prev = 'aguardando_aprovacao_credito' THEN
    RAISE EXCEPTION 'credit_pending: aprove o crédito antes da análise comercial';
  END IF;

  IF v_prev NOT IN ('em_analise_comercial','solicitado','rascunho') THEN
    RAISE EXCEPTION 'invalid_status_transition: %', v_prev;
  END IF;

  -- H4-001/H4-003: reavaliar credito na aprovacao, com lock por parceiro.
  PERFORM pg_advisory_xact_lock(hashtext('b2b_credit:' || v_pid::text));
  v_credit := public.fn_b2b_credit_exposure(v_pid, 0, NULL);
  v_reason := COALESCE(v_credit->>'reason_code','OK');

  IF v_credit_ok IS NULL THEN
    IF v_reason IN ('LIMIT_EXCEEDED_BLOCK','OVERDUE_BLOCK') THEN
      UPDATE public.partner_orders
         SET credit_block_reason = v_reason, updated_at = now()
       WHERE id = p_order_id;
      RAISE EXCEPTION 'credit_block_on_approval: %', v_reason;
    ELSIF v_reason = 'LIMIT_EXCEEDED_APPROVAL' THEN
      -- fail-closed: exige aprovacao financeira formal (approve_b2b_credit).
      UPDATE public.partner_orders
         SET credit_block_reason = v_reason, updated_at = now()
       WHERE id = p_order_id;
      RAISE EXCEPTION 'credit_approval_required: %', v_reason;
    END IF;
  END IF;

  UPDATE public.partner_orders
     SET status = 'aprovado', approved_by = v_uid, approved_at = now(),
         approval_notes = NULLIF(p_approval_notes,''),
         estimated_delivery_date = COALESCE(p_estimated_delivery_date, estimated_delivery_date),
         ready_for_production = true, updated_at = now()
   WHERE id = p_order_id AND status = v_prev;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_update: status do pedido mudou durante a aprovação';
  END IF;

  SELECT status, ready_for_production, credit_block_reason
    INTO v_final_status, v_final_ready, v_block
    FROM public.partner_orders WHERE id = p_order_id;

  IF v_final_status <> 'aprovado' OR v_final_ready IS NOT TRUE THEN
    RAISE EXCEPTION 'credit_block: %', COALESCE(v_block, 'aprovacao_credito_pendente');
  END IF;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'approved',
          jsonb_build_object('status', v_prev),
          jsonb_build_object('status','aprovado','approval_notes',p_approval_notes,
                             'estimated_delivery_date',p_estimated_delivery_date,
                             'credit_reason_code', v_reason));

  FOR v_partner_user IN SELECT user_id FROM public.partner_users WHERE partner_id = v_pid LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user, 'pedido_b2b_aprovado',
            'Pedido ' || v_numero || ' aprovado',
            'Seu pedido foi aprovado e seguirá para planejamento de produção.',
            '/portal-parceiro/pedidos');
  END LOOP;
END
$function$;
