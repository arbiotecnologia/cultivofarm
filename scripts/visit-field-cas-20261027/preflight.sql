-- READ-ONLY preflight. Run against ref swzpzcwiasxmjutrmvkm only; every row must be ok=true or ABORT.
-- Values reconfirmed LIVE read-only 2026-10-27 ~14:50 UTC.
SELECT 'rpc_hash' k, md5(pg_get_functiondef('public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure))='dc1ff655ba3bf156d38817fbf0c073dd' ok
UNION ALL SELECT 'rpc_definer_owner', (SELECT prosecdef AND pg_get_userbyid(proowner)='postgres' FROM pg_proc WHERE oid='public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure)
UNION ALL SELECT 'rpc_config', (SELECT proconfig::text='{search_path=public}' FROM pg_proc WHERE oid='public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure)
UNION ALL SELECT 'rpc_acl', (SELECT proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' FROM pg_proc WHERE oid='public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure)
UNION ALL SELECT 'rpc_single_overload', (SELECT count(*)=1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_salvar_campo_visita')
UNION ALL SELECT 'guard_hash', md5(pg_get_functiondef('public.visitas_campo_guard()'::regprocedure))='55177f9db09a4d749c200a1801888249'
UNION ALL SELECT 'approval_installed_ref', md5(pg_get_functiondef('public.rpc_enviar_visita_aprovacao(uuid,integer)'::regprocedure))='90f33a1e55d44fbbd8fa9ebc565ba052'
UNION ALL SELECT 'dep_can_manage', md5(pg_get_functiondef('public.can_manage_technical_visit(uuid,uuid)'::regprocedure))='d95c2c2b34af117d467d7d4b2b775002'
UNION ALL SELECT 'dep_has_role_public', md5(pg_get_functiondef('public.has_role(uuid,app_role)'::regprocedure))='4d90e93d521a4819d9085f28d742030f'
UNION ALL SELECT 'dep_has_role_private', md5(pg_get_functiondef('platform_private.has_role(uuid,app_role)'::regprocedure))='c5af5b55de6d79da9b73a33948746ae2'
UNION ALL SELECT 'dep_client_access', md5(pg_get_functiondef('public.has_active_user_cliente_access(uuid,uuid,text[])'::regprocedure))='e099f51d128620e5a68cc3e9001dd976'
UNION ALL SELECT 'dep_editable_status', md5(pg_get_functiondef('public.is_technical_visit_editable_status(text)'::regprocedure))='c326c1a060bf6cd91fedcbca2aa99f15'
UNION ALL SELECT 'dep_content_editable', md5(pg_get_functiondef('public.enforce_technical_content_editable()'::regprocedure))='eb4e8d56cde229056c4730f9742a8f4b'
UNION ALL SELECT 'dep_updated_at', md5(pg_get_functiondef('public.update_updated_at_column()'::regprocedure))='b1930ed5bca3be839f783c6202ab8147'
UNION ALL SELECT 'gate_singleton', (SELECT count(*) FROM cf_user_guards_v1.state WHERE singleton)=1
-- 3 non-internal triggers: technical_content_editable, trg_visitas_campo_guard, trg_visitas_campo_updated_at
UNION ALL SELECT 'visitas_campo_triggers_fp', (SELECT md5(string_agg(t.tgname::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)), E'\n' ORDER BY t.tgname)) FROM pg_trigger t WHERE t.tgrelid='public.visitas_campo'::regclass AND NOT t.tgisinternal)='13dadacab7b70ddbe22cd00d688200b0'
UNION ALL SELECT 'visitas_campo_policies_fp', (SELECT md5(string_agg(polname::text||':'||polcmd::text||':'||polpermissive::text||':'||coalesce(pg_get_expr(polqual,polrelid),'')||':'||coalesce(pg_get_expr(polwithcheck,polrelid),''), E'\n' ORDER BY polname)) FROM pg_policy WHERE polrelid='public.visitas_campo'::regclass)='644e3004ce3f33e709c35b98341b82bf'
UNION ALL SELECT 'data_versions_valid', NOT EXISTS (SELECT 1 FROM public.visitas_campo WHERE versao IS NULL OR versao < 1)
UNION ALL SELECT 'talhoes_fazendas_shape', (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND ((table_name='talhoes' AND column_name='fazenda_id') OR (table_name='fazendas' AND column_name='cliente_id')))
UNION ALL SELECT 'culturas_ativo', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='culturas' AND column_name='ativo')
UNION ALL SELECT 'dep_actor_org_fn', md5(pg_get_functiondef('platform_private.current_user_organization_id()'::regprocedure))='8da1a59de9d58041148b4544ebfbd0a2'
UNION ALL SELECT 'tenant_ref_columns_14', (SELECT count(*)=14 FROM information_schema.columns WHERE table_schema='public' AND ((table_name='talhoes' AND column_name IN ('organization_id','ativo','fazenda_id')) OR (table_name='fazendas' AND column_name IN ('organization_id','ativo','cliente_id')) OR (table_name='clientes' AND column_name='organization_id') OR (table_name='profiles' AND column_name IN ('user_id','ativo','organization_id')) OR (table_name='catalog_tenant_visibility' AND column_name IN ('organization_id','entity_type','cultura_id','hidden'))))
UNION ALL SELECT 'other_triggers_fp', (SELECT md5(string_agg(t.tgname::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)), E'\n' ORDER BY t.tgname)) FROM pg_trigger t WHERE t.tgrelid='public.visitas_campo'::regclass AND NOT t.tgisinternal AND t.tgname<>'trg_visitas_campo_guard')='429799ac94b7a216ca97bc62bc8c3621';
