BEGIN;
DO $$
DECLARE
  v_actor uuid; v_draft public.saas_plan_versions%ROWTYPE; v_features jsonb;
  v_key uuid := gen_random_uuid(); v_result uuid; v_retry uuid;
BEGIN
  SELECT p.user_id INTO v_actor FROM public.profiles p WHERE public.is_platform_superadmin(p.user_id) ORDER BY p.created_at LIMIT 1;
  SELECT * INTO v_draft FROM public.saas_plan_versions WHERE status='DRAFT' ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_actor IS NULL OR v_draft.id IS NULL THEN RAISE EXCEPTION 'proof_prerequisite_missing'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('feature_id',vf.feature_id,'enabled',vf.enabled) ORDER BY vf.feature_id),'[]'::jsonb) INTO v_features FROM public.saas_plan_version_features vf WHERE vf.plan_version_id=v_draft.id;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor::text,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.platform_save_plan_version_draft(v_draft.id,(SELECT key FROM public.saas_plans WHERE id=v_draft.plan_id),v_draft.price_amount,v_draft.currency,v_draft.billing_cycle,v_draft.trial_days,v_draft.limits_snapshot,v_draft.effective_from,v_features,'a',gen_random_uuid());
    RAISE EXCEPTION 'proof_expected_short_reason_rejection';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  v_result := public.platform_save_plan_version_draft(v_draft.id,(SELECT key FROM public.saas_plans WHERE id=v_draft.plan_id),v_draft.price_amount,v_draft.currency,v_draft.billing_cycle,v_draft.trial_days,v_draft.limits_snapshot,v_draft.effective_from,v_features,'á🌱',v_key);
  v_retry := public.platform_save_plan_version_draft(v_draft.id,(SELECT key FROM public.saas_plans WHERE id=v_draft.plan_id),v_draft.price_amount,v_draft.currency,v_draft.billing_cycle,v_draft.trial_days,v_draft.limits_snapshot,v_draft.effective_from,v_features,'á🌱',v_key);
  IF v_result IS DISTINCT FROM v_draft.id OR v_retry IS DISTINCT FROM v_result THEN RAISE EXCEPTION 'proof_save_idempotency_failed'; END IF;
  BEGIN
    PERFORM public.platform_save_plan_version_draft(v_draft.id,(SELECT key FROM public.saas_plans WHERE id=v_draft.plan_id),v_draft.price_amount,v_draft.currency,v_draft.billing_cycle,v_draft.trial_days,v_draft.limits_snapshot,v_draft.effective_from,jsonb_build_array(jsonb_build_object('feature_key','feature_inexistente_para_prova','enabled',true)),'OK',gen_random_uuid());
    RAISE EXCEPTION 'proof_expected_invalid_feature_rejection';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  RESET ROLE;
END;
$$;
ROLLBACK;