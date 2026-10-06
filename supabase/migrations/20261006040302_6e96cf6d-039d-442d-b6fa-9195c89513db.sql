BEGIN;

DO $$
DECLARE
  v_superadmin uuid;
  v_non_superadmin uuid;
  v_draft uuid;
  v_publish_key uuid := gen_random_uuid();
  v_result uuid;
  v_retry uuid;
  v_before_subscriptions bigint;
  v_before_links bigint;
BEGIN
  SELECT p.user_id INTO v_superadmin
  FROM public.profiles p
  WHERE public.is_platform_superadmin(p.user_id)
  ORDER BY p.created_at LIMIT 1;
  IF v_superadmin IS NULL THEN RAISE EXCEPTION 'proof_missing_platform_superadmin'; END IF;

  SELECT p.user_id INTO v_non_superadmin
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL AND NOT public.is_platform_superadmin(p.user_id)
  ORDER BY p.created_at LIMIT 1;
  IF v_non_superadmin IS NULL THEN RAISE EXCEPTION 'proof_missing_non_superadmin'; END IF;

  SELECT id INTO v_draft FROM public.saas_plan_versions
  WHERE status='DRAFT' ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_draft IS NULL THEN RAISE EXCEPTION 'proof_missing_draft'; END IF;

  SELECT count(*) INTO v_before_subscriptions FROM public.organization_subscriptions;
  SELECT count(*) INTO v_before_links FROM public.organization_subscriptions WHERE plan_version_id IS NOT NULL;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_superadmin::text,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.platform_publish_plan_version_draft(v_draft,'a',gen_random_uuid(),'PUBLICAR');
    RAISE EXCEPTION 'proof_expected_short_reason_rejection';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  v_result := public.platform_publish_plan_version_draft(v_draft,'á🌱',v_publish_key,'PUBLICAR');
  IF v_result IS DISTINCT FROM v_draft THEN RAISE EXCEPTION 'proof_wrong_published_id'; END IF;
  v_retry := public.platform_publish_plan_version_draft(v_draft,'á🌱',v_publish_key,'PUBLICAR');
  IF v_retry IS DISTINCT FROM v_result THEN RAISE EXCEPTION 'proof_idempotency_failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.saas_plan_versions WHERE id=v_draft AND status='PUBLISHED' AND publication_reason='á🌱') THEN RAISE EXCEPTION 'proof_publish_state_failed'; END IF;
  IF (SELECT count(*) FROM public.saas_plan_version_audit WHERE plan_version_id=v_draft AND action='published' AND idempotency_key=v_publish_key) <> 1 THEN RAISE EXCEPTION 'proof_publish_audit_failed'; END IF;
  IF (SELECT count(*) FROM public.organization_subscriptions) <> v_before_subscriptions OR (SELECT count(*) FROM public.organization_subscriptions WHERE plan_version_id IS NOT NULL) <> v_before_links THEN RAISE EXCEPTION 'proof_subscription_changed'; END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_non_superadmin::text,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.platform_publish_plan_version_draft(v_draft,'OK',gen_random_uuid(),'PUBLICAR');
    RAISE EXCEPTION 'proof_expected_forbidden';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RESET ROLE;
END;
$$;

ROLLBACK;