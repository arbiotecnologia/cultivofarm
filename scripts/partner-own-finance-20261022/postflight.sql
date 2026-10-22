-- READ ONLY structural checks. Positive/negative PostgREST calls need real actor JWT separately.
SELECT p.oid::regprocedure::text signature,p.prosecdef,p.provolatile,p.proconfig,
 pg_get_userbyid(p.proowner) owner,p.proacl::text acl,md5(pg_get_functiondef(p.oid)) md5
FROM pg_proc p WHERE p.oid IN ('public.rpc_portal_partner_financial(uuid,boolean,timestamptz,uuid)'::regprocedure,
 'platform_private.b2b_own_obligations(uuid,timestamptz,uuid)'::regprocedure,
 'platform_private.b2b_own_obligations_owner(uuid)'::regprocedure,
 'platform_private.b2b_commercial_partner_projection()'::regprocedure,
 'public.rpc_portal_partner_financial()'::regprocedure,'public.rpc_portal_partner_financial(uuid)'::regprocedure,
 'platform_private.b2b_actor_scope(uuid)'::regprocedure);
SELECT NOT has_function_privilege('anon','public.rpc_portal_partner_financial(uuid,boolean,timestamptz,uuid)','EXECUTE') anon_denied,
 NOT has_function_privilege('authenticated','public.rpc_portal_partner_financial(uuid)','EXECUTE') legacy_stays_closed,
 has_function_privilege('authenticated','public.rpc_portal_partner_financial(uuid,boolean,timestamptz,uuid)','EXECUTE') invoker_available;