-- READ-ONLY BASELINE. Canonical destination swzpzcwiasxmjutrmvkm must be verified
-- externally (supabase/config.toml AND tool binding) before running this query.
-- Run inside the same transaction immediately before candidate DDL.
SELECT 1 / CASE WHEN
 md5(pg_get_functiondef('platform_private.storage1_consultor_core(text,text)'::regprocedure))='5c9e435c51d19d1dcbf5d61a9095daf3'
 AND (SELECT md5(string_agg(concat_ws('|',policyname,permissive,roles::text,cmd,qual,with_check),E'\n' ORDER BY policyname)) FROM pg_policies WHERE schemaname='storage' AND tablename='objects')='cfbc909356cc3e420d66efac99e69ba6'
 AND (SELECT proacl::text='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' AND pg_get_userbyid(proowner)='postgres' AND prosecdef AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='platform_private.storage1_consultor_core(text,text)'::regprocedure)
 AND EXISTS(SELECT 1 FROM storage.buckets WHERE id='consultor-arquivos' AND public IS FALSE)
 AND (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
 AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='registros_consultor_arquivos' AND column_name IN ('arquivo_path','registro_consultor_id') AND udt_name IN ('text','uuid'))=2
 THEN 1 ELSE 0 END AS baseline_assertion;
