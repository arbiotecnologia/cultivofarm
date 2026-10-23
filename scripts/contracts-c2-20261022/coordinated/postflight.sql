-- Execute under real actor JWT A/B after independent installation only.
SELECT public.get_my_available_portal_contexts();
SELECT public.get_my_commercial_partner_context();
SELECT public.get_my_commercial_partner_projection();
SELECT md5(pg_get_functiondef('platform_private.b2b_actor_scope(uuid)'::regprocedure))='c3f2997746f24bc2efd15db5c0ccc862' AS immutable_scope;
SELECT has_function_privilege('anon','public.link_partner_user(uuid,uuid,text[],text,text,uuid,text)','EXECUTE') AS must_be_false;
-- READ ONLY assertion after installation; no JWT/RLS certification.
SELECT 1 / CASE WHEN NOT p.prosecdef AND core.prosecdef
 AND p.proconfig=ARRAY['search_path=""']::text[] AND core.proconfig=ARRAY['search_path=""']::text[]
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',core.oid,'EXECUTE')
 AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 AND NOT has_function_privilege('service_role',core.oid,'EXECUTE')
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND has_function_privilege('authenticated',core.oid,'EXECUTE')
 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(core.proacl,acldefault('f',core.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
 THEN 1 ELSE 0 END AS lifecycle_private_core_acl
FROM pg_proc p CROSS JOIN pg_proc core
WHERE p.oid='public.get_partner_user_lifecycle(uuid,uuid,integer,timestamptz,uuid)'::regprocedure
 AND core.oid='platform_private.get_partner_user_lifecycle(uuid,uuid,integer,timestamptz,uuid)'::regprocedure;
