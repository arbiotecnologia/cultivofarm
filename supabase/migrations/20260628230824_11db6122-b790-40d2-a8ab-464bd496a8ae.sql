
-- ============ approve_b2b_credit (strict guard) ============
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

  -- Bloqueia transições duplicadas / fora do fluxo esperado
  IF v_order.status IN ('aprovado','reprovado','cancelado') THEN
    RAISE EXCEPTION 'already_processed: pedido já está em status %', v_order.status;
  END IF;

  IF v_order.status = 'em_analise_comercial' THEN
    RAISE EXCEPTION 'already_released: crédito já liberado, pedido em análise comercial';
  END IF;

  IF v_order.status <> 'aguardando_aprovacao_credito' THEN
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
  WHERE id = p_partner_order_id
    AND status = 'aguardando_aprovacao_credito';

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

-- ============ approve_partner_order (lock + duplicate guard) ============
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT partner_id, status, numero INTO v_pid, v_prev, v_numero
    FROM public.partner_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF v_prev IN ('aprovado','reprovado','cancelado') THEN
    RAISE EXCEPTION 'already_processed: pedido já está em status %', v_prev;
  END IF;

  IF v_prev = 'aguardando_aprovacao_credito' THEN
    RAISE EXCEPTION 'credit_pending: aprove o crédito antes da análise comercial';
  END IF;

  IF v_prev NOT IN ('em_analise_comercial','solicitado','rascunho') THEN
    RAISE EXCEPTION 'invalid_status_transition: %', v_prev;
  END IF;

  UPDATE public.partner_orders
     SET status = 'aprovado',
         approved_by = v_uid,
         approved_at = now(),
         approval_notes = NULLIF(p_approval_notes,''),
         estimated_delivery_date = COALESCE(p_estimated_delivery_date, estimated_delivery_date),
         ready_for_production = true,
         updated_at = now()
   WHERE id = p_order_id
     AND status = v_prev;

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
          jsonb_build_object('status','aprovado','approval_notes',p_approval_notes,'estimated_delivery_date',p_estimated_delivery_date));

  FOR v_partner_user IN SELECT user_id FROM public.partner_users WHERE partner_id = v_pid LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user, 'pedido_b2b_aprovado',
            'Pedido ' || v_numero || ' aprovado',
            'Seu pedido foi aprovado e seguirá para planejamento de produção.',
            '/portal-parceiro/pedidos');
  END LOOP;
END;
$function$;

-- ============ reject_partner_order (lock + status guard) ============
CREATE OR REPLACE FUNCTION public.reject_partner_order(p_order_id uuid, p_approval_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid; v_prev partner_order_status; v_partner_user uuid; v_numero text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_approval_notes IS NULL OR length(trim(p_approval_notes)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT partner_id, status, numero INTO v_pid, v_prev, v_numero
    FROM public.partner_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF v_prev IN ('reprovado','cancelado') THEN
    RAISE EXCEPTION 'already_processed: pedido já está em status %', v_prev;
  END IF;

  IF v_prev = 'aprovado' THEN
    RAISE EXCEPTION 'already_approved: pedido já aprovado não pode ser reprovado';
  END IF;

  IF v_prev NOT IN ('aguardando_aprovacao_credito','em_analise_comercial','solicitado','rascunho') THEN
    RAISE EXCEPTION 'invalid_status_transition: %', v_prev;
  END IF;

  UPDATE public.partner_orders
     SET status = 'reprovado',
         approved_by = v_uid,
         approved_at = now(),
         approval_notes = p_approval_notes,
         ready_for_production = false,
         updated_at = now()
   WHERE id = p_order_id
     AND status = v_prev;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_update: status do pedido mudou durante a reprovação';
  END IF;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'rejected',
          jsonb_build_object('status', v_prev),
          jsonb_build_object('status','reprovado','approval_notes',p_approval_notes));

  FOR v_partner_user IN SELECT user_id FROM public.partner_users WHERE partner_id = v_pid LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user, 'pedido_b2b_reprovado',
            'Pedido ' || v_numero || ' necessita revisão',
            'Seu pedido necessita revisão comercial. Motivo: ' || p_approval_notes,
            '/portal-parceiro/pedidos');
  END LOOP;
END;
$function$;
