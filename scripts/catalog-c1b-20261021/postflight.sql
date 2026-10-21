-- Read-only after independently approved application.
SELECT p.oid::regprocedure,pg_get_function_result(p.oid),p.proacl,p.proconfig,md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE proname IN ('get_partner_catalog_secure','get_partner_catalog_tecnico_secure','c1b_catalog_visibility_scope');
SELECT has_function_privilege('anon','public.get_partner_catalog_secure(uuid,boolean)','EXECUTE') anon_must_be_false,has_function_privilege('authenticated','platform_private.c1b_catalog_visibility_scope(uuid)','EXECUTE') helper_must_be_false;
-- In an existing authenticated session, no JWT fabrication:
SELECT item_id,item_tipo,familia_catalogo,catalog_contract FROM public.get_partner_catalog_tecnico_secure(true);
