-- READ ONLY under real JWT, Superadmin then internal reader and revoked/inactive actors.
SELECT platform_private.global_product_fiscal_read_ready(),platform_private.global_product_fiscal_write_ready();
SELECT has_function_privilege('anon','public.rpc_fiscal_product_ibs_cbs_save(uuid,jsonb,text)','EXECUTE') must_be_false;
SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE tablename='product_fiscal_profiles' AND schemaname='public';
-- Mutation/CAS proof requires auditor-controlled synthetic product, real JWT, then readback and exact receipt/hash evidence; never run against commercial fixtures automatically.
