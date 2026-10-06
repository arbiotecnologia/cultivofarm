DO $test$
DECLARE v_actor uuid; v_non_admin uuid; v_plan public.saas_plans%ROWTYPE; v_feature text; v_features jsonb; v_created uuid; v_updated uuid; v_revision integer; v_forbidden boolean:=false;
BEGIN
  SELECT ur.user_id INTO v_actor FROM public.user_roles ur WHERE ur.role='superadmin'::public.app_role ORDER BY ur.user_id LIMIT 1;
  SELECT p.id INTO v_non_admin FROM public.profiles p WHERE p.ativo IS TRUE AND NOT public.is_platform_superadmin(p.id) ORDER BY p.id LIMIT 1;
  IF v_actor IS NULL OR v_non_admin IS NULL THEN RAISE EXCEPTION 'draft_update_selftest_missing_actor'; END IF;
  SELECT p.* INTO v_plan FROM public.saas_plans p WHERE p.active AND NOT EXISTS (SELECT 1 FROM public.saas_plan_versions pv WHERE pv.plan_id=p.id AND pv.status='DRAFT') AND EXISTS (SELECT 1 FROM public.saas_plan_features pf JOIN public.saas_features f ON f.id=pf.feature_id WHERE pf.plan_id=p.id AND pf.enabled AND f.active AND (f.commercializable OR f.created_at<'2026-10-06 02:42:42+00'::timestamptz) AND NOT EXISTS (SELECT 1 FROM public.saas_feature_dependencies d WHERE d.feature_id=f.id)) ORDER BY p.key LIMIT 1;
  SELECT f.key INTO v_feature FROM public.saas_plan_features pf JOIN public.saas_features f ON f.id=pf.feature_id WHERE pf.plan_id=v_plan.id AND pf.enabled AND f.active AND (f.commercializable OR f.created_at<'2026-10-06 02:42:42+00'::timestamptz) AND NOT EXISTS (SELECT 1 FROM public.saas_feature_dependencies d WHERE d.feature_id=f.id) ORDER BY f.key LIMIT 1;
  IF v_plan.id IS NULL OR v_feature IS NULL THEN RAISE EXCEPTION 'draft_update_selftest_missing_catalog'; END IF;
  v_features:=jsonb_build_array(jsonb_build_object('feature_key',v_feature,'enabled',true));
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true); PERFORM set_config('request.jwt.claim.role','authenticated',true); SET LOCAL ROLE authenticated;
  v_created:=public.platform_save_plan_version_draft(NULL,v_plan.key,59.90,'BRL','monthly',14,'{}'::jsonb,now()+interval '1 day',v_features,'Teste de criação reversível',gen_random_uuid());
  v_updated:=public.platform_save_plan_version_draft(v_created,v_plan.key,69.90,'BRL','monthly',14,'{}'::jsonb,now()+interval '1 day',v_features,'Teste de atualização reversível',gen_random_uuid());
  IF v_created IS DISTINCT FROM v_updated THEN RAISE EXCEPTION 'draft_update_selftest_id_changed'; END IF;
  SELECT revision INTO v_revision FROM public.saas_plan_versions WHERE id=v_created;
  IF v_revision<>2 THEN RAISE EXCEPTION 'draft_update_selftest_revision_failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_non_admin::text,true);
  BEGIN
    PERFORM public.platform_save_plan_version_draft(v_created,v_plan.key,79.90,'BRL','monthly',14,'{}'::jsonb,now()+interval '1 day',v_features,'Teste de autorização reversível',gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege THEN v_forbidden:=true;
  END;
  IF NOT v_forbidden THEN RAISE EXCEPTION 'draft_update_selftest_auth_failed'; END IF;
  RAISE EXCEPTION USING ERRCODE='PT001',MESSAGE='draft_update_selftest_pass_rollback';
EXCEPTION WHEN SQLSTATE 'PT001' THEN IF SQLERRM<>'draft_update_selftest_pass_rollback' THEN RAISE; END IF; END;
$test$;