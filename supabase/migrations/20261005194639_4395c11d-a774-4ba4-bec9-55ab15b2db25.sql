DO $$
DECLARE
  v_guard text;
  v_self_policy text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid) INTO v_guard
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='guard_profile_tenant_fields' AND pg_catalog.pg_get_function_identity_arguments(p.oid)='';
  IF v_guard NOT LIKE '%NEW.organization_id IS DISTINCT FROM OLD.organization_id%'
     OR v_guard NOT LIKE '%NEW.email IS DISTINCT FROM OLD.email%'
     OR v_guard NOT LIKE '%NEW.ativo IS DISTINCT FROM OLD.ativo%'
     OR v_guard LIKE '%NOT public.has_role(auth.uid(), ''administrador''%' THEN
    RAISE EXCEPTION 'd51_4_profile_guard_contract_regressed';
  END IF;
  SELECT with_check INTO v_self_policy FROM pg_catalog.pg_policies
  WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can update own non sensitive profile fields';
  IF v_self_policy IS NULL OR v_self_policy NOT LIKE '%auth.uid()%' THEN RAISE EXCEPTION 'd51_4_self_update_policy_missing'; END IF;
END;
$$;