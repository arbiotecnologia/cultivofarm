-- SELECT ONLY. Require canonical project swzpzcwiasxmjutrmvkm before use.
SELECT project_ref, project_ref='swzpzcwiasxmjutrmvkm' AS ref_ok FROM public.fiscal_environment_marker;
SELECT p.oid::regprocedure AS signature, md5(pg_get_functiondef(p.oid)) AS hash,
       p.proacl::text AS acl, pg_get_userbyid(p.proowner) AS owner,
       md5(pg_get_functiondef(p.oid))='8bb99a3c335b5f9876d99d988dcf94b0'
       AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'
       AND pg_get_userbyid(p.proowner)='postgres' AS preflight_ok
FROM pg_proc p WHERE p.oid='public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date)'::regprocedure;
-- Must remain exactly the sole caller captured in this review, DEFINER/postgres.
SELECT n.nspname, p.proname, p.prosecdef, pg_get_userbyid(p.proowner) AS owner,
       md5(pg_get_functiondef(p.oid)) AS hash, p.proacl::text AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosrc ILIKE '%fn_fiscal_requirement_resolve(%' AND p.proname <> 'fn_fiscal_requirement_resolve';