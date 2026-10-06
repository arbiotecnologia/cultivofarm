DO $test$
DECLARE v_actor uuid; v_plan public.saas_plans%ROWTYPE; v_feature text; v_features jsonb; v_id uuid; v_check jsonb;
BEGIN
  SELECT ur.user_id INTO v_actor FROM public.user_roles ur WHERE ur.role='superadmin'::public.app_role ORDER BY ur.user_id LIMIT 1;
  SELECT p.* INTO v_plan FROM public.saas_plans p WHERE p.active AND NOT EXISTS (SELECT 1 FROM public.saas_plan_versions pv WHERE pv.plan_id=p.id AND pv.status='DRAFT') AND EXISTS (SELECT 1 FROM public.saas_plan_features pf JOIN public.saas_features f ON f.id=pf.feature_id WHERE pf.plan_id=p.id AND pf.enabled AND f.active AND (f.commercializable OR f.created_at<'2026-10-06 02:42:42+00'::timestamptz) AND NOT EXISTS (SELECT 1 FROM public.saas_feature_dependencies d WHERE d.feature_id=f.id)) ORDER BY p.key LIMIT 1;
  SELECT f.key INTO v_feature FROM public.saas_plan_features pf JOIN public.saas_features f ON f.id=pf.feature_id WHERE pf.plan_id=v_plan.id AND pf.enabled AND f.active AND (f.commercializable OR f.created_at<'2026-10-06 02:42:42+00'::timestamptz) AND NOT EXISTS (SELECT 1 FROM public.saas_feature_dependencies d WHERE d.feature_id=f.id) ORDER BY f.key LIMIT 1;
  v_features:=jsonb_build_array(jsonb_build_object('feature_key',v_feature,'enabled',true));
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true); PERFORM set_config('request.jwt.claim.role','authenticated',true); SET LOCAL ROLE authenticated;
  v_id:=public.platform_save_plan_version_draft(NULL,v_plan.key,59.90,'BRL','monthly',14,'{}'::jsonb,now()+interval '1 day',v_features,'Teste validação reversível',gen_random_uuid());
  v_check:=public.platform_validate_plan_version_draft(v_id);
  IF NOT coalesce((v_check->>'complete')::boolean,false) OR NOT coalesce((v_check->>'valid')::boolean,false) THEN RAISE EXCEPTION 'draft_publish_gate_selftest_failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.saas_plan_versions WHERE id=v_id AND status<>'DRAFT') THEN RAISE EXCEPTION 'draft_publish_gate_selftest_published'; END IF;
  RAISE EXCEPTION USING ERRCODE='PT001',MESSAGE='draft_publish_gate_selftest_pass_rollback';
EXCEPTION WHEN SQLSTATE 'PT001' THEN IF SQLERRM<>'draft_publish_gate_selftest_pass_rollback' THEN RAISE; END IF; END;
$test$;