CREATE OR REPLACE FUNCTION public.rpc_admin_create_commercial_plan(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM public._cpp_validate_payload(p_payload);

  INSERT INTO public.commercial_payment_plans (
    name, code, description, plan_type, max_days, months_count, installment_count,
    discount_percent, monthly_interest_percent, interest_type, requires_credit_approval,
    requires_guarantee, requires_financial_approval, minimum_order_amount, pricing_mode,
    active, sort_order, created_by, updated_by, valid_from, valid_until, version, version_reason
  ) VALUES (
    btrim(p_payload->>'name'), upper(btrim(p_payload->>'code')), nullif(btrim(coalesce(p_payload->>'description','')),''),
    p_payload->>'plan_type', coalesce((p_payload->>'max_days')::integer,0),
    coalesce((p_payload->>'months_count')::numeric,0), coalesce((p_payload->>'installment_count')::integer,1),
    coalesce((p_payload->>'discount_percent')::numeric,0), coalesce((p_payload->>'monthly_interest_percent')::numeric,0),
    coalesce(p_payload->>'interest_type','compound'), coalesce((p_payload->>'requires_credit_approval')::boolean,false),
    coalesce((p_payload->>'requires_guarantee')::boolean,false), coalesce((p_payload->>'requires_financial_approval')::boolean,false),
    nullif(p_payload->>'minimum_order_amount','')::numeric, coalesce(p_payload->>'pricing_mode','discount_from_base'),
    coalesce((p_payload->>'active')::boolean,true), coalesce((p_payload->>'sort_order')::integer,0),
    auth.uid(), auth.uid(), coalesce(nullif(p_payload->>'valid_from','')::timestamptz, now()),
    nullif(p_payload->>'valid_until','')::timestamptz, 1, nullif(btrim(coalesce(p_payload->>'motivo','')),'')
  ) RETURNING id INTO v_id;

  UPDATE public.commercial_payment_plans SET root_plan_id = v_id WHERE id = v_id;
  PERFORM public._cpp_audit('commercial_plan_created', v_id, NULL, p_payload, p_payload->>'motivo');
  RETURN v_id;
END
$function$
