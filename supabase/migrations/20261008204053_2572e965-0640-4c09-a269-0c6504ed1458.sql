DO $migration$
DECLARE v_name text; v_oid oid; v_def text; v_anchor text := ' v_org := platform_private.h15_actor_organization();';
 v_guard text := E' IF pg_catalog.jsonb_typeof(auth.jwt()->''iat'') IS DISTINCT FROM ''number'' OR COALESCE(auth.jwt()->>''iat'','''') !~ ''^[0-9]{1,12}$'' THEN RAISE EXCEPTION USING ERRCODE=''42501'', MESSAGE=''EXECUTIVO_SESSION_IAT_REQUIRED''; END IF;\n IF (auth.jwt()->>''iat'')::bigint <= 0 THEN RAISE EXCEPTION USING ERRCODE=''42501'', MESSAGE=''EXECUTIVO_SESSION_IAT_REQUIRED''; END IF;\n';
BEGIN
 FOREACH v_name IN ARRAY ARRAY['rpc_executivo_timeline_operacional','rpc_executivo_gargalos'] LOOP
  v_oid := pg_catalog.to_regprocedure('public.'||v_name||'(jsonb,integer)');
  IF v_oid IS NULL THEN RAISE EXCEPTION 'EXECUTIVO_P1_MISSING_FUNCTION'; END IF;
  v_def := pg_catalog.pg_get_functiondef(v_oid);
  IF pg_catalog.strpos(v_def,'EXECUTIVO_SESSION_IAT_REQUIRED') = 0 THEN
   IF pg_catalog.strpos(v_def,'EXECUTIVO_ACTIVE_ACTOR_TENANT_ROLE_REQUIRED') = 0 OR pg_catalog.strpos(v_def,v_anchor) = 0 THEN RAISE EXCEPTION 'EXECUTIVO_P1_UNEXPECTED_PREDECESSOR'; END IF;
   v_def := pg_catalog.replace(v_def,v_anchor,v_guard||v_anchor);
   EXECUTE v_def;
  END IF;
 END LOOP;
END $migration$;
REVOKE ALL ON FUNCTION public.rpc_executivo_timeline_operacional(jsonb,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_executivo_gargalos(jsonb,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_timeline_operacional(jsonb,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_gargalos(jsonb,integer) TO authenticated, service_role;