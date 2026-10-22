-- Execute under real actor JWT A/B after independent installation only.
SELECT public.get_my_available_portal_contexts();
SELECT public.get_my_commercial_partner_context();
SELECT public.get_my_commercial_partner_projection();
SELECT md5(pg_get_functiondef('platform_private.b2b_actor_scope(uuid)'::regprocedure))='c3f2997746f24bc2efd15db5c0ccc862' AS immutable_scope;
SELECT has_function_privilege('anon','public.link_partner_user(uuid,uuid,text[],text,text,uuid,text)','EXECUTE') AS must_be_false;
