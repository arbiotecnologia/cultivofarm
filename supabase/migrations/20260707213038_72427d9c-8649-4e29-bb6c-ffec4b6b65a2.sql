DO $mig$
DECLARE
  v_src text;
  v_new text;
  v_installments_block text := $blk$
  -- FASE 11 blindagem quantidade parcelas
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'financeiro') OR has_role(v_uid,'gestor_comercial')) THEN
    IF p_installment_count IS NOT NULL AND p_installment_count <> COALESCE(v_plan.installment_count,1) THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
        VALUES (NULL, p_partner_id, v_uid, 'installment_count_override_blocked',
                jsonb_build_object('requested', p_installment_count, 'plan_default', v_plan.installment_count));
    END IF;
    v_installments := GREATEST(COALESCE(v_plan.installment_count,1),1);
  ELSE
    IF p_installment_count IS NOT NULL AND p_installment_count <= 0 THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
        VALUES (NULL, p_partner_id, v_uid, 'invalid_installment_count_blocked',
                jsonb_build_object('requested', p_installment_count));
      RAISE EXCEPTION 'invalid_installment_count';
    END IF;
    v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);
    IF p_installment_count IS NOT NULL AND p_installment_count <> COALESCE(v_plan.installment_count,1) THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
        VALUES (NULL, p_partner_id, v_uid, 'installment_count_override',
                jsonb_build_object('plan_default', v_plan.installment_count, 'used', v_installments));
    END IF;
  END IF;
$blk$;
  v_first_due_block_create text := $blk$
  -- FASE 11 blindagem vencimento
  IF p_first_due_date IS NOT NULL AND p_first_due_date < current_date THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
      VALUES (v_order_id, p_partner_id, v_uid, 'invalid_due_date_blocked',
              jsonb_build_object('requested', p_first_due_date));
    RAISE EXCEPTION 'invalid_due_date';
  END IF;
  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);
  IF v_first_due > current_date + v_plan.max_days THEN
    IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'financeiro') OR has_role(v_uid,'gestor_comercial')) THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
        VALUES (v_order_id, p_partner_id, v_uid, 'due_date_exceeds_plan_limit_capped',
                jsonb_build_object('plan_max_days', v_plan.max_days, 'requested_due_date', v_first_due));
      v_first_due := current_date + v_plan.max_days;
    ELSIF NOT (v_plan.requires_financial_approval OR v_plan.requires_guarantee) THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
        VALUES (v_order_id, p_partner_id, v_uid, 'due_date_exceeds_plan_limit_capped',
                jsonb_build_object('plan_max_days', v_plan.max_days, 'requested_due_date', v_first_due));
      v_first_due := current_date + v_plan.max_days;
    ELSE
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
        VALUES (v_order_id, p_partner_id, v_uid, 'due_date_exceeds_plan_limit_authorized',
                jsonb_build_object('plan_max_days', v_plan.max_days, 'requested_due_date', v_first_due));
      v_fin_status := 'pending'; v_approval_status := 'pending';
    END IF;
  END IF;
$blk$;
  v_first_due_block_sim text := $blk$
  -- FASE 11 blindagem vencimento simulacao
  IF p_first_due_date IS NOT NULL AND p_first_due_date < current_date THEN
    RAISE EXCEPTION 'invalid_due_date';
  END IF;
  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);
  IF v_first_due > current_date + v_plan.max_days THEN
    IF NOT (v_is_admin OR v_is_finance OR v_is_gestor) THEN
      v_first_due := current_date + v_plan.max_days;
      v_warnings := v_warnings || jsonb_build_array('Data de vencimento ajustada ao limite do plano.');
    END IF;
  END IF;
$blk$;
BEGIN
  -- create_partner_order_secure
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='create_partner_order_secure' LIMIT 1;
  v_new := replace(v_src,
    'v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);',
    v_installments_block);
  v_new := replace(v_new,
    E'v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);\n  IF v_first_due > current_date + v_plan.max_days AND v_plan.plan_type <> ''harvest'' THEN\n    v_first_due := current_date + v_plan.max_days;\n  END IF;',
    v_first_due_block_create);
  IF v_new = v_src THEN RAISE EXCEPTION 'FASE11: patch create falhou'; END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.create_partner_order_secure(p_partner_id uuid, p_observacoes text DEFAULT NULL::text, p_items jsonb DEFAULT ''[]''::jsonb, p_requested_delivery_date date DEFAULT NULL::date, p_payment_plan_id uuid DEFAULT NULL::uuid, p_first_due_date date DEFAULT NULL::date, p_installment_count integer DEFAULT NULL::integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
    v_new);

  -- simulate_b2b_payment_plan_secure
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='simulate_b2b_payment_plan_secure' LIMIT 1;
  v_new := replace(v_src,
    E'v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);\n  IF v_first_due > current_date + v_plan.max_days AND v_plan.plan_type <> ''harvest'' THEN\n    v_first_due := current_date + v_plan.max_days;\n  END IF;',
    v_first_due_block_sim);
  IF v_new = v_src THEN RAISE EXCEPTION 'FASE11: patch simulate falhou'; END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.simulate_b2b_payment_plan_secure(p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb, p_first_due_date date DEFAULT NULL::date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
    v_new);
END $mig$;

DO $chk$
DECLARE v_ok boolean;
BEGIN
  SELECT (position('FASE 11 blindagem quantidade parcelas' in prosrc) > 0
          AND position('FASE 11 blindagem vencimento' in prosrc) > 0)
    INTO v_ok
  FROM pg_proc WHERE proname='create_partner_order_secure' LIMIT 1;
  IF NOT COALESCE(v_ok,false) THEN RAISE EXCEPTION 'FASE 11 patch missing in create'; END IF;

  SELECT position('FASE 11 blindagem vencimento simulacao' in prosrc) > 0
    INTO v_ok FROM pg_proc WHERE proname='simulate_b2b_payment_plan_secure' LIMIT 1;
  IF NOT COALESCE(v_ok,false) THEN RAISE EXCEPTION 'FASE 11 patch missing in simulate'; END IF;
END $chk$;