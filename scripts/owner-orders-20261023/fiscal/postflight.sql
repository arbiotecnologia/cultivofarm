-- SELECT ONLY after independently approved installation; no synthetic login.
SELECT md5(pg_get_functiondef(p.oid))='8bb99a3c335b5f9876d99d988dcf94b0' AS body_unchanged,
 p.proacl::text, NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_denied,
 NOT has_function_privilege('anon',p.oid,'EXECUTE') AS anon_denied,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_preserved,
 has_function_privilege('postgres',p.oid,'EXECUTE') AS owner_preserved
FROM pg_proc p WHERE p.oid='public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date)'::regprocedure;