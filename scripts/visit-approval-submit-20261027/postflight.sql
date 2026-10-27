-- READ-ONLY postflight. Every row must be ok=true. Body hash computed on disposable PG 
-- (expected 9c68ad1dba4dac533629530c5c4155b5); auditor confirms LIVE formatting matches.
SELECT 'body_hash' k, md5(pg_get_functiondef('public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure))='9c68ad1dba4dac533629530c5c4155b5' ok
UNION ALL SELECT 'definer_owner', prosecdef AND pg_get_userbyid(proowner)='postgres' FROM pg_proc WHERE oid='public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure
UNION ALL SELECT 'config', proconfig::text='{search_path=public,lock_timeout=3s}' FROM pg_proc WHERE oid='public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure
UNION ALL SELECT 'acl_unchanged', proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' FROM pg_proc WHERE oid='public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure
UNION ALL SELECT 'no_40001', position('40001' in pg_get_functiondef('public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure))=0
UNION ALL SELECT 'gate_before_row', position('cf_user_guards_v1.state' in pg_get_functiondef('public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure))
   < position('SELECT r.* INTO v_reg' in pg_get_functiondef('public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure))
UNION ALL SELECT 'deps_unchanged', md5(pg_get_functiondef('public.can_manage_technical_visit(uuid,uuid)'::regprocedure))='d95c2c2b34af117d467d7d4b2b775002'
UNION ALL SELECT 'registros_triggers_fingerprint_9', (SELECT md5(string_agg(t.tgname||':'||md5(pg_get_triggerdef(t.oid))||':'||md5(pg_get_functiondef(t.tgfoid)),'|' ORDER BY t.tgname)) FROM pg_trigger t WHERE t.tgrelid='public.registros_consultor'::regclass AND NOT t.tgisinternal)='312a766a023f2d86e06d5641a7593f93';
