DO $$ BEGIN
IF current_setting('c2p1.review_project_ref',true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'C2P1_REF_NOT_VERIFIED'; END IF;
IF has_table_privilege('authenticated','public.partner_financial_settings','UPDATE') OR has_table_privilege('authenticated','public.commercial_payment_plan_assignments','UPDATE') THEN RAISE EXCEPTION 'C2P1_DIRECT_WRITE_OPEN'; END IF;
IF has_function_privilege('anon','public.rpc_update_partner_financial_settings(uuid,jsonb,jsonb)','EXECUTE') OR has_function_privilege('anon','platform_private.c2p1_update_settings(uuid,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'C2P1_ANON_OPEN'; END IF;
IF NOT has_function_privilege('authenticated','public.rpc_update_partner_financial_settings(uuid,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'C2P1_API_CLOSED'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='platform_private' AND p.proname LIKE 'c2p1_%' AND (pg_get_userbyid(p.proowner)<>'postgres' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[])) THEN RAISE EXCEPTION 'C2P1_CORE_METADATA_DRIFT'; END IF;
IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_financial_settings'::regclass AND conname='partner_financial_settings_default_payment_method_check') THEN RAISE EXCEPTION 'C2P1_LEGACY_METHOD_CHECK'; END IF;
IF (SELECT count(*) FROM pg_trigger WHERE tgrelid IN ('public.partner_financial_settings'::regclass,'public.commercial_payment_plan_assignments'::regclass) AND tgname IN ('c2p1_settings_fence','c2p1_assignment_fence') AND tgenabled='O')<>2 THEN RAISE EXCEPTION 'C2P1_FENCE_MISSING'; END IF;
END $$;
