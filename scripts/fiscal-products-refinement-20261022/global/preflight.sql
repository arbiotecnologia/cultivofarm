-- READ ONLY; operator must first prove canonical ref swzpzcwiasxmjutrmvkm.
SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,md5(pg_get_functiondef(p.oid)) md5,p.proacl::text acl,pg_get_userbyid(p.proowner) owner FROM pg_proc p WHERE p.oid IN ('platform_private.platform_actor_access_ready(uuid)'::regprocedure,'public.is_platform_superadmin(uuid)'::regprocedure,'public.rpc_fiscal_product_ibs_cbs_get(uuid)'::regprocedure,'public.rpc_fiscal_product_ibs_cbs_save(uuid,jsonb,text)'::regprocedure,'cf_user_guards_v1.acquire_gate()'::regprocedure,'public._fiscal_rtc_assert_payload(jsonb,text)'::regprocedure);
SELECT relacl::text,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.product_fiscal_profiles'::regclass;
SELECT policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='product_fiscal_profiles' ORDER BY policyname;
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='product_fiscal_profiles' ORDER BY indexname;
SELECT tgname,tgenabled,pg_get_triggerdef(oid),md5(pg_get_functiondef(tgfoid)) FROM pg_trigger WHERE tgrelid='public.product_fiscal_profiles'::regclass AND NOT tgisinternal ORDER BY tgname;
-- ASSERTIVE (fails closed), 02:4x fix: gate body/whitelist and produtos reader.
DO $$ BEGIN
 IF md5(pg_get_functiondef('cf_user_guards_v1.acquire_gate()'::regprocedure))<>'b0dd9a14d5fd799a40df0975baf4c5a6' THEN RAISE EXCEPTION 'acquire_gate_drift'; END IF;
 IF position('public.product_fiscal_profiles' IN pg_get_functiondef('cf_user_guards_v1.acquire_gate()'::regprocedure))>0 THEN RAISE EXCEPTION 'acquire_gate_whitelist_changed'; END IF;
 IF (SELECT md5(jsonb_agg(jsonb_build_array(polname,polcmd,pg_get_expr(polqual,polrelid)) ORDER BY polname)::text) FROM pg_policy WHERE polrelid='public.produtos'::regclass) IS NULL THEN RAISE EXCEPTION 'produtos_policies_missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.produtos'::regclass AND polname='produtos_select_platform_fiscal_superadmin') THEN RAISE EXCEPTION 'produtos_fiscal_policy_already_present'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.produtos'::regclass AND attname IN ('organization_id','tenant_id') AND NOT attisdropped) THEN RAISE EXCEPTION 'produtos_tenant_model_drift'; END IF;
END $$;
SELECT policyname,cmd,roles::text,qual FROM pg_policies WHERE schemaname='public' AND tablename='produtos' ORDER BY policyname;
