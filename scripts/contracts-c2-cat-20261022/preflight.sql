-- SELECT only. Executor MUST confirm destination swzpzcwiasxmjutrmvkm.
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,
 md5(pg_get_functiondef(p.oid)) AS md5,p.proacl::text AS acl,pg_get_userbyid(p.proowner) AS owner,
 pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.oid IN ('public.get_my_commercial_partner_projection()'::regprocedure,
 'platform_private.b2b_commercial_partner_projection()'::regprocedure,
 'platform_private.b2b_commercial_context()'::regprocedure,
 'platform_private.b2b_actor_scope(uuid)'::regprocedure,
 'public.is_valid_b2b_partner_user(uuid,uuid)'::regprocedure,
 'platform_private.b2b_phase1_partner_visible(uuid,boolean)'::regprocedure);