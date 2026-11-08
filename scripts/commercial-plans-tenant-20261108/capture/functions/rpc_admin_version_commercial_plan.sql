CREATE OR REPLACE FUNCTION public.rpc_admin_version_commercial_plan(p_plan_id uuid, p_payload jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old public.commercial_payment_plans%ROWTYPE; v_new_id uuid; v_next integer; v_code text;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM public._cpp_validate_payload(p_payload);

  SELECT * INTO v_old FROM public.commercial_payment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_old.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'plan_already_superseded'; END IF;

  SELECT coalesce(max(version),0) + 1 INTO v_next
    FROM public.commercial_payment_plans WHERE root_plan_id = coalesce(v_old.root_plan_id, v_old.id);
  v_code := upper(btrim(coalesce(nullif(p_payload->>'code',''), v_old.code)));
  IF v_code = v_old.code THEN v_code := v_code || '-V' || v_next; END IF;

  INSERT INTO public.commercial_payment_plans (
    name, code, description, plan_type, max_days, months_count, installment_count,
    discount_percent, monthly_interest_percent, interest_type, requires_credit_approval,
    requires_guarantee, requires_financial_approval, minimum_order_amount, pricing_mode,
    active, sort_order, created_by, updated_by, valid_from, valid_until,
    version, root_plan_id, version_reason
  ) VALUES (
    btrim(coalesce(nullif(p_payload->>'name',''), v_old.name)), v_code,
    coalesce(nullif(btrim(coalesce(p_payload->>'description','')),''), v_old.description),
    coalesce(nullif(p_payload->>'plan_type',''), v_old.plan_type),
    coalesce((p_payload->>'max_days')::integer, v_old.max_days),
    coalesce((p_payload->>'months_count')::numeric, v_old.months_count),
    coalesce((p_payload->>'installment_count')::integer, v_old.installment_count),
    coalesce((p_payload->>'discount_percent')::numeric, v_old.discount_percent),
    coalesce((p_payload->>'monthly_interest_percent')::numeric, v_old.monthly_interest_percent),
    coalesce(nullif(p_payload->>'interest_type',''), v_old.interest_type),
    coalesce((p_payload->>'requires_credit_approval')::boolean, v_old.requires_credit_approval),
    coalesce((p_payload->>'requires_guarantee')::boolean, v_old.requires_guarantee),
    coalesce((p_payload->>'requires_financial_approval')::boolean, v_old.requires_financial_approval),
    coalesce(nullif(p_payload->>'minimum_order_amount','')::numeric, v_old.minimum_order_amount),
    coalesce(nullif(p_payload->>'pricing_mode',''), v_old.pricing_mode),
    true, v_old.sort_order, auth.uid(), auth.uid(),
    coalesce(nullif(p_payload->>'valid_from','')::timestamptz, now()),
    nullif(p_payload->>'valid_until','')::timestamptz,
    v_next, coalesce(v_old.root_plan_id, v_old.id), nullif(btrim(coalesce(p_motivo,'')),'')
  ) RETURNING id INTO v_new_id;

  UPDATE public.commercial_payment_plans
     SET superseded_by_id = v_new_id, active = false, is_default = false,
         valid_until = coalesce(valid_until, now()), updated_by = auth.uid()
   WHERE id = p_plan_id;

  PERFORM public._cpp_audit('commercial_plan_versioned', v_new_id, to_jsonb(v_old), p_payload || jsonb_build_object('version', v_next, 'previous_plan_id', p_plan_id), p_motivo);
  RETURN v_new_id;
END
$function$
