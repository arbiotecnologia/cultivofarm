DO $test$
DECLARE v_actor uuid; v_plan_key text; v_rejected boolean:=false;
BEGIN
  SELECT ur.user_id INTO v_actor FROM public.user_roles ur WHERE ur.role='superadmin'::public.app_role ORDER BY ur.user_id LIMIT 1;
  SELECT p.key INTO v_plan_key FROM public.saas_plans p WHERE p.active ORDER BY p.key LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true); PERFORM set_config('request.jwt.claim.role','authenticated',true); SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.platform_save_plan_version_draft(NULL,v_plan_key,59.90,'BRL','monthly',14,'{}'::jsonb,now()+interval '1 day',jsonb_build_array(jsonb_build_object('feature_key','__catalogo_invalido__','enabled',true)),'Teste inválido reversível',gen_random_uuid());
  EXCEPTION WHEN invalid_parameter_value THEN v_rejected:=true;
  END;
  RESET ROLE;
  IF NOT v_rejected THEN RAISE EXCEPTION 'draft_invalid_catalog_selftest_failed'; END IF;
END;
$test$;