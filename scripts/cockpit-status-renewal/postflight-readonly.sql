BEGIN READ ONLY;
DO $guard$ BEGIN
 IF (SELECT project_ref FROM public.fiscal_environment_marker LIMIT 1) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'WRONG_PROJECT'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'::regprocedure) IS DISTINCT FROM '36ef75405315a11e47fee042d6a575cb' THEN RAISE EXCEPTION 'READER_SOURCE_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'::regprocedure AND (prosecdef OR pg_get_userbyid(proowner)<>'postgres' OR proacl::text IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' OR proconfig IS DISTINCT FROM ARRAY['search_path=""'])) THEN RAISE EXCEPTION 'READER_SECURITY_DRIFT'; END IF;
 IF md5(pg_get_functiondef('private.h7n_esteira_laboratorio()'::regprocedure)) IS DISTINCT FROM 'bad38b5200629cc887767e62b7a46e40' OR md5(pg_get_functiondef('public.fn_cockpit_stage(text)'::regprocedure)) IS DISTINCT FROM '1f49fef3faeb479dcc92ed46391ab877' THEN RAISE EXCEPTION 'CHAIN_BODY_DRIFT'; END IF;
 IF md5(pg_get_viewdef('public.vw_esteira_laboratorio'::regclass,true)) IS DISTINCT FROM 'd72d5df7bacffdf8f4fc4282b804ab90' OR md5(pg_get_viewdef('public._src_vw_esteira_laboratorio'::regclass,true)) IS DISTINCT FROM 'c71226f594d27d92833686212415ccec' OR md5(pg_get_viewdef('public.vw_os_integridade_esteira'::regclass,true)) IS DISTINCT FROM 'e8331dbe2bc538cf21fad123fb43f19b' THEN RAISE EXCEPTION 'VIEW_CHAIN_DRIFT'; END IF;
END $guard$;
SELECT '36ef75405315a11e47fee042d6a575cb' AS expected_source_md5;
COMMIT;
