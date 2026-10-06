BEGIN;
DO $$
DECLARE
  v_actor uuid; v_source public.saas_plan_versions%ROWTYPE; v_copy uuid := gen_random_uuid();
  v_target_plan uuid; v_copy_version integer; v_first_key uuid := gen_random_uuid();
BEGIN
  SELECT p.user_id INTO v_actor FROM public.profiles p WHERE public.is_platform_superadmin(p.user_id) ORDER BY p.created_at LIMIT 1;
  SELECT * INTO v_source FROM public.saas_plan_versions WHERE status='DRAFT' ORDER BY created_at LIMIT 1;
  IF v_actor IS NULL OR v_source.id IS NULL THEN RAISE EXCEPTION 'proof_prerequisite_missing'; END IF;
  SELECT id INTO v_target_plan FROM public.saas_plans WHERE active AND id<>v_source.plan_id AND NOT EXISTS (SELECT 1 FROM public.saas_plan_versions pv WHERE pv.plan_id=saas_plans.id AND pv.status='DRAFT') ORDER BY key LIMIT 1;
  IF v_target_plan IS NULL THEN RAISE EXCEPTION 'proof_missing_target_plan'; END IF;
  SELECT coalesce(max(version_number),0)+1000 INTO v_copy_version FROM public.saas_plan_versions WHERE plan_id=v_target_plan;
  INSERT INTO public.saas_plan_versions(id,plan_id,version_number,status,name_snapshot,description_snapshot,price_amount,currency,billing_cycle,trial_days,limits_snapshot,features_snapshot,effective_from,created_by)
  VALUES(v_copy,v_target_plan,v_copy_version,'DRAFT',v_source.name_snapshot,v_source.description_snapshot,v_source.price_amount,v_source.currency,v_source.billing_cycle,v_source.trial_days,v_source.limits_snapshot,v_source.features_snapshot,v_source.effective_from + interval '100 years',v_actor);
  INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled,limit_value,config)
  SELECT v_copy,feature_id,enabled,limit_value,config FROM public.saas_plan_version_features WHERE plan_version_id=v_source.id;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor::text,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  PERFORM public.platform_publish_plan_version_draft(v_copy,'OK',v_first_key,'PUBLICAR');
  BEGIN
    PERFORM public.platform_publish_plan_version_draft(v_copy,'OK',gen_random_uuid(),'PUBLICAR');
    RAISE EXCEPTION 'proof_expected_second_key_rejection';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  IF (SELECT count(*) FROM public.saas_plan_version_audit WHERE plan_version_id=v_copy AND action='published') <> 1 THEN RAISE EXCEPTION 'proof_duplicate_publication'; END IF;
  RESET ROLE;
END;
$$;
ROLLBACK;