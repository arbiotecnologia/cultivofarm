DO $pre$ BEGIN
IF md5(pg_get_functiondef('public.rpc_bi_esteira_resumo(timestamp with time zone,timestamp with time zone,uuid,uuid,uuid,uuid,text,text)'::regprocedure)) <> '2972acdfc9e18a5fa430dc413ee9a97a' THEN RAISE EXCEPTION 'FUNCTION_DRIFT'; END IF;
IF md5(pg_get_functiondef('public.rpc_validar_integridade_esteira(text,uuid)'::regprocedure)) <> 'd453515653da35e713255ffe17cf2f73' THEN RAISE EXCEPTION 'FUNCTION_DRIFT'; END IF;
END $pre$;
REVOKE EXECUTE ON FUNCTION public.rpc_bi_esteira_resumo(timestamp with time zone,timestamp with time zone,uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_validar_integridade_esteira(text,uuid) FROM PUBLIC,anon,authenticated;
DO $post$ BEGIN
IF has_function_privilege('authenticated','public.rpc_bi_esteira_resumo(timestamp with time zone,timestamp with time zone,uuid,uuid,uuid,uuid,text,text)','EXECUTE') OR has_function_privilege('anon','public.rpc_bi_esteira_resumo(timestamp with time zone,timestamp with time zone,uuid,uuid,uuid,uuid,text,text)','EXECUTE') OR NOT has_function_privilege('service_role','public.rpc_bi_esteira_resumo(timestamp with time zone,timestamp with time zone,uuid,uuid,uuid,uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'ACL_POSTCONDITION'; END IF;
IF has_function_privilege('authenticated','public.rpc_validar_integridade_esteira(text,uuid)','EXECUTE') OR has_function_privilege('anon','public.rpc_validar_integridade_esteira(text,uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.rpc_validar_integridade_esteira(text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'ACL_POSTCONDITION'; END IF;
END $post$;