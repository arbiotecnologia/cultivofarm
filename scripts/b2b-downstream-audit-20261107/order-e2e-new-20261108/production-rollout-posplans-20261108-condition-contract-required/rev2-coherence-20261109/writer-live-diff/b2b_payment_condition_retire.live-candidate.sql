CREATE OR REPLACE FUNCTION public.b2b_payment_condition_retire(p_plan_id uuid, p_method text, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; cur platform_private.b2b_condition_versions;
BEGIN
  v_org := platform_private.b2b_condition_cfg_actor(false);
  PERFORM pg_advisory_xact_lock(hashtextextended('b2bcond:' || v_org::text || ':' || p_plan_id::text || ':' || p_method, 0));
  IF platform_private.b2b_condition_cfg_actor(false) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF NOT platform_private.commercial_plan_admin_allowed(p_plan_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO cur FROM platform_private.b2b_condition_versions v WHERE v.organization_id=v_org AND v.plan_id=p_plan_id AND v.method=p_method
   ORDER BY v.version DESC LIMIT 1 FOR UPDATE;
  IF NOT platform_private.commercial_plan_admin_allowed(p_plan_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF cur.version IS NULL OR cur.version <> p_expected_version THEN RAISE EXCEPTION 'payment_condition_config_stale' USING ERRCODE='PT409'; END IF;
  IF EXISTS (SELECT 1 FROM platform_private.b2b_condition_retirements r WHERE (r.organization_id,r.plan_id,r.version,r.method)=(v_org,p_plan_id,cur.version,p_method)) THEN
    RAISE EXCEPTION 'payment_condition_already_retired' USING ERRCODE='PT409'; END IF;
  INSERT INTO platform_private.b2b_condition_retirements(organization_id,plan_id,version,method,retired_by) VALUES (v_org,p_plan_id,cur.version,p_method,v_uid);
  RETURN jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','retired',jsonb_build_object('plan_id',p_plan_id,'method',p_method,'version',cur.version));
END $function$
