CREATE OR REPLACE FUNCTION public.approve_b2b_credit(p_partner_order_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.partner_orders%ROWTYPE;
  v_final_status public.partner_order_status;
  v_final_reason text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')
          OR public.has_role(v_uid,'financeiro')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_order FROM public.partner_orders
   WHERE id = p_partner_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF v_order.status IN ('aprovado','reprovado','cancelado') THEN
    RAISE EXCEPTION 'already_processed: pedido já está em status %', v_order.status;
  END IF;

  IF v_order.status = 'em_analise_comercial' THEN
    RAISE EXCEPTION 'already_released: crédito já liberado, pedido em análise comercial';
  END IF;

  IF v_order.status <> 'aguardando_aprovacao_credito' THEN
    RAISE EXCEPTION 'invalid_status: %', v_order.status;
  END IF;

  -- H4-003: autoriza gravacao dos campos credit_approved_by/at nesta transacao.
  PERFORM set_config('arbio.b2b_credit_approval', 'on', true);

  UPDATE public.partner_orders SET
    status = 'em_analise_comercial',
    ready_for_production = false,
    approved_by = NULL,
    approved_at = NULL,
    credit_approved_by = COALESCE(credit_approved_by, v_uid),
    credit_approved_at = COALESCE(credit_approved_at, now()),
    credit_approval_notes = COALESCE(NULLIF(p_notes, ''), credit_approval_notes),
    credit_block_reason = NULL,
    updated_at = now()
  WHERE id = p_partner_order_id
    AND status = 'aguardando_aprovacao_credito';

  PERFORM set_config('arbio.b2b_credit_approval', 'off', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_update: status do pedido mudou durante a aprovação';
  END IF;

  SELECT status, credit_block_reason INTO v_final_status, v_final_reason
  FROM public.partner_orders WHERE id = p_partner_order_id;

  IF v_final_status <> 'em_analise_comercial' THEN
    RAISE EXCEPTION 'credit_release_failed: %', COALESCE(v_final_reason, 'status_nao_liberado');
  END IF;

  INSERT INTO public.partner_order_audit_logs(usuario_id, partner_id, order_id, acao, dados_anteriores, dados_novos)
  VALUES (v_uid, v_order.partner_id, p_partner_order_id, 'credito_aprovado',
          jsonb_build_object('status', v_order.status, 'reason', v_order.credit_block_reason),
          jsonb_build_object('status', v_final_status, 'approved_by', v_uid, 'notes', p_notes));

  RETURN jsonb_build_object('ok', true, 'order_id', p_partner_order_id, 'status', v_final_status);
END;
$function$;
