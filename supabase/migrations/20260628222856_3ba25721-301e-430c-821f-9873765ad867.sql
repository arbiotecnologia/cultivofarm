CREATE OR REPLACE FUNCTION public.tg_partner_orders_credit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_after numeric(14,2);
  v_should_check boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('rascunho') THEN v_should_check := true; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Liberação manual de crédito: a ação autorizada deve tirar o pedido da fila de crédito
    -- mesmo quando credit_approved_by já estava preenchido por tentativa anterior.
    IF NEW.credit_approved_by IS NOT NULL
       AND NEW.status = 'em_analise_comercial'
       AND OLD.status = 'aguardando_aprovacao_credito'
       AND NEW.total IS NOT DISTINCT FROM OLD.total THEN
      NEW.credit_block_reason := NULL;
      RETURN NEW;
    END IF;

    -- Libera quando admin/financeiro acabou de aprovar crédito pela primeira vez.
    IF NEW.credit_approved_by IS NOT NULL AND OLD.credit_approved_by IS NULL THEN
      NEW.credit_block_reason := NULL;
      RETURN NEW;
    END IF;

    -- Libera transição em_analise_comercial → aprovado quando crédito já foi aprovado
    -- e o total não mudou (evita re-bloqueio espúrio que obrigava o segundo clique).
    IF OLD.credit_approved_by IS NOT NULL
       AND NEW.status = 'aprovado'
       AND OLD.status = 'em_analise_comercial'
       AND NEW.total IS NOT DISTINCT FROM OLD.total THEN
      RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('em_analise_comercial','aprovado') THEN
      v_should_check := true;
    ELSIF NEW.total IS DISTINCT FROM OLD.total
       AND NEW.status IN ('em_analise_comercial','aprovado','aguardando_aprovacao_credito') THEN
      v_should_check := true;
    END IF;
  END IF;

  IF NOT v_should_check THEN RETURN NEW; END IF;

  v := public.rpc_b2b_partner_credit(NEW.partner_id);

  IF (v->>'block_if_overdue')::boolean AND (v->>'tem_vencidos')::boolean THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := 'inadimplencia';
    RETURN NEW;
  END IF;

  v_after := COALESCE((v->>'saldo_em_aberto')::numeric,0) + COALESCE(NEW.total,0);
  IF COALESCE((v->>'credit_limit')::numeric,0) > 0
     AND v_after > (v->>'credit_limit')::numeric THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := CASE
      WHEN (v->>'credit_limit_action') = 'approval_required' THEN 'limite_excedido'
      ELSE 'limite_excedido_bloqueado'
    END;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_b2b_credit(
  p_partner_order_id uuid,
  p_notes text DEFAULT NULL
) RETURNS jsonb
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

  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_partner_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF v_order.status = 'aprovado' THEN
    RETURN jsonb_build_object('ok', true, 'order_id', p_partner_order_id, 'status', v_order.status);
  END IF;

  IF v_order.status NOT IN ('aguardando_aprovacao_credito','em_analise_comercial') THEN
    RAISE EXCEPTION 'invalid_status: %', v_order.status;
  END IF;

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
  WHERE id = p_partner_order_id;

  SELECT status, credit_block_reason INTO v_final_status, v_final_reason
  FROM public.partner_orders
  WHERE id = p_partner_order_id;

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

GRANT EXECUTE ON FUNCTION public.approve_b2b_credit(uuid, text) TO authenticated;