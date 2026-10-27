-- READ-ONLY preflight. Run against ref swzpzcwiasxmjutrmvkm only; every row must be ok=true.
SELECT 'target_hash' k, md5(pg_get_functiondef(p.oid))='d875e3ef00382bfcaa47fb23d0b9022c' ok FROM pg_proc p WHERE p.oid=to_regprocedure('public.rpc_enviar_visita_aprovacao(uuid,integer)')
UNION ALL SELECT 'target_definer_owner', prosecdef AND pg_get_userbyid(proowner)='postgres' FROM pg_proc WHERE oid=to_regprocedure('public.rpc_enviar_visita_aprovacao(uuid,integer)')
UNION ALL SELECT 'target_config', proconfig::text='{search_path=public}' FROM pg_proc WHERE oid=to_regprocedure('public.rpc_enviar_visita_aprovacao(uuid,integer)')
UNION ALL SELECT 'target_acl', proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' FROM pg_proc WHERE oid=to_regprocedure('public.rpc_enviar_visita_aprovacao(uuid,integer)')
UNION ALL SELECT 'dep_can_manage', md5(pg_get_functiondef('public.can_manage_technical_visit(uuid,uuid)'::regprocedure))='d95c2c2b34af117d467d7d4b2b775002'
UNION ALL SELECT 'dep_has_role', md5(pg_get_functiondef('public.has_role(uuid,app_role)'::regprocedure))='4d90e93d521a4819d9085f28d742030f'
UNION ALL SELECT 'dep_client_access', md5(pg_get_functiondef('public.has_active_user_cliente_access(uuid,uuid,text[])'::regprocedure))='e099f51d128620e5a68cc3e9001dd976'
UNION ALL SELECT 'dep_actor_ready', md5(pg_get_functiondef('public.technical_actor_ready(uuid)'::regprocedure))='b5d0994b6eb976b14122cd2a1ec798cf'
UNION ALL SELECT 'gate_singleton', (SELECT count(*) FROM cf_user_guards_v1.state WHERE singleton)=1
UNION ALL SELECT 'registros_triggers_fingerprint_9', (SELECT md5(string_agg(t.tgname||':'||md5(pg_get_triggerdef(t.oid))||':'||md5(pg_get_functiondef(t.tgfoid)),'|' ORDER BY t.tgname)) FROM pg_trigger t WHERE t.tgrelid='public.registros_consultor'::regclass AND NOT t.tgisinternal)='312a766a023f2d86e06d5641a7593f93'
UNION ALL SELECT 'trg_immutability', md5(pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgrelid='public.registros_consultor'::regclass AND tgname='trg_enforce_visit_immutability')))='1fe074b9b0e279b22896b9d718ea8696'
UNION ALL SELECT 'trg_validate_status', md5(pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgrelid='public.registros_consultor'::regclass AND tgname='trg_validate_registro_status')))='e8f0928cae41e22416e0931060071b4a'
UNION ALL SELECT 'trg_plan_preservation', md5(pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgrelid='public.registros_consultor'::regclass AND tgname='trg_visit_plan_preservation')))='b5eb400daf41fe22f205b8885334fe0c'
UNION ALL SELECT 'visitas_logs_no_triggers', (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.visitas_logs'::regclass AND NOT tgisinternal)=0;
