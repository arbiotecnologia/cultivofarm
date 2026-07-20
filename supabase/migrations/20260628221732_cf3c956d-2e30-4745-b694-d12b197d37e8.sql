
-- Ampliar bypass do credit guard: aceita transição em_analise_comercial → aprovado
-- quando o crédito já foi aprovado anteriormente e o total não mudou.
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
    -- libera quando admin acabou de aprovar crédito
    IF NEW.credit_approved_by IS NOT NULL AND OLD.credit_approved_by IS NULL THEN
      RETURN NEW;
    END IF;
    -- libera transição em_analise_comercial → aprovado quando crédito já foi aprovado
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

-- approve_partner_order: valida pós-update e levanta erro claro se o guard rebateu
CREATE OR REPLACE FUNCTION public.approve_partner_order(
  p_order_id uuid,
  p_approval_notes text DEFAULT NULL::text,
  p_estimated_delivery_date date DEFAULT NULL::date
)
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
    FROM public.partner_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_prev NOT IN ('em_analise_comercial','solicitado','rascunho') THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;

  UPDATE public.partner_orders
     SET status = 'aprovado',
         approved_by = v_uid,
         approved_at = now(),
         approval_notes = NULLIF(p_approval_notes,''),
         estimated_delivery_date = COALESCE(p_estimated_delivery_date, estimated_delivery_date),
         ready_for_production = true,
         updated_at = now()
   WHERE id = p_order_id;

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
