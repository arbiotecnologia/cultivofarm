-- READ-ONLY postflight for the INSTALLED body (auditor migration visit_approval_submit_cas_gate_20261027).
-- Every row must be ok=true. Supersedes postflight.sql (which pinned the never-deployed candidate).
SELECT 'oid' k, 'public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure::oid = 42716 ok
UNION ALL SELECT 'def_hash', md5(pg_get_functiondef(42716::oid))='90f33a1e55d44fbbd8fa9ebc565ba052'
UNION ALL SELECT 'prosrc_hash', (SELECT md5(prosrc) FROM pg_proc WHERE oid=42716)='bfec4ebd4e4681e782a428b70bed0c64'
UNION ALL SELECT 'definer_owner', (SELECT prosecdef AND pg_get_userbyid(proowner)='postgres' FROM pg_proc WHERE oid=42716)
UNION ALL SELECT 'config', (SELECT proconfig::text FROM pg_proc WHERE oid=42716)='{search_path=public,lock_timeout=3s}'
UNION ALL SELECT 'acl', (SELECT proacl::text FROM pg_proc WHERE oid=42716)='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'
UNION ALL SELECT 'trigger_fingerprint_9', (SELECT md5(string_agg(t.tgname||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\n' ORDER BY t.tgname))
   FROM pg_trigger t WHERE t.tgrelid='public.registros_consultor'::regclass AND NOT t.tgisinternal)='94c2571b241a974606d64c14449e2843'
UNION ALL SELECT 'dep_can_manage', md5(pg_get_functiondef('public.can_manage_technical_visit(uuid,uuid)'::regprocedure))='d95c2c2b34af117d467d7d4b2b775002';
