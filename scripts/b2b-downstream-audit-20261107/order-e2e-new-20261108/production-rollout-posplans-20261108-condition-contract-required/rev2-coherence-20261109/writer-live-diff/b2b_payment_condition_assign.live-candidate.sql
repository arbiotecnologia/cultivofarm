CREATE OR REPLACE FUNCTION public.b2b_payment_condition_assign(p_partner_id uuid, p_plan_id uuid, p_method text, p_version integer, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; cur platform_private.b2b_condition_versions;
BEGIN
  v_org := platform_private.b2b_condition_cfg_actor(false);
  IF p_enabled IS NULL OR p_version IS NULL THEN RAISE EXCEPTION 'payment_condition_config_invalid' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('b2bcond:' || v_org::text || ':' || p_plan_id::text || ':' || p_method, 0));
  IF platform_private.b2b_condition_cfg_actor(false) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF NOT platform_private.commercial_plan_admin_allowed(p_plan_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_accounts a WHERE a.id=p_partner_id AND a.commercial_owner_organization_id=v_org AND a.ativo IS TRUE) THEN
    RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
  SELECT * INTO cur FROM platform_private.b2b_condition_versions v WHERE v.organization_id=v_org AND v.plan_id=p_plan_id AND v.method=p_method
   ORDER BY v.version DESC LIMIT 1 FOR UPDATE;
  IF NOT platform_private.commercial_plan_admin_allowed(p_plan_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF cur.version IS NULL OR cur.version <> p_version
     OR EXISTS (SELECT 1 FROM platform_private.b2b_condition_retirements r WHERE (r.organization_id,r.plan_id,r.version,r.method)=(v_org,p_plan_id,cur.version,p_method)) THEN
    RAISE EXCEPTION 'payment_condition_config_stale' USING ERRCODE='PT409'; END IF;
  IF p_enabled THEN
    IF EXISTS (SELECT 1 FROM platform_private.b2b_condition_assignment_revocations x WHERE (x.organization_id,x.partner_id,x.plan_id,x.version,x.method)=(v_org,p_partner_id,p_plan_id,cur.version,p_method)) THEN
      RAISE EXCEPTION 'payment_condition_reassign_requires_new_version' USING ERRCODE='PT409'; END IF;
    INSERT INTO platform_private.b2b_condition_assignments(organization_id,partner_id,plan_id,version,method,assigned_by)
    VALUES (v_org,p_partner_id,p_plan_id,cur.version,p_method,v_uid) ON CONFLICT DO NOTHING;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM platform_private.b2b_condition_assignments a WHERE (a.organization_id,a.partner_id,a.plan_id,a.version,a.method)=(v_org,p_partner_id,p_plan_id,cur.version,p_method)) THEN
      RAISE EXCEPTION 'payment_condition_not_assigned' USING ERRCODE='PT409'; END IF;
    INSERT INTO platform_private.b2b_condition_assignment_revocations(organization_id,partner_id,plan_id,version,method,revoked_by)
    VALUES (v_org,p_partner_id,p_plan_id,cur.version,p_method,v_uid) ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','partner_id',p_partner_id,'plan_id',p_plan_id,'method',p_method,'version',cur.version,'enabled',p_enabled);
END $function$
