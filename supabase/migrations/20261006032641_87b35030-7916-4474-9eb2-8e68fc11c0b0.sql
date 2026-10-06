DO $test$
DECLARE
  v_actor uuid;
  v_plan public.saas_plans%ROWTYPE;
  v_feature record;
  v_features jsonb;
  v_key uuid := gen_random_uuid();
  v_first uuid;
  v_second uuid;
  v_check jsonb;
BEGIN
  SELECT ur.user_id INTO v_actor FROM public.user_roles ur
  WHERE ur.role='superadmin'::public.app_role ORDER BY ur.user_id LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'draft_selftest_missing_superadmin'; END IF;

  SELECT p.* INTO v_plan FROM public.saas_plans p
  WHERE p.active
    AND NOT EXISTS (SELECT 1 FROM public.saas_plan_versions pv WHERE pv.plan_id=p.id AND pv.status='DRAFT')
    AND EXISTS (
      SELECT 1 FROM public.saas_plan_features pf JOIN public.saas_features f ON f.id=pf.feature_id
      WHERE pf.plan_id=p.id AND pf.enabled AND f.active
        AND (f.commercializable OR f.created_at<'2026-10-06 02:42:42+00'::timestamptz)
    )
  ORDER BY p.key LIMIT 1;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'draft_selftest_missing_eligible_plan'; END IF;

  SELECT f.key INTO v_feature
  FROM public.saas_plan_features pf JOIN public.saas_features f ON f.id=pf.feature_id
  WHERE pf.plan_id=v_plan.id AND pf.enabled AND f.active
    AND (f.commercializable OR f.created_at<'2026-10-06 02:42:42+00'::timestamptz)
    AND NOT EXISTS (SELECT 1 FROM public.saas_feature_dependencies d WHERE d.feature_id=f.id)
  ORDER BY f.key LIMIT 1;
  IF v_feature.key IS NULL THEN RAISE EXCEPTION 'draft_selftest_missing_independent_feature'; END IF;
  v_features:=jsonb_build_array(jsonb_build_object('feature_key',v_feature.key,'enabled',true));

  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  SET LOCAL ROLE authenticated;
  v_first:=public.platform_save_plan_version_draft(NULL,v_plan.key,59.90,'BRL','monthly',14,'{}'::jsonb,now()+interval '1 day',v_features,'Teste transacional reversível',v_key);
  v_second:=public.platform_save_plan_version_draft(NULL,v_plan.key,59.90,'BRL','monthly',14,'{}'::jsonb,now()+interval '1 day',v_features,'Teste transacional reversível',v_key);
  IF v_first IS DISTINCT FROM v_second THEN RAISE EXCEPTION 'draft_selftest_idempotency_failed'; END IF;
  v_check:=public.platform_validate_plan_version_draft(v_first);
  IF NOT coalesce((v_check->>'complete')::boolean,false) THEN RAISE EXCEPTION 'draft_selftest_validation_failed'; END IF;
  RAISE EXCEPTION USING ERRCODE='PT001',MESSAGE='draft_selftest_pass_rollback';
EXCEPTION WHEN SQLSTATE 'PT001' THEN
  IF SQLERRM<>'draft_selftest_pass_rollback' THEN RAISE; END IF;
END;
$test$;