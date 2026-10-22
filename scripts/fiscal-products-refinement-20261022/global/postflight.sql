-- READ ONLY under real JWT, Superadmin then internal reader and revoked/inactive actors.
SELECT platform_private.global_product_fiscal_read_ready(),platform_private.global_product_fiscal_write_ready();
SELECT has_function_privilege('anon','public.rpc_fiscal_product_ibs_cbs_save(uuid,jsonb,text)','EXECUTE') must_be_false;
SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE tablename='product_fiscal_profiles' AND schemaname='public';
-- Mutation/CAS proof requires auditor-controlled synthetic product, real JWT, then readback and exact receipt/hash evidence; never run against commercial fixtures automatically.
-- Gate/reader postflight (read-only): a00 must use the fiscal gate, never acquire_gate.
SELECT tgname,tgfoid::regprocedure::text FROM pg_trigger WHERE tgrelid='public.product_fiscal_profiles'::regclass AND tgname='a00_global_product_fiscal_gate';
SELECT md5(pg_get_functiondef('cf_user_guards_v1.acquire_gate()'::regprocedure))='b0dd9a14d5fd799a40df0975baf4c5a6' acquire_gate_unchanged;
-- Under real Superadmin JWT: count must be >0; under adminB JWT: unchanged internal count; under revoked/provisional Superadmin: 0.
SELECT count(*) FROM public.produtos;
