-- READ-ONLY postflight after the auditor applies candidate.sql.review. Every row must be ok=true.
-- Expected hashes were computed on disposable PostgreSQL from the candidate text; if the hosted
-- md5 differs, compare pg_get_functiondef with candidate.sql.review before accepting (do not patch blindly).
SELECT 'rpc_hash_expected' k, md5(pg_get_functiondef('public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure))='2bedc69fc4eca86fbbeef8825437b919' ok
UNION ALL SELECT 'guard_hash_expected', md5(pg_get_functiondef('public.visitas_campo_guard()'::regprocedure))='f69455b72d067d0d96fab74987b4cc4e'
UNION ALL SELECT 'rpc_definer_owner', (SELECT prosecdef AND pg_get_userbyid(proowner)='postgres' FROM pg_proc WHERE oid='public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure)
UNION ALL SELECT 'rpc_config', (SELECT proconfig::text='{search_path=public,lock_timeout=3s}' FROM pg_proc WHERE oid='public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure)
UNION ALL SELECT 'rpc_acl_unchanged', (SELECT proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' FROM pg_proc WHERE oid='public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure)
UNION ALL SELECT 'rpc_body_gate_before_parent', (SELECT strpos(prosrc,'cf_user_guards_v1.state') > 0 AND strpos(prosrc,'cf_user_guards_v1.state') < strpos(prosrc,'FROM public.registros_consultor r') AND strpos(prosrc,'FROM public.registros_consultor r') < strpos(prosrc,'FROM public.visitas_campo') FROM pg_proc WHERE oid='public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure)
UNION ALL SELECT 'rpc_no_cached_admin', (SELECT strpos(prosrc,'v_is_admin') = 0 AND strpos(prosrc,'< v_existing.versao') = 0 FROM pg_proc WHERE oid='public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure)
UNION ALL SELECT 'guard_trigger_insert_update', (SELECT tgtype & 4 = 4 AND tgtype & 16 = 16 AND tgtype & 2 = 2 FROM pg_trigger WHERE tgrelid='public.visitas_campo'::regclass AND tgname='trg_visitas_campo_guard')
UNION ALL SELECT 'other_triggers_unchanged', (SELECT md5(string_agg(t.tgname::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)), E'\n' ORDER BY t.tgname)) FROM pg_trigger t WHERE t.tgrelid='public.visitas_campo'::regclass AND NOT t.tgisinternal AND t.tgname<>'trg_visitas_campo_guard') IS NOT NULL
UNION ALL SELECT 'trigger_count_3', (SELECT count(*)=3 FROM pg_trigger WHERE tgrelid='public.visitas_campo'::regclass AND NOT tgisinternal)
UNION ALL SELECT 'policies_unchanged', (SELECT md5(string_agg(polname::text||':'||polcmd::text||':'||polpermissive::text||':'||coalesce(pg_get_expr(polqual,polrelid),'')||':'||coalesce(pg_get_expr(polwithcheck,polrelid),''), E'\n' ORDER BY polname)) FROM pg_policy WHERE polrelid='public.visitas_campo'::regclass)='644e3004ce3f33e709c35b98341b82bf'
UNION ALL SELECT 'deps_unchanged', md5(pg_get_functiondef('public.can_manage_technical_visit(uuid,uuid)'::regprocedure))='d95c2c2b34af117d467d7d4b2b775002'
   AND md5(pg_get_functiondef('public.has_active_user_cliente_access(uuid,uuid,text[])'::regprocedure))='e099f51d128620e5a68cc3e9001dd976'
   AND md5(pg_get_functiondef('public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure))='90f33a1e55d44fbbd8fa9ebc565ba052'
UNION ALL SELECT 'data_untouched_versions_valid', NOT EXISTS (SELECT 1 FROM public.visitas_campo WHERE versao IS NULL OR versao < 1);
