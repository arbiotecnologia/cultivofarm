CREATE OR REPLACE FUNCTION public.convert_partner_simulation_to_order_secure(p_simulation_id uuid, p_observacoes text DEFAULT NULL::text, p_payment_plan_id uuid DEFAULT NULL::uuid, p_first_due_date date DEFAULT NULL::date, p_installment_count integer DEFAULT NULL::integer, p_confirm_price_change boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean; v_is_partner_b2b boolean; v_is_tecnico boolean;
  v_user_partner uuid; v_sim record; v_partner_id uuid;
  v_items jsonb; v_result jsonb; v_order_id uuid;
  v_cart jsonb; v_new_table numeric(14,2);
  v_plan record; v_quote boolean; v_final numeric(14,2); v_hash text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_payment_plan_id IS NULL THEN RAISE EXCEPTION 'payment_plan_required'; END IF;

  v_is_admin := has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial');
  v_is_partner_b2b := has_role(v_uid,'parceiro_b2b');
  v_is_tecnico := has_role(v_uid,'parceiro_b2b_tecnico');

  IF v_is_tecnico AND NOT v_is_admin AND NOT v_is_partner_b2b THEN
    RAISE EXCEPTION 'forbidden_role_tecnico_cannot_convert';
  END IF;
  IF NOT (v_is_admin OR v_is_partner_b2b) THEN RAISE EXCEPTION 'forbidden_role'; END IF;

  SELECT * INTO v_sim FROM public.partner_simulations WHERE id = p_simulation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'simulation_not_found'; END IF;
  IF v_sim.status = 'convertida_pedido' THEN RAISE EXCEPTION 'already_converted'; END IF;
  IF v_sim.status NOT IN ('rascunho','enviada_gestor') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  v_partner_id := v_sim.partner_id;
  PERFORM platform_private.assert_b2b_partner_scope(v_uid, v_partner_id);
  IF v_is_partner_b2b AND NOT v_is_admin THEN
    v_user_partner := get_user_partner_id();
    IF v_user_partner IS NULL OR v_user_partner <> v_partner_id THEN RAISE EXCEPTION 'forbidden_partner'; END IF;
  END IF;

  IF v_sim.valid_until IS NOT NULL AND v_sim.valid_until < current_date
     AND NOT p_confirm_price_change THEN
    RAISE EXCEPTION 'simulation_expired_requires_confirmation';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'item_id', item_id, 'item_tipo', item_tipo, 'quantidade', quantidade,
           'unidade_medida', COALESCE(unidade_medida,'hectare'), 'volume_ml', volume_ml)), '[]'::jsonb)
    INTO v_items
  FROM public.partner_simulation_items WHERE simulation_id = p_simulation_id;
  IF v_items = '[]'::jsonb THEN RAISE EXCEPTION 'empty_simulation'; END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF; IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;

  -- Revalidacao autoritativa do preco no momento da conversao
  v_cart := public.fn_resolve_b2b_cart(v_partner_id, p_payment_plan_id, v_items, current_date);
  v_new_table := (v_cart->>'table_amount')::numeric;

  IF COALESCE(v_sim.total_cheio,0) > 0
     AND ABS(v_new_table - v_sim.total_cheio) > 0.01
     AND NOT p_confirm_price_change THEN
    RAISE EXCEPTION 'price_changed_requires_confirmation: simulado=% atual=%',
      v_sim.total_cheio, v_new_table USING ERRCODE='P0001';
  END IF;

  -- assinatura calculada no servidor a partir do carrinho recem-resolvido
  v_quote := COALESCE((v_cart->>'quote_required')::boolean,false);
  v_final := CASE WHEN v_quote THEN 0
                  ELSE public.fn_b2b_apply_interest((v_cart->>'net_amount')::numeric,
                         v_plan.interest_type, v_plan.monthly_interest_percent, v_plan.months_count) END;
  v_hash := public.fn_b2b_cart_hash(v_partner_id, p_payment_plan_id, v_cart, v_final);

  v_result := public.create_partner_order_secure(
    v_partner_id, COALESCE(p_observacoes, v_sim.observacoes), v_items,
    NULL, p_payment_plan_id, p_first_due_date, p_installment_count,
    v_hash, 'sim:' || p_simulation_id::text);
  v_order_id := (v_result->>'id')::uuid;

  UPDATE public.partner_orders
     SET origin_simulation_id = p_simulation_id, cliente_id = v_sim.cliente_id
   WHERE id = v_order_id;

  UPDATE public.partner_simulations
     SET status='convertida_pedido', converted_order_id=v_order_id,
         converted_by=v_uid, converted_at=now(), updated_at=now()
   WHERE id = p_simulation_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_order_id, v_partner_id, v_uid, 'converted_from_simulation',
          jsonb_build_object('simulation_id', p_simulation_id, 'numero', v_result->>'numero',
                             'cliente_id', v_sim.cliente_id, 'total', v_result->>'total',
                             'cart_hash', v_hash,
                             'price_change_confirmed', p_confirm_price_change));

  PERFORM public.insert_partner_catalog_access_log_internal(
    'simulation_converted_to_order', v_partner_id, v_uid, v_sim.cliente_id,
    p_simulation_id, v_order_id, NULL, jsonb_build_object('total', v_result->>'total'));

  RETURN v_order_id;
END $function$
