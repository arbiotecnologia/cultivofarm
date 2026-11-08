CREATE OR REPLACE FUNCTION public.b2b_payment_condition_publish(p_plan_id uuid, p_method text, p_payment_method_id uuid, p_category_id uuid, p_deadline_days integer, p_installment_count integer, p_monthly_rate numeric, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; cur platform_private.b2b_condition_versions; v_new platform_private.b2b_condition_versions; pl record;
BEGIN
  v_org := platform_private.b2b_condition_cfg_actor(false);
  IF p_plan_id IS NULL OR p_method IS NULL OR p_expected_version IS NULL OR p_expected_version < 0 OR p_deadline_days IS NULL
     OR p_installment_count IS NULL OR p_monthly_rate IS NULL THEN RAISE EXCEPTION 'payment_condition_config_invalid' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('b2bcond:' || v_org::text || ':' || p_plan_id::text || ':' || p_method, 0));
  IF platform_private.b2b_condition_cfg_actor(false) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO cur FROM platform_private.b2b_condition_versions v WHERE v.organization_id=v_org AND v.plan_id=p_plan_id AND v.method=p_method
   ORDER BY v.version DESC LIMIT 1 FOR UPDATE;
  IF COALESCE(cur.version,0) <> p_expected_version THEN RAISE EXCEPTION 'payment_condition_config_stale' USING ERRCODE='PT409'; END IF;
  SELECT p.active, p.superseded_by_id, p.max_days, p.monthly_interest_percent INTO pl FROM public.commercial_payment_plans p WHERE p.id=p_plan_id FOR SHARE;
  IF pl.active IS NOT TRUE OR pl.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'plan_inactive' USING ERRCODE='P0001'; END IF;
  IF COALESCE(pl.monthly_interest_percent,0) <> 0 THEN RAISE EXCEPTION 'payment_condition_plan_interest_conflict' USING ERRCODE='P0001'; END IF;
  IF p_deadline_days > COALESCE(pl.max_days,0) THEN RAISE EXCEPTION 'payment_condition_deadline_exceeds_plan' USING ERRCODE='P0001'; END IF;
  PERFORM 1 FROM public.payment_methods m WHERE m.id=p_payment_method_id AND m.active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_method_catalog_unavailable' USING ERRCODE='P0001'; END IF;
  PERFORM 1 FROM public.financial_categories k WHERE k.id=p_category_id AND k.active IS TRUE AND upper(btrim(k.type))='RECEITA' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'revenue_category_unavailable' USING ERRCODE='P0001'; END IF;
  INSERT INTO platform_private.b2b_condition_versions(organization_id,plan_id,version,method,deadline_days,installment_count,monthly_rate,
    approved_by,approved_at,configuration_approved,calendar_version,category_id,payment_method_id)
  VALUES (v_org,p_plan_id,COALESCE(cur.version,0)+1,p_method,p_deadline_days,p_installment_count,p_monthly_rate,v_uid,now(),true,NULL,p_category_id,p_payment_method_id)
  RETURNING * INTO v_new;
  IF cur.version IS NOT NULL THEN
    INSERT INTO platform_private.b2b_condition_retirements(organization_id,plan_id,version,method,retired_by)
    SELECT v_org,p_plan_id,cur.version,p_method,v_uid
     WHERE NOT EXISTS (SELECT 1 FROM platform_private.b2b_condition_retirements r WHERE (r.organization_id,r.plan_id,r.version,r.method)=(v_org,p_plan_id,cur.version,p_method));
    INSERT INTO platform_private.b2b_condition_assignments(organization_id,partner_id,plan_id,version,method,assigned_by)
    SELECT a.organization_id,a.partner_id,a.plan_id,v_new.version,a.method,v_uid FROM platform_private.b2b_condition_assignments a
     JOIN public.partner_accounts pa ON pa.id=a.partner_id AND pa.commercial_owner_organization_id=v_org AND pa.ativo IS TRUE
     WHERE a.organization_id=v_org AND a.plan_id=p_plan_id AND a.version=cur.version AND a.method=p_method
       AND NOT EXISTS (SELECT 1 FROM platform_private.b2b_condition_assignment_revocations x
                        WHERE (x.organization_id,x.partner_id,x.plan_id,x.version,x.method)=(a.organization_id,a.partner_id,a.plan_id,a.version,a.method));
  END IF;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','condition', to_jsonb(v_new) - 'approved_by');
END $function$
