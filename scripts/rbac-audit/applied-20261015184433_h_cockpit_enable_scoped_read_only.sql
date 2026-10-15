DO $pre$
BEGIN
 IF md5(pg_get_functiondef('private.h7n_esteira_laboratorio()'::regprocedure)) <> 'bad38b5200629cc887767e62b7a46e40' OR md5(pg_get_functiondef('public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'::regprocedure)) <> 'c51739eb0d9f91470fa6700d1c19763d' THEN RAISE EXCEPTION 'REVIEWED_READER_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261015183119' AND name='h_cockpit_live_source_tenant_chain_closed') THEN RAISE EXCEPTION 'MISSING_REVIEWED_CHAIN'; END IF;
 IF has_schema_privilege('authenticated','private','USAGE') THEN RAISE EXCEPTION 'PRIVATE_SCHEMA_SCOPE_CHANGED'; END IF;
END $pre$;
REVOKE ALL ON FUNCTION private.h7n_esteira_laboratorio(),public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON public.vw_esteira_laboratorio FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.h7n_esteira_laboratorio(),public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer) TO authenticated;
GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
DO $post$
DECLARE f text;t text;
BEGIN
 IF has_schema_privilege('authenticated','private','USAGE') THEN RAISE EXCEPTION 'PRIVATE_SCHEMA_OPENED'; END IF;
 FOREACH f IN ARRAY ARRAY['public.fn_avancar_etapa_esteira(text,uuid,uuid,text,uuid)','public.lab_request_replanning(uuid,text)','public.refresh_esteira_laboratorio()','public.rpc_gerar_alertas_operacionais()','public.rpc_programar_os_v1(uuid,text,date)','public.rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb)'] LOOP
 IF has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('anon',f,'EXECUTE') THEN RAISE EXCEPTION 'MUTATION_NOT_CONTAINED %',f; END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['public.mv_esteira_laboratorio','public.laboratorio_esteira_eventos','public.cockpit_operacao_idempotencia'] LOOP
 IF has_table_privilege('authenticated',t,'SELECT') OR has_table_privilege('anon',t,'SELECT') THEN RAISE EXCEPTION 'INTERNAL_TABLE_EXPOSED %',t; END IF;
 END LOOP;
 IF has_function_privilege('anon','private.h7n_esteira_laboratorio()','EXECUTE') OR has_function_privilege('anon','public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)','EXECUTE') OR has_table_privilege('anon','public.vw_esteira_laboratorio','SELECT') THEN RAISE EXCEPTION 'ANON_READER_EXPOSED'; END IF;
END $post$;